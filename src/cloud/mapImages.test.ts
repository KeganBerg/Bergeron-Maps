import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Db, Storage } from './db';
import { createMap } from '../model/factory';
import type { AssetObject, MapDocument } from '../model/types';
import { backupImages, restoreImages, type BackupCompany, type BackupMap } from './backup';
import {
  dataUrlToBlob, imageSources, inlineImages, isInlineImage, moveInlineImages, rehomeImages, resetImageCache, storedImagePath,
  storeImage, storeImages, swapKnownImages,
} from './mapImages';
import { sameMapContent } from '../storage/unsavedBackup';

const CO = '11111111-2222-3333-4444-555555555555';
const OTHER = '99999999-2222-3333-4444-555555555555';
const PNG = 'data:image/png;base64,' + btoa('png bytes '.repeat(50));
const JPG = 'data:image/jpeg;base64,' + btoa('jpg bytes '.repeat(50));
const SVG = 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=';
const sha = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');
const BASE = 'https://abcd.supabase.co/storage/v1/';
const stored = (company: string, src: string, ext: string) => `${BASE}object/public/map-images/${company}/${sha(src)}.${ext}`;

function fakeDb(opts: { missing?: boolean; rpc?: Db['rpc'] } = {}) {
  const files = new Map<string, Blob>();
  const storage: Storage = {
    publicUrl: (bucket, path) => `${BASE}object/public/${bucket}/${path}`,
    upload: vi.fn(async (_b: string, path: string, body: Blob) => {
      if (opts.missing) throw new Error('Bucket not found');
      files.set(path, body);
    }),
    list: async () => [],
    remove: async () => {},
  };
  return { db: { storage, rpc: opts.rpc } as unknown as Db, files, storage };
}

function mapWith(bg: string | undefined, ...images: string[]): MapDocument {
  const doc = createMap('Garage');
  const f = doc.floors[0];
  if (bg) f.background = { layerId: f.layers[0].id, src: bg, x: 0, y: 0, width: 100, height: 80, opacity: 0.6 };
  f.objects = images.map((src, i) => ({
    id: `img${i}`, kind: 'asset', assetKey: 'import-image', imageSrc: src, layerId: f.layers[0].id, x: 0, y: 0, width: 10, height: 10, rotation: 0,
  }) as AssetObject);
  return doc;
}
const srcOf = (doc: MapDocument, i: number) => (doc.floors[0].objects[i] as AssetObject).imageSrc;

beforeEach(() => resetImageCache());

/** jsdom's Blob has no text(). */
const text = (b: Blob) => new Promise<string>((res) => {
  const r = new FileReader();
  r.onload = () => res(String(r.result));
  r.readAsText(b);
});

describe('map pictures', () => {
  it('knows which sources are pictures inside the map and which are stored files', () => {
    expect(isInlineImage(PNG)).toBe(true);
    expect(isInlineImage(SVG)).toBe(false);
    expect(storedImagePath(stored(CO, PNG, 'png'))).toBe(`${CO}/${sha(PNG)}.png`);
    expect(storedImagePath('https://example.com/x.png')).toBeNull();
    expect(storedImagePath(`http://abcd.supabase.co/storage/v1/object/public/map-images/${CO}/${sha(PNG)}.png`)).toBeNull();
    expect(imageSources(mapWith(PNG, JPG, JPG, SVG))).toEqual([PNG, JPG, SVG]);
    expect(imageSources({ nothing: true })).toEqual([]);
  });

  it('decodes a data URL to the picture’s bytes', async () => {
    const blob = dataUrlToBlob(PNG);
    expect(blob.type).toBe('image/png');
    expect(await text(blob)).toBe('png bytes '.repeat(50));
  });

  it('uploads each picture once, named by its fingerprint, and leaves SVG drawings inside', async () => {
    const { db, files, storage } = fakeDb();
    const doc = mapWith(PNG, JPG, SVG, PNG);
    const out = await storeImages(db, CO, doc);
    expect(out.floors[0].background!.src).toBe(stored(CO, PNG, 'png'));
    expect(srcOf(out, 0)).toBe(stored(CO, JPG, 'jpg'));
    expect(srcOf(out, 1)).toBe(SVG);
    expect(srcOf(out, 2)).toBe(stored(CO, PNG, 'png'));
    expect([...files.keys()].sort()).toEqual([`${CO}/${sha(JPG)}.jpg`, `${CO}/${sha(PNG)}.png`].sort());
    expect(storage.upload).toHaveBeenCalledTimes(2);
    // The original isn't touched, and saving the same map again uploads nothing.
    expect(doc.floors[0].background!.src).toBe(PNG);
    await storeImages(db, CO, doc);
    expect(storage.upload).toHaveBeenCalledTimes(2);
    // A map with nothing to move comes back as the same object.
    expect(await storeImages(db, CO, out)).toBe(out);
  });

  it('treats the stored copy as the same map, so a save whose answer was lost isn’t taken for a conflict', async () => {
    const { db } = fakeDb();
    const doc = mapWith(PNG);
    const out = await storeImages(db, CO, doc);
    expect(sameMapContent(doc, out)).toBe(true);
    expect(swapKnownImages(doc).floors[0].background!.src).toBe(stored(CO, PNG, 'png'));
    expect(sameMapContent(mapWith(JPG), out)).toBe(false);
  });

  it('keeps pictures inside the map while file storage isn’t set up yet', async () => {
    const { db, storage } = fakeDb({ missing: true });
    const doc = mapWith(PNG);
    expect(await storeImages(db, CO, doc)).toBe(doc);
    expect(await storeImage(db, CO, JPG)).toBe(JPG);
    expect(storage.upload).toHaveBeenCalledTimes(1);
  });

  it('copies a picture from another company’s folder into this one', async () => {
    const { db, files } = fakeDb();
    const foreign = stored(OTHER, PNG, 'png');
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, blob: async () => dataUrlToBlob(PNG) })));
    try {
      const out = await storeImages(db, CO, mapWith(foreign));
      expect(out.floors[0].background!.src).toBe(stored(CO, PNG, 'png'));
      expect([...files.keys()]).toEqual([`${CO}/${sha(PNG)}.png`]);
      // Already this company's: nothing to do.
      expect(await storeImage(db, CO, out.floors[0].background!.src)).toBe(out.floors[0].background!.src);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('points pictures at this project’s file storage after a move to a new project', () => {
    const { db } = fakeDb();
    const old = `https://old.supabase.co/storage/v1/object/public/map-images/${CO}/${sha(PNG)}.png`;
    const out = rehomeImages(db, mapWith(old, SVG));
    expect(out.floors[0].background!.src).toBe(stored(CO, PNG, 'png'));
    expect(srcOf(out, 0)).toBe(SVG);
  });

  it('puts stored pictures back inside a map file', async () => {
    const url = stored(CO, PNG, 'png');
    const load = vi.fn(async () => PNG);
    const out = await inlineImages(mapWith(url, url, SVG), load);
    expect(out.floors[0].background!.src).toBe(PNG);
    expect(srcOf(out, 0)).toBe(PNG);
    expect(srcOf(out, 1)).toBe(SVG);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('moves pictures already inside maps (admins), one map at a time, versions in batches', async () => {
    const calls: [string, Record<string, unknown> | undefined][] = [];
    let swaps = [10, 4, 0];
    const rpc = vi.fn(async (fn: string, args?: Record<string, unknown>) => {
      calls.push([fn, args]);
      if (fn === 'admin_map_inline_images') return { data: args!.p_map === 'm1' ? [{ hash: sha(PNG) }] : [], error: null };
      if (fn === 'admin_map_inline_image') return { data: PNG, error: null };
      return { data: swaps.shift(), error: null };
    });
    const from = () => ({ select: () => ({ order: () => ({ range: async () => ({
      data: [{ id: 'm1', company_id: CO, name: 'Garage' }, { id: 'm2', company_id: CO, name: 'Lot' }], error: null }) }) }) });
    const { db, files } = fakeDb({ rpc: rpc as unknown as Db['rpc'] });
    (db as unknown as { from: unknown }).from = from;
    expect(await moveInlineImages(db)).toEqual({ pictures: 1, copies: 14 });
    expect([...files.keys()]).toEqual([`${CO}/${sha(PNG)}.png`]);
    const swapCalls = calls.filter(([fn]) => fn === 'admin_swap_map_image');
    expect(swapCalls).toHaveLength(3);
    expect(swapCalls[0][1]).toEqual({ p_map: 'm1', p_hash: sha(PNG), p_url: stored(CO, PNG, 'png'), p_src: PNG });
    expect(calls.filter(([fn]) => fn === 'admin_map_inline_images')).toHaveLength(2);
    swaps = [];
  });

  it('explains when the database step hasn’t been run', async () => {
    const rpc = async () => ({ data: null, error: { message: 'Could not find the function public.admin_map_inline_images(p_map) in the schema cache' } });
    const { db } = fakeDb({ rpc: rpc as unknown as Db['rpc'] });
    (db as unknown as { from: unknown }).from = () => ({ select: () => ({ order: () => ({ range: async () => ({ data: [{ id: 'm1', company_id: CO, name: 'G' }], error: null }) }) }) });
    await expect(moveInlineImages(db)).rejects.toThrow(/step 18 SQL/);
  });
});

describe('backups keep map pictures', () => {
  it('downloads each stored picture once and puts them back on restore', async () => {
    const url = stored(CO, PNG, 'png');
    const m = {
      id: 'm1', draft: mapWith(url), published: { doc: mapWith(url) }, versions: [{ doc: mapWith(PNG) }, { doc: mapWith(url, url) }],
    } as unknown as BackupMap;
    const load = vi.fn(async () => PNG);
    const images = await backupImages([m], undefined, load);
    expect(images).toEqual({ [`${CO}/${sha(PNG)}.png`]: PNG });
    expect(load).toHaveBeenCalledTimes(1);

    const { db, files } = fakeDb();
    expect(await restoreImages(db, { name: 'Company', images } as unknown as BackupCompany)).toBe(1);
    expect(await text(files.get(`${CO}/${sha(PNG)}.png`)!)).toBe('png bytes '.repeat(50));
    // Backups made before pictures moved have none to restore.
    expect(await restoreImages(db, { name: 'Company' } as unknown as BackupCompany)).toBe(0);
  });
});
