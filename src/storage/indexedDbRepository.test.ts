import { describe, expect, it } from 'vitest';
import { createMap } from '../model/factory';
import { IndexedDbRepository } from './indexedDbRepository';
import { ConflictError } from './repository';

let n = 0;
const fresh = () => new IndexedDbRepository(`test-${++n}`);

describe('browser map storage', () => {
  it('saves and reloads a map with all of its data', async () => {
    const repo = fresh();
    const doc = createMap('Hotel Lot');
    doc.floors[0].objects.push({ id: 'a', kind: 'asset', assetKey: 'tree', layerId: doc.floors[0].layers[3].id, x: 1, y: 2, width: 3, height: 4, rotation: 5 });
    const created = await repo.createMap(doc);
    expect(created.revision).toBe(1);
    const loaded = await repo.getMap(doc.id);
    expect(loaded!.floors[0].objects[0]).toMatchObject({ id: 'a', x: 1, rotation: 5 });
    expect(loaded!.floors[0].layers).toHaveLength(5);
  });

  it('increments the revision on save and rejects stale saves', async () => {
    const repo = fresh();
    const doc = await repo.createMap(createMap('Garage'));
    const a = await repo.saveMap({ ...doc, name: 'Garage A' }, doc.revision);
    expect(a.revision).toBe(2);
    // A second editor still holding revision 1 must not silently overwrite.
    await expect(repo.saveMap({ ...doc, name: 'Garage B' }, doc.revision)).rejects.toBeInstanceOf(ConflictError);
    try {
      await repo.saveMap({ ...doc, name: 'Garage B' }, doc.revision);
    } catch (e) {
      expect((e as ConflictError).current.name).toBe('Garage A');
    }
    expect((await repo.getMap(doc.id))!.name).toBe('Garage A');
  });

  it('moves deleted maps to trash and restores them', async () => {
    const repo = fresh();
    const doc = await repo.createMap(createMap('Event Lot'));
    await repo.trashMap(doc.id);
    expect(await repo.listMaps()).toHaveLength(0);
    expect(await repo.getMap(doc.id)).toBeNull();
    expect((await repo.listTrash())[0]).toMatchObject({ id: doc.id, name: 'Event Lot' });
    await repo.restoreMap(doc.id);
    expect((await repo.listMaps())[0].id).toBe(doc.id);
  });

  it('purges trash only after the retention period', async () => {
    const repo = fresh();
    const doc = await repo.createMap(createMap('Old'));
    await repo.trashMap(doc.id);
    expect(await repo.purgeExpiredTrash(new Date())).toBe(0);
    expect(await repo.purgeExpiredTrash(new Date(Date.now() + 31 * 86400_000))).toBe(1);
    expect(await repo.listTrash()).toHaveLength(0);
  });

  it('keeps versions that can be restored without losing newer work', async () => {
    const repo = fresh();
    const v1 = await repo.createMap(createMap('Versions'));
    const meta = await repo.saveVersion(v1, 'manual');
    const v2 = await repo.saveMap({ ...v1, name: 'Versions edited' }, v1.revision);
    await repo.saveVersion(v2, 'before-restore');
    const versions = await repo.listVersions(v1.id);
    expect(versions).toHaveLength(2);
    const old = await repo.getVersion(meta.id);
    expect(old!.name).toBe('Versions');
    const newer = await repo.getVersion(versions.find((v) => v.reason === 'before-restore')!.id);
    expect(newer!.name).toBe('Versions edited');
  });
});

describe('publishing', () => {
  it('employees see nothing until published, then only the published version', async () => {
    const repo = new IndexedDbRepository(`pub-${Math.random()}`);
    const created = await repo.createMap(createMap('Harbor'), 'Harbor Hotel');
    expect(await repo.getPublishedMap(created.id)).toBeNull();
    expect((await repo.listMaps())[0]).toMatchObject({ site: 'Harbor Hotel', publishedAt: undefined });

    const info = await repo.publishMap(created.id);
    expect(info.publishedRevision).toBe(1);
    await repo.saveMap({ ...created, name: 'Harbor draft' }, 1);
    expect((await repo.getPublishedMap(created.id))!.name).toBe('Harbor');
    const [summary] = await repo.listMaps();
    expect(summary.revision).toBe(2);
    expect(summary.publishedRevision).toBe(1);
    expect((await repo.listVersions(created.id)).some((v) => v.reason === 'publish')).toBe(true);

    await repo.trashMap(created.id);
    expect(await repo.getPublishedMap(created.id)).toBeNull();
  });

  it('groups maps by site, defaulting to the map name', async () => {
    const repo = new IndexedDbRepository(`site-${Math.random()}`);
    const a = await repo.createMap(createMap('Main garage'));
    expect((await repo.listMaps())[0].site).toBe('Main garage');
    await repo.moveToSite(a.id, 'Downtown');
    expect((await repo.listMaps())[0].site).toBe('Downtown');
    await expect(repo.moveToSite(a.id, '  ')).rejects.toThrow();
  });

  it('gives each site 5 numbered slots; the trash frees a slot and restoring needs one', async () => {
    const repo = fresh();
    const made = [];
    for (let i = 1; i <= 5; i++) made.push(await repo.createMap(createMap(`Map ${i}`), 'Garage'));
    expect((await repo.listMaps()).map((m) => m.slot).sort()).toEqual([1, 2, 3, 4, 5]);
    await expect(repo.createMap(createMap('Sixth'), 'Garage')).rejects.toThrow(/All 5 map slots at “Garage” are in use/);

    await repo.trashMap(made[1].id);
    expect((await repo.listTrash())[0].slot).toBeUndefined();
    const sixth = await repo.createMap(createMap('Sixth'), 'Garage');
    expect((await repo.listMaps()).find((m) => m.id === sixth.id)?.slot).toBe(2);
    await expect(repo.restoreMap(made[1].id)).rejects.toThrow(/All 5 map slots/);

    // Another site has its own slots; moving into a full site is refused.
    const other = await repo.createMap(createMap('Lot'), 'Surface lot');
    await expect(repo.moveToSite(other.id, 'Garage')).rejects.toThrow(/All 5 map slots/);
    expect((await repo.listMaps()).find((m) => m.id === other.id)?.slot).toBe(1);
  });

  it('a new map can go into a chosen empty slot', async () => {
    const repo = fresh();
    const m = await repo.createMap(createMap('A'), 'Garage', 4);
    const taken = await repo.createMap(createMap('B'), 'Garage', 4);
    const slots = Object.fromEntries((await repo.listMaps()).map((x) => [x.id, x.slot]));
    expect([slots[m.id], slots[taken.id]]).toEqual([4, 1]);
  });

  it('allows 2 published maps per site; unpublishing frees a place', async () => {
    const repo = fresh();
    const [a, b, c] = [await repo.createMap(createMap('A'), 'Garage'), await repo.createMap(createMap('B'), 'Garage'), await repo.createMap(createMap('C'), 'Garage')];
    await repo.publishMap(a.id);
    await repo.publishMap(b.id);
    await repo.publishMap(b.id); // publishing changes to a live map is always fine
    await expect(repo.publishMap(c.id)).rejects.toThrow(/already has 2 live maps/);

    await repo.unpublishMap(a.id);
    expect(await repo.getPublishedMap(a.id)).toBeNull();
    expect(await repo.getMap(a.id)).not.toBeNull();
    await repo.publishMap(c.id);

    // A deleted live map doesn't count, but can't come back while 2 others are live.
    await repo.trashMap(c.id);
    await repo.publishMap(a.id);
    await expect(repo.restoreMap(c.id)).rejects.toThrow(/already has 2 live maps/);
  });
});
