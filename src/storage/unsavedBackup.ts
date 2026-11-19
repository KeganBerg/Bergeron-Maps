import type { MapDocument } from '../model/types';

/**
 * A copy of edits that haven't reached storage yet, kept in this browser so a
 * crash, a closed tab or a dropped connection never loses them. Opening the
 * map again offers to recover it.
 *
 * Small maps go to localStorage, which can be written while the page is
 * closing. A map too big for it (a photo or sketch as the background, or a
 * very large garage) goes to IndexedDB instead, which holds far more. Exactly
 * one of the two holds the current copy, so reading never picks up a stale one.
 */
export interface UnsavedBackup {
  savedAt: string;
  doc: MapDocument;
  /** The stored revision these edits were based on (missing in copies made before 2026-11-19). */
  baseRevision?: number;
}

export const backupKey = (id: string) => `bm.unsaved.${id}`;

const DB_NAME = 'bergeron-maps-unsaved';
const STORE = 'backups';

let dbp: Promise<IDBDatabase | null> | null = null;
function db(): Promise<IDBDatabase | null> {
  dbp ??= new Promise((resolve) => {
    try {
      const open = indexedDB.open(DB_NAME, 1);
      open.onupgradeneeded = () => open.result.createObjectStore(STORE);
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => resolve(null);
      open.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbp;
}

/** IndexedDB writes run one after another, in the order they were asked for. */
let queue: Promise<unknown> = Promise.resolve();
function run<T>(fn: (store: IDBObjectStore) => IDBRequest<T>, mode: IDBTransactionMode): Promise<T | undefined> {
  const next = queue.then(async () => {
    const d = await db();
    if (!d) return undefined;
    return new Promise<T | undefined>((resolve) => {
      try {
        const tx = d.transaction(STORE, mode);
        const r = fn(tx.objectStore(STORE));
        tx.oncomplete = () => resolve(r.result);
        tx.onerror = () => resolve(undefined);
        tx.onabort = () => resolve(undefined);
      } catch {
        resolve(undefined);
      }
    });
  });
  queue = next.catch(() => undefined);
  return next;
}

/** For tests: resolves once every backup write asked for so far has finished. */
export const flushBackups = () => queue.then(() => undefined);

export function writeBackup(doc: MapDocument, baseRevision?: number): void {
  const entry: UnsavedBackup = { savedAt: new Date().toISOString(), doc, baseRevision };
  try {
    localStorage.setItem(backupKey(doc.id), JSON.stringify(entry));
    void run((s) => s.delete(doc.id), 'readwrite');
    return;
  } catch {
    // Too big for localStorage (or it's blocked): never leave an older, smaller copy there.
    try {
      localStorage.removeItem(backupKey(doc.id));
    } catch {
      /* ignore */
    }
  }
  void run((s) => s.put(entry, doc.id), 'readwrite');
}

export function clearBackup(id: string): void {
  try {
    localStorage.removeItem(backupKey(id));
  } catch {
    /* ignore */
  }
  void run((s) => s.delete(id), 'readwrite');
}

export async function readBackup(id: string): Promise<UnsavedBackup | null> {
  try {
    const raw = localStorage.getItem(backupKey(id));
    if (raw) {
      const b = JSON.parse(raw) as UnsavedBackup;
      if (b?.doc?.floors) return b;
    }
  } catch {
    /* damaged copy: try the other store */
  }
  const b = (await run((s) => s.get(id) as IDBRequest<UnsavedBackup | undefined>, 'readonly')) ?? null;
  return b?.doc?.floors ? b : null;
}

/**
 * True when two copies of a map hold the same drawing, ignoring what storage
 * stamps on a save (revision and times). Storage may also hand fields back in a
 * different order (the database sorts JSON keys) and drops empty (undefined)
 * fields, so this compares by value rather than by JSON text.
 */
export function sameMapContent(a: MapDocument, b: MapDocument): boolean {
  const strip = ({ revision: _r, updatedAt: _u, createdAt: _c, ...rest }: MapDocument) => rest;
  return deepEqual(strip(a), strip(b));
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a === 'number' && typeof b === 'number') return a === b || (Number.isNaN(a) && Number.isNaN(b));
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const bb = b as unknown[];
    return a.length === bb.length && a.every((v, i) => deepEqual(v ?? null, bb[i] ?? null));
  }
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const keys = new Set([...Object.keys(ao), ...Object.keys(bo)]);
  for (const k of keys) {
    const x = ao[k];
    const y = bo[k];
    if (x === undefined && y === undefined) continue;
    if (!deepEqual(x, y)) return false;
  }
  return true;
}
