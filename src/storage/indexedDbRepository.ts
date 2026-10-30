import { newId } from '../model/ids';
import { migrateDocument } from '../model/migrate';
import type { MapDocument } from '../model/types';
import {
  ConflictError,
  MAX_AUTO_VERSIONS,
  TRASH_RETENTION_DAYS,
  summarize,
  type MapRepository,
  type MapSummary,
  type VersionMeta,
  type VersionReason,
} from './repository';

interface MapRecord {
  id: string;
  doc: MapDocument;
  deletedAt?: string;
}

interface VersionRecord extends VersionMeta {
  doc: MapDocument;
}

const DB_VERSION = 1;

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Save was interrupted.'));
  });
}

const clone = <T>(v: T): T => structuredClone(v);

/** Browser-local storage. Data stays on this device until Phase 2 adds the server. */
export class IndexedDbRepository implements MapRepository {
  private dbp: Promise<IDBDatabase> | null = null;

  constructor(private readonly dbName = 'bergeron-maps') {}

  private db(): Promise<IDBDatabase> {
    this.dbp ??= new Promise((resolve, reject) => {
      const open = indexedDB.open(this.dbName, DB_VERSION);
      open.onupgradeneeded = () => {
        const db = open.result;
        if (!db.objectStoreNames.contains('maps')) db.createObjectStore('maps', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('versions')) {
          const v = db.createObjectStore('versions', { keyPath: 'id' });
          v.createIndex('mapId', 'mapId');
        }
      };
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    return this.dbp;
  }

  private async all(): Promise<MapRecord[]> {
    const db = await this.db();
    return req(db.transaction('maps').objectStore('maps').getAll() as IDBRequest<MapRecord[]>);
  }

  async listMaps(): Promise<MapSummary[]> {
    return (await this.all())
      .filter((r) => !r.deletedAt)
      .map((r) => summarize(r.doc))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async listTrash(): Promise<MapSummary[]> {
    return (await this.all())
      .filter((r) => r.deletedAt)
      .map((r) => summarize(r.doc, r.deletedAt))
      .sort((a, b) => b.deletedAt!.localeCompare(a.deletedAt!));
  }

  async getMap(id: string): Promise<MapDocument | null> {
    const db = await this.db();
    const r = (await req(db.transaction('maps').objectStore('maps').get(id))) as MapRecord | undefined;
    if (!r || r.deletedAt) return null;
    return migrateDocument(r.doc);
  }

  async createMap(doc: MapDocument): Promise<MapDocument> {
    const db = await this.db();
    const tx = db.transaction('maps', 'readwrite');
    const stored = { ...clone(doc), revision: 1 };
    tx.objectStore('maps').add({ id: doc.id, doc: stored } satisfies MapRecord);
    await done(tx);
    return stored;
  }

  async saveMap(doc: MapDocument, baseRevision: number): Promise<MapDocument> {
    const db = await this.db();
    // Read-check-write inside one readwrite transaction, so two tabs saving at
    // once cannot both pass the revision check.
    const tx = db.transaction('maps', 'readwrite');
    const store = tx.objectStore('maps');
    const current = (await req(store.get(doc.id))) as MapRecord | undefined;
    if (!current) {
      tx.abort();
      throw new Error('This map no longer exists. It may have been deleted.');
    }
    if (current.doc.revision !== baseRevision) {
      tx.abort();
      throw new ConflictError(migrateDocument(current.doc));
    }
    const stored: MapDocument = { ...clone(doc), revision: baseRevision + 1, updatedAt: new Date().toISOString() };
    store.put({ ...current, doc: stored } satisfies MapRecord);
    await done(tx);
    return stored;
  }

  private async setDeleted(id: string, deletedAt: string | undefined): Promise<void> {
    const db = await this.db();
    const tx = db.transaction('maps', 'readwrite');
    const store = tx.objectStore('maps');
    const r = (await req(store.get(id))) as MapRecord | undefined;
    if (r) store.put({ ...r, deletedAt });
    await done(tx);
  }

  trashMap(id: string) {
    return this.setDeleted(id, new Date().toISOString());
  }

  restoreMap(id: string) {
    return this.setDeleted(id, undefined);
  }

  async purgeMap(id: string): Promise<void> {
    const db = await this.db();
    const tx = db.transaction(['maps', 'versions'], 'readwrite');
    tx.objectStore('maps').delete(id);
    const versions = tx.objectStore('versions');
    const keys = await req(versions.index('mapId').getAllKeys(id));
    for (const k of keys) versions.delete(k);
    await done(tx);
  }

  async purgeExpiredTrash(now = new Date()): Promise<number> {
    const cutoff = now.getTime() - TRASH_RETENTION_DAYS * 86400_000;
    const expired = (await this.all()).filter((r) => r.deletedAt && Date.parse(r.deletedAt) < cutoff);
    for (const r of expired) await this.purgeMap(r.id);
    return expired.length;
  }

  async saveVersion(doc: MapDocument, reason: VersionReason, label?: string): Promise<VersionMeta> {
    const db = await this.db();
    const meta: VersionMeta = {
      id: newId('ver'),
      mapId: doc.id,
      createdAt: new Date().toISOString(),
      reason,
      label: label ?? defaultLabel(reason),
      revision: doc.revision,
    };
    const tx = db.transaction('versions', 'readwrite');
    const store = tx.objectStore('versions');
    store.put({ ...meta, doc: clone(doc) } satisfies VersionRecord);
    // Keep the newest automatic versions; named/manual versions are kept.
    const all = (await req(store.index('mapId').getAll(doc.id))) as VersionRecord[];
    const autos = all.filter((v) => v.reason === 'auto').sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    for (const v of autos.slice(MAX_AUTO_VERSIONS)) store.delete(v.id);
    await done(tx);
    return meta;
  }

  async listVersions(mapId: string): Promise<VersionMeta[]> {
    const db = await this.db();
    const all = (await req(db.transaction('versions').objectStore('versions').index('mapId').getAll(mapId))) as VersionRecord[];
    return all
      .map(({ doc: _doc, ...meta }) => meta)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async getVersion(versionId: string): Promise<MapDocument | null> {
    const db = await this.db();
    const r = (await req(db.transaction('versions').objectStore('versions').get(versionId))) as VersionRecord | undefined;
    return r ? migrateDocument(r.doc) : null;
  }
}

function defaultLabel(reason: VersionReason): string {
  switch (reason) {
    case 'auto': return 'Automatic save point';
    case 'manual': return 'Saved version';
    case 'before-restore': return 'Before restoring an older version';
    case 'conflict': return 'Your changes (kept during a conflict)';
  }
}

export const repository: MapRepository = new IndexedDbRepository();
