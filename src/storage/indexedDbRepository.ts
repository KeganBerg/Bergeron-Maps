import { newId } from '../model/ids';
import { migrateDocument } from '../model/migrate';
import type { MapDocument } from '../model/types';
import {
  ConflictError,
  MAX_AUTO_VERSIONS,
  SITE_LIVE_MAPS,
  SITE_MAP_SLOTS,
  TRASH_RETENTION_DAYS,
  firstFreeSlot,
  liveFullMessage,
  slotsFullMessage,
  summarize,
  type MapRepository,
  type MapSummary,
  type PublishInfo,
  type VersionMeta,
  type VersionReason,
} from './repository';

interface MapRecord {
  id: string;
  doc: MapDocument;
  deletedAt?: string;
  site?: string;
  published?: MapDocument;
  publish?: PublishInfo;
  slot?: number;
}

const siteOf = (r: MapRecord) => r.site?.trim() || r.doc.name;
const active = (all: MapRecord[], site: string, except?: string) =>
  all.filter((r) => !r.deletedAt && r.id !== except && siteOf(r) === site);

/** Checks that `r` may arrive at `site` (new, moved or restored) and gives it a free slot there. */
function placeAt(all: MapRecord[], r: MapRecord, site: string, wanted?: number): MapRecord {
  const others = active(all, site, r.id);
  const slot = others.length < SITE_MAP_SLOTS ? firstFreeSlot(others.map((o) => o.slot), wanted) : null;
  if (!slot) throw new Error(slotsFullMessage(site));
  if (r.publish && others.filter((o) => o.publish).length >= SITE_LIVE_MAPS) throw new Error(`“${site}” already has ${SITE_LIVE_MAPS} live maps, the most a site can have. Take one offline first.`);
  return { ...r, site, slot, deletedAt: undefined };
}

/** Maps saved before slots existed get the lowest free slot at their site, oldest first. */
function withSlots(all: MapRecord[]): MapRecord[] {
  const changed: MapRecord[] = [];
  const live = all.filter((r) => !r.deletedAt).sort((a, b) => a.doc.createdAt.localeCompare(b.doc.createdAt));
  for (const r of live) {
    const others = active(all, siteOf(r), r.id);
    if (r.slot && !others.some((o) => o.slot === r.slot)) continue;
    const slot = firstFreeSlot(others.map((o) => o.slot));
    if (!slot || slot === r.slot) continue;
    r.slot = slot;
    changed.push(r);
  }
  return changed;
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

  /** Runs `fn` over every stored map inside one readwrite transaction, then stores what it returns. */
  private async change<T>(fn: (all: MapRecord[]) => { put: MapRecord[]; result: T }): Promise<T> {
    const db = await this.db();
    const tx = db.transaction('maps', 'readwrite');
    const store = tx.objectStore('maps');
    const all = (await req(store.getAll())) as MapRecord[];
    let out: { put: MapRecord[]; result: T };
    try {
      out = fn(all);
    } catch (e) {
      tx.abort();
      throw e;
    }
    for (const r of out.put) store.put(r);
    await done(tx);
    return out.result;
  }

  async listMaps(): Promise<MapSummary[]> {
    const fresh = await this.change((all) => ({ put: withSlots(all), result: all }));
    return fresh
      .filter((r) => !r.deletedAt)
      .map((r) => summarize(r.doc, undefined, { ...r, site: siteOf(r) }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async listTrash(): Promise<MapSummary[]> {
    return (await this.all())
      .filter((r) => r.deletedAt)
      .map((r) => summarize(r.doc, r.deletedAt, r))
      .sort((a, b) => b.deletedAt!.localeCompare(a.deletedAt!));
  }

  async getMap(id: string): Promise<MapDocument | null> {
    const db = await this.db();
    const r = (await req(db.transaction('maps').objectStore('maps').get(id))) as MapRecord | undefined;
    if (!r || r.deletedAt) return null;
    return migrateDocument(r.doc);
  }

  async createMap(doc: MapDocument, site?: string, slot?: number): Promise<MapDocument> {
    const stored = { ...clone(doc), revision: 1 };
    const name = site?.trim() || doc.name;
    return this.change((all) => {
      if (all.some((r) => r.id === doc.id)) throw new Error('A map with this id already exists.');
      const fixed = withSlots(all);
      return { put: [...fixed, placeAt(all, { id: doc.id, doc: stored }, name, slot)], result: stored };
    });
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

  private async record(id: string): Promise<MapRecord | undefined> {
    const db = await this.db();
    return (await req(db.transaction('maps').objectStore('maps').get(id))) as MapRecord | undefined;
  }

  private async update(id: string, fn: (r: MapRecord) => MapRecord): Promise<MapRecord> {
    const db = await this.db();
    const tx = db.transaction('maps', 'readwrite');
    const store = tx.objectStore('maps');
    const r = (await req(store.get(id))) as MapRecord | undefined;
    if (!r || r.deletedAt) {
      tx.abort();
      throw new Error('This map no longer exists. It may have been deleted.');
    }
    const next = fn(r);
    store.put(next);
    await done(tx);
    return next;
  }

  async moveToSite(id: string, site: string): Promise<void> {
    const name = site.trim();
    if (!name) throw new Error('Enter a site name.');
    await this.change((all) => {
      const r = all.find((x) => x.id === id && !x.deletedAt);
      if (!r) throw new Error('This map no longer exists. It may have been deleted.');
      if (siteOf(r) === name) return { put: [], result: undefined };
      const fixed = withSlots(all).filter((x) => x.id !== id);
      return { put: [...fixed, placeAt(all, r, name)], result: undefined };
    });
  }

  async publishMap(id: string): Promise<PublishInfo> {
    await this.change((all) => {
      const r = all.find((x) => x.id === id && !x.deletedAt);
      if (r && !r.publish && active(all, siteOf(r), id).filter((o) => o.publish).length >= SITE_LIVE_MAPS) {
        throw new Error(liveFullMessage(siteOf(r)));
      }
      return { put: [], result: undefined };
    });
    const r = await this.update(id, (r) => ({
      ...r,
      published: clone(r.doc),
      publish: { publishedAt: new Date().toISOString(), publishedRevision: r.doc.revision },
    }));
    await this.saveVersion(r.doc, 'publish');
    return r.publish!;
  }

  async unpublishMap(id: string): Promise<void> {
    await this.update(id, ({ published: _p, publish: _i, ...r }) => r);
  }

  async getPublishInfo(id: string): Promise<PublishInfo | null> {
    return (await this.record(id))?.publish ?? null;
  }

  async getPublishedMap(id: string): Promise<(MapDocument & { publishedAt: string }) | null> {
    const r = await this.record(id);
    if (!r || r.deletedAt || !r.published || !r.publish) return null;
    return { ...migrateDocument(r.published), publishedAt: r.publish.publishedAt };
  }

  /** A map in the trash gives its slot back. */
  async trashMap(id: string): Promise<void> {
    await this.change((all) => {
      const r = all.find((x) => x.id === id);
      return { put: r ? [{ ...r, deletedAt: new Date().toISOString(), slot: undefined }] : [], result: undefined };
    });
  }

  /** Restoring needs a free slot at the map's site (and room for it to be live, if it was). */
  async restoreMap(id: string): Promise<void> {
    await this.change((all) => {
      const r = all.find((x) => x.id === id);
      if (!r || !r.deletedAt) return { put: [], result: undefined };
      const fixed = withSlots(all);
      return { put: [...fixed, placeAt(all, r, siteOf(r))], result: undefined };
    });
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
    case 'publish': return 'Published to employees';
  }
}

export const repository: MapRepository = new IndexedDbRepository();
