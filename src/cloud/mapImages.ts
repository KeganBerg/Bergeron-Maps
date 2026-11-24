import type { Db } from './db';
import type { MapDocument } from '../model/types';

/**
 * Map pictures (background site plans and imported image objects) live in
 * Supabase Storage, not inside the map. The map keeps only the picture's
 * address, so a save, a saved version and a published copy each carry a short
 * link instead of megabytes of picture.
 *
 * Files are stored as `<company id>/<fingerprint>.<type>` in the public
 * `map-images` bucket. The fingerprint (SHA-256 of the picture as a data URL)
 * makes the address impossible to guess and means the same picture is only
 * ever stored once per company. Anyone with an address can load the picture
 * (that is how employees and public links see maps without signing in);
 * only people who can edit a company's maps can add pictures to its folder.
 *
 * Map files and backups stay self-contained: pictures are put back inside
 * them on the way out (inlineImages) and uploaded again on the way in.
 */
export const IMAGE_BUCKET = 'map-images';

const INLINE = /^data:(image\/(?:png|jpeg|webp|gif));base64,/;
const EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };
const STORED = new RegExp(`/storage/v1/object/public/${IMAGE_BUCKET}/([0-9a-f-]{36}/[0-9a-f]{64}\\.(?:png|jpg|webp|gif))$`);

/** A picture held inside the map that belongs in file storage. SVG drawings stay inside (they are small, and kept off the storage domain). */
export const isInlineImage = (src: string) => INLINE.test(src);

/** The storage path (`<company>/<file>`) of one of our stored pictures, or null for anything else. */
export function storedImagePath(src: string): string | null {
  return /^https:\/\//.test(src) ? STORED.exec(src)?.[1] ?? null : null;
}

type Floorish = { background?: { src?: unknown }; objects?: { imageSrc?: unknown }[] };

/** Every distinct picture source in a map (or anything shaped like one, such as a backup's copy). */
export function imageSources(doc: unknown): string[] {
  const out = new Set<string>();
  const floors = (doc as { floors?: unknown } | null)?.floors;
  if (!Array.isArray(floors)) return [];
  for (const f of floors as Floorish[]) {
    if (typeof f?.background?.src === 'string') out.add(f.background.src);
    if (Array.isArray(f?.objects)) for (const o of f.objects) if (typeof o?.imageSrc === 'string') out.add(o.imageSrc);
  }
  return [...out];
}

/**
 * A copy of the map with picture sources swapped by `swap` (undefined = keep).
 * Floors and objects that don't change are shared with the original, and the
 * original comes back as is when nothing changes.
 */
export function swapImageSources<T extends MapDocument>(doc: T, swap: (src: string) => string | undefined): T {
  if (!Array.isArray(doc?.floors)) return doc;
  let changed = false;
  const floors = doc.floors.map((f) => {
    if (!f || !Array.isArray(f.objects)) return f;
    const bg = f.background && swap(f.background.src);
    let objChanged = false;
    const objects = f.objects.map((o) => {
      const to = o.kind === 'asset' && o.imageSrc ? swap(o.imageSrc) : undefined;
      if (to === undefined || o.kind !== 'asset' || to === o.imageSrc) return o;
      objChanged = true;
      return { ...o, imageSrc: to };
    });
    if ((bg === undefined || bg === f.background!.src) && !objChanged) return f;
    changed = true;
    return { ...f, ...(bg !== undefined && f.background ? { background: { ...f.background, src: bg } } : {}), objects };
  });
  return changed ? { ...doc, floors } : doc;
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** The picture in a base64 data URL as a file. (fetch() can't do this: the page's security policy blocks data: requests.) */
export function dataUrlToBlob(src: string): Blob {
  const m = INLINE.exec(src);
  if (!m) throw new Error('Not a picture inside the map.');
  const bin = atob(src.slice(m[0].length));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: m[1] });
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('A picture couldn’t be read.'));
    r.readAsDataURL(blob);
  });
}

/** Downloads one of our stored pictures and gives it back as a data URL. */
export async function fetchImageAsDataUrl(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`A picture in this map couldn’t be downloaded (${res.status}).`);
  const blob = await res.blob();
  // Storage reports the type it was given; fall back to the file name if it says nothing useful.
  const type = /^image\/(png|jpeg|webp|gif)$/.test(blob.type) ? blob.type : `image/${({ jpg: 'jpeg' } as Record<string, string>)[url.split('.').pop()!] ?? url.split('.').pop()}`;
  return blobToDataUrl(blob.type === type ? blob : new Blob([blob], { type }));
}

/** Stored address for each data URL already uploaded this visit, so autosave doesn't fingerprint a picture again. */
const known = new Map<string, string>();
const inFlight = new Map<string, Promise<string>>();
/** Set once the bucket turns out not to exist yet (the SQL step hasn't run): pictures then stay inside maps, as before. */
let storageMissing = false;
const MISSING = /bucket not found/i;

/** For tests. */
export function resetImageCache() {
  known.clear();
  inFlight.clear();
  storageMissing = false;
}

/** A map with every picture this visit already uploaded swapped for its stored address (no network). */
export function swapKnownImages<T extends MapDocument>(doc: T): T {
  return known.size ? swapImageSources(doc, (s) => known.get(s)) : doc;
}

/**
 * Puts one picture in the company's storage folder and gives back its address.
 * Pictures already stored for this company come straight back; a picture
 * stored for another company (pasted or imported from one) is copied, so it
 * doesn't vanish if that company is ever deleted. Anything else (SVG drawings,
 * empty sources) is returned unchanged.
 */
export function storeImage(db: Db, companyId: string, src: string): Promise<string> {
  const path = storedImagePath(src);
  if (path?.startsWith(`${companyId}/`)) return Promise.resolve(src);
  if (!path && !isInlineImage(src)) return Promise.resolve(src);
  const hit = known.get(src);
  if (hit?.includes(`/${companyId}/`)) return Promise.resolve(hit);
  if (storageMissing && !path) return Promise.resolve(src);
  const key = `${companyId} ${src}`;
  const running = inFlight.get(key);
  if (running) return running;
  const job = (async () => {
    const dataUrl = path ? await fetchImageAsDataUrl(src) : src;
    const type = INLINE.exec(dataUrl)?.[1];
    if (!type) return src;
    const file = `${companyId}/${await sha256Hex(dataUrl)}.${EXT[type]}`;
    try {
      await db.storage.upload(IMAGE_BUCKET, file, dataUrlToBlob(dataUrl), type);
    } catch (e) {
      if (!path && MISSING.test((e as Error).message)) {
        storageMissing = true;
        return src;
      }
      throw e;
    }
    const url = db.storage.publicUrl(IMAGE_BUCKET, file);
    known.set(src, url);
    return url;
  })().finally(() => inFlight.delete(key));
  inFlight.set(key, job);
  return job;
}

/** The map with every picture moved to the company's storage folder. */
export async function storeImages<T extends MapDocument>(db: Db, companyId: string, doc: T): Promise<T> {
  const srcs = imageSources(doc).filter((s) => isInlineImage(s) || (storedImagePath(s) !== null && !s.includes(`/${companyId}/`)));
  if (!srcs.length) return doc;
  const urls = new Map<string, string>();
  for (const s of srcs) urls.set(s, await storeImage(db, companyId, s));
  return swapImageSources(doc, (s) => urls.get(s));
}

/**
 * The map with stored pictures pointing at this Supabase project's file
 * storage. Only matters after a move to a new project: a backup's maps still
 * name the old project, and their pictures are uploaded to the new one.
 */
export function rehomeImages<T extends MapDocument>(db: Db, doc: T): T {
  return swapImageSources(doc, (s) => {
    const path = storedImagePath(s);
    return path ? db.storage.publicUrl(IMAGE_BUCKET, path) : undefined;
  });
}

/** The map with stored pictures put back inside it, so a map file works on its own (any browser, any account). */
export async function inlineImages<T extends MapDocument>(doc: T, load = fetchImageAsDataUrl): Promise<T> {
  const srcs = imageSources(doc).filter((s) => storedImagePath(s) !== null);
  if (!srcs.length) return doc;
  const data = new Map<string, string>();
  for (const s of srcs) data.set(s, await load(s));
  return swapImageSources(doc, (s) => data.get(s));
}

/**
 * Admins: moves every picture still held inside saved copies of maps (published
 * copies and saved versions) into file storage, and points those copies at the
 * stored file. Runs on its own in the background when an admin opens All
 * accounts (runPictureMoveOnce), so nobody has to press anything.
 *
 * The database stops any request after 8 seconds, so each request reads or
 * writes one copy only. Working copies are left alone: the app moves their
 * pictures on the next save, and changing them here would get in the way of
 * someone editing. Safe to run again: copies already moved are skipped.
 */
export async function moveInlineImages(db: Db, onStep?: (text: string) => void): Promise<{ pictures: number; copies: number }> {
  const call = async <T>(fn: string, args?: Record<string, unknown>): Promise<T> => {
    const r = await db.rpc(fn, args);
    if (r.error) {
      if (/function|schema cache/i.test(r.error.message) && r.error.message.includes(fn)) throw new Error(MOVE_NEEDS_SQL);
      throw new Error(r.error.message);
    }
    return r.data as T;
  };
  onStep?.('Listing maps');
  const maps: { id: string; company_id: string; name: string }[] = [];
  for (let from = 0; ; from += 1000) {
    const r = await db.from('maps').select('id, company_id, name').order('id').range(from, from + 999);
    if (r.error) throw new Error(r.error.message);
    const page = r.data as unknown as typeof maps;
    maps.push(...page);
    if (page.length < 1000) break;
  }
  /** Stored address of each picture already moved, by company and fingerprint. */
  const stored = new Map<string, Map<string, string>>();
  let pictures = 0;
  let copies = 0;
  for (const [i, m] of maps.entries()) {
    onStep?.(`Map ${i + 1} of ${maps.length} (${m.name})`);
    const company = stored.get(m.company_id) ?? new Map<string, string>();
    stored.set(m.company_id, company);
    const list = await call<{ kind: string; id: string }[]>('admin_map_copies', { p_map: m.id });
    for (const copy of list) {
      const move = () => call<string[]>('admin_move_copy_images', {
        p_kind: copy.kind, p_id: copy.id, p_hashes: [...company.keys()], p_urls: [...company.values()],
      });
      const left = await move();
      if (!left.length) continue;
      for (const hash of left) {
        const src = await call<string | null>('admin_copy_inline_image', { p_kind: copy.kind, p_id: copy.id, p_hash: hash });
        if (!src) continue;
        const url = await storeImage(db, m.company_id, src);
        if (url === src) throw new Error('File storage isn’t set up yet (the step 16 SQL, map pictures).');
        company.set(hash, url);
        pictures++;
      }
      // Hashes the app couldn't match stay inside; the next run tries them again.
      await move();
      copies++;
    }
  }
  return { pictures, copies };
}

export const MOVE_NEEDS_SQL = 'Moving pictures needs the step 20 SQL (map pictures, one saved copy at a time).';

const MOVED_KEY = 'bm-map-pictures-moved';
let moving: Promise<void> | null = null;

/**
 * Admins: runs moveInlineImages once per browser, quietly. Once a run finishes
 * nothing is left to move (new saves already use file storage), so it isn't
 * repeated. If a run stops partway it starts again on the next visit and skips
 * what is already done.
 */
export function runPictureMoveOnce(db: Db, store: Pick<Storage, 'getItem' | 'setItem'> | null = safeLocalStorage()): Promise<void> {
  if (moving) return moving;
  try {
    if (store?.getItem(MOVED_KEY)) return Promise.resolve();
  } catch {
    // Storage blocked: run anyway; it is safe to repeat.
  }
  moving = moveInlineImages(db)
    .then(() => {
      try {
        store?.setItem(MOVED_KEY, new Date().toISOString());
      } catch {
        // Not remembered: the next visit checks again, which is harmless.
      }
    })
    .catch((e) => console.warn('Map pictures will be moved to file storage on a later visit:', (e as Error).message))
    .finally(() => { moving = null; });
  return moving;
}

function safeLocalStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** Admins: deletes a company's stored pictures (after the company itself is deleted). */
export async function removeCompanyImages(db: Db, companyId: string): Promise<void> {
  for (let round = 0; round < 50; round++) {
    const names = await db.storage.list(IMAGE_BUCKET, `${companyId}/`);
    const files = names.filter((n) => n && !n.endsWith('/') && n !== '.emptyFolderPlaceholder');
    if (!files.length) return;
    await db.storage.remove(IMAGE_BUCKET, files.map((n) => `${companyId}/${n}`));
  }
}
