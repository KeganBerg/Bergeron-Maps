import { describe, expect, it } from 'vitest';
import { createFloor, createMap, nextFloorName } from './factory';
import { copyName, duplicateFloor } from './floors';
import { deleteLayer, layerObjectCount, resolveTargetLayer, shiftLayer } from './layers';
import { buildRowSpaces, DEFAULT_ROW } from './rows';
import { facilityDuplicates, duplicateSpaceIds } from './duplicates';

function floorWithStuff() {
  const f = createFloor('Level 1');
  const spec = { ...DEFAULT_ROW, id: 'row_1', count: 2 };
  f.rows.row_1 = spec;
  f.objects.push(...buildRowSpaces(spec, { x: 0, y: 0, rotation: 0 }, f.layers[2].id));
  return f;
}

describe('floors', () => {
  it('names new floors sequentially', () => {
    const doc = createMap('Test');
    expect(doc.floors[0].name).toBe('Floor 1');
    expect(nextFloorName(doc)).toBe('Floor 2');
  });

  it('duplicates a floor with independent ids', () => {
    const f = floorWithStuff();
    const copy = duplicateFloor(f, 'Level 2');
    expect(copy.name).toBe('Level 2');
    expect(copy.id).not.toBe(f.id);
    expect(copy.objects).toHaveLength(2);
    const origIds = new Set([...f.objects.map((o) => o.id), ...f.layers.map((l) => l.id), ...Object.keys(f.rows)]);
    for (const o of copy.objects) {
      expect(origIds.has(o.id)).toBe(false);
      expect(copy.layers.some((l) => l.id === o.layerId)).toBe(true);
      if (o.kind === 'space') expect(copy.rows[o.rowId!]).toBeDefined();
    }
    copy.objects[0].x = 999;
    copy.layers[1].name = 'Changed';
    expect(f.objects[0].x).toBe(0);
    expect(f.layers[1].name).toBe('Structure');
  });

  it('names copies uniquely', () => {
    const doc = createMap('Test');
    expect(copyName(doc, 'Floor 1')).toBe('Floor 1 (copy)');
    doc.floors.push({ ...createFloor('Floor 1 (copy)') });
    expect(copyName(doc, 'Floor 1')).toBe('Floor 1 (copy 2)');
  });
});

describe('layers', () => {
  it('moves objects to another layer when deleting', () => {
    const f = floorWithStuff();
    const spaces = f.layers[2].id;
    const target = f.layers[3].id;
    expect(layerObjectCount(f, spaces)).toBe(2);
    deleteLayer(f, spaces, target);
    expect(f.layers.some((l) => l.id === spaces)).toBe(false);
    expect(f.objects.every((o) => o.layerId === target)).toBe(true);
  });

  it('deletes objects with the layer when asked', () => {
    const f = floorWithStuff();
    deleteLayer(f, f.layers[2].id, null);
    expect(f.objects).toHaveLength(0);
    expect(f.rows.row_1).toBeUndefined();
  });

  it('reorders layers', () => {
    const f = createFloor('x');
    const id = f.layers[1].id;
    shiftLayer(f, id, 1);
    expect(f.layers[2].id).toBe(id);
    shiftLayer(f, f.layers[f.layers.length - 1].id, 1);
    expect(f.layers).toHaveLength(5);
  });

  it('routes new objects to the active layer or by type', () => {
    const f = createFloor('x');
    const custom = f.layers[4].id;
    expect(resolveTargetLayer(f, custom, 'spaces')).toBe(custom);
    expect(resolveTargetLayer(f, 'auto', 'spaces')).toBe(f.layers.find((l) => l.role === 'spaces')!.id);
    f.layers[4].locked = true;
    expect(resolveTargetLayer(f, custom, 'spaces')).toBe(f.layers.find((l) => l.role === 'spaces')!.id);
    // never the background layer
    expect(resolveTargetLayer(f, f.layers[0].id, 'structure')).toBe(f.layers[1].id);
  });
});

describe('duplicate identifiers', () => {
  it('finds duplicates on a floor case-insensitively', () => {
    const f = floorWithStuff();
    (f.objects[1] as { label: string }).label = ' 1';
    expect(duplicateSpaceIds(f).size).toBe(2);
  });

  it('reports duplicates across floors of the same facility', () => {
    const doc = createMap('x');
    doc.floors = [floorWithStuff(), floorWithStuff()];
    const d = facilityDuplicates(doc);
    expect(d.map((g) => g.label).sort()).toEqual(['1', '2']);
    expect(d[0].floors).toHaveLength(2);
  });
});
