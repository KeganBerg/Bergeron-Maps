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
