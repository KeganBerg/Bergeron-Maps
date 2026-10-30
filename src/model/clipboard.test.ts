import { describe, expect, it } from 'vitest';
import { copySelection, preparePaste, renumberSpaces } from './clipboard';
import { duplicateSpaceIds } from './duplicates';
import { createFloor } from './factory';
import { buildRowSpaces, DEFAULT_ROW } from './rows';
import type { Floor, SpaceObject } from './types';

function setup(): Floor {
  const f = createFloor('Floor 1');
  const spec = { ...DEFAULT_ROW, id: 'row_a', count: 3, prefix: 'A' };
  f.rows[spec.id] = spec;
  f.objects.push(...buildRowSpaces(spec, { x: 0, y: 0, rotation: 30 }, f.layers[2].id, '#eef'));
  f.objects.push({ id: 'tree', kind: 'asset', assetKey: 'tree', layerId: f.layers[3].id, x: 500, y: 500, width: 48, height: 48, rotation: 15, name: 'Tree 1' });
  return f;
}

describe('copy and paste', () => {
  it('copies objects with their properties and leaves originals unchanged', () => {
    const f = setup();
    const before = structuredClone(f);
    const clip = copySelection(f, ['tree'])!;
    const res = preparePaste(f, clip, 20, 20, () => 'fallback');
    expect(f).toEqual(before);
    const t = res.objects[0];
    expect(t.id).not.toBe('tree');
    expect(t).toMatchObject({ kind: 'asset', assetKey: 'tree', width: 48, height: 48, rotation: 15, x: 520, y: 520, layerId: f.layers[3].id });
  });

  it('pastes a row as a new independent row with relative positions preserved', () => {
    const f = setup();
    const ids = f.objects.filter((o) => o.kind === 'space').map((o) => o.id);
    const res = preparePaste(f, copySelection(f, ids)!, 100, 0, () => 'x');
    const pasted = res.objects as SpaceObject[];
    expect(pasted).toHaveLength(3);
    const newRowId = pasted[0].rowId!;
    expect(newRowId).not.toBe('row_a');
    expect(res.rows[newRowId]).toMatchObject({ prefix: 'A', count: 3 });
    const orig = f.objects.filter((o) => o.kind === 'space') as SpaceObject[];
    expect(pasted[1].x - pasted[0].x).toBeCloseTo(orig[1].x - orig[0].x);
    expect(pasted.every((p) => p.rotation === 30 && p.fill === '#eef')).toBe(true);
  });

  it('flags duplicate identifiers on paste and renumbers them sequentially', () => {
    const f = setup();
    const ids = f.objects.filter((o) => o.kind === 'space').map((o) => o.id);
    const res = preparePaste(f, copySelection(f, ids)!, 0, 100, () => 'x');
    expect(res.duplicateIds).toHaveLength(3);
    f.objects.push(...res.objects);
    Object.assign(f.rows, res.rows);
    expect(duplicateSpaceIds(f).size).toBe(6);
    renumberSpaces(f, res.objects.map((o) => o.id));
    const labels = (res.objects.map((o) => f.objects.find((x) => x.id === o.id)) as SpaceObject[]).map((s) => s.label);
    expect(labels).toEqual(['A4', 'A5', 'A6']);
    expect(duplicateSpaceIds(f).size).toBe(0);
    expect(f.rows[(res.objects[0] as SpaceObject).rowId!]).toMatchObject({ prefix: 'A', start: 4 });
  });

  it('supports repeated pasting from one copy', () => {
    const f = setup();
    const clip = copySelection(f, ['tree'])!;
    const a = preparePaste(f, clip, 20, 20, () => 'x').objects[0];
    const b = preparePaste(f, clip, 40, 40, () => 'x').objects[0];
    expect(a.id).not.toBe(b.id);
    expect(b.x).toBe(540);
  });

  it('maps layers by name when pasting onto another floor', () => {
    const f = setup();
    const other = createFloor('Floor 2');
    const res = preparePaste(other, copySelection(f, ['tree'])!, 0, 0, () => 'fallback');
    expect(res.objects[0].layerId).toBe(other.layers.find((l) => l.name === 'Landmarks')!.id);
  });
});
