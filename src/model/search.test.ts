import { describe, expect, it } from 'vitest';
import { createFloor, createMap } from './factory';
import { buildRowSpaces, DEFAULT_ROW } from './rows';
import { searchMap } from './search';

function garage() {
  const doc = createMap('Garage');
  const f1 = doc.floors[0];
  const f2 = createFloor('Level 2');
  doc.floors.push(f2);
  const a = { ...DEFAULT_ROW, id: 'r1', prefix: 'B', count: 20 };
  f1.objects.push(...buildRowSpaces(a, { x: 0, y: 0, rotation: 0 }, f1.layers[2].id));
  const b = { ...DEFAULT_ROW, id: 'r2', prefix: 'C', count: 5 };
  f2.objects.push(...buildRowSpaces(b, { x: 0, y: 0, rotation: 0 }, f2.layers[2].id));
  f2.objects.push({ id: 'st', kind: 'asset', assetKey: 'stairs', name: 'Stairway 17', layerId: f2.layers[3].id, x: 0, y: 0, width: 10, height: 10, rotation: 0 });
  return doc;
}

describe('map search', () => {
  it('finds a space by identifier and reports its floor', () => {
    const hits = searchMap(garage(), 'B16');
    expect(hits[0]).toMatchObject({ exact: true, floorName: 'Floor 1', title: 'Space B16' });
  });

  it('ignores case, spaces and dashes', () => {
    expect(searchMap(garage(), 'b-16')[0].title).toBe('Space B16');
    expect(searchMap(garage(), ' c 3 ')[0]).toMatchObject({ title: 'Space C3', floorName: 'Level 2' });
  });

  it('lists exact match first, then other spaces starting with the query', () => {
    const titles = searchMap(garage(), 'B1').map((h) => h.title);
    expect(titles[0]).toBe('Space B1');
    expect(titles).toContain('Space B10');
    expect(titles).toContain('Space B19');
    expect(titles).not.toContain('Space B2');
  });

  it('distinguishes the same identifier on different floors', () => {
    const doc = garage();
    const f2 = doc.floors[1];
    f2.objects.push(...buildRowSpaces({ ...DEFAULT_ROW, id: 'r3', prefix: 'B', start: 16, count: 1 }, { x: 0, y: 0, rotation: 0 }, f2.layers[2].id));
    const hits = searchMap(doc, 'B16');
    expect(hits.filter((h) => h.exact).map((h) => h.floorName).sort()).toEqual(['Floor 1', 'Level 2']);
  });

  it('returns nothing for unknown identifiers', () => {
    expect(searchMap(garage(), 'Z99')).toEqual([]);
  });

  it('finds landmarks by name', () => {
    expect(searchMap(garage(), 'stairway 17')[0]).toMatchObject({ title: 'Stairway 17', floorName: 'Level 2' });
  });

  it('skips hidden layers', () => {
    const doc = garage();
    doc.floors[0].layers[2].visible = false;
    expect(searchMap(doc, 'B16')).toEqual([]);
  });
});

describe('per-floor space numbers', () => {
  it('finds "F6 37" when the employee types just 37, one hit per floor', () => {
    const doc = createMap('Garage');
    const f6 = createFloor('F6');
    doc.floors.push(f6);
    const sp = (label: string, layerId: string) => ({ id: label, kind: 'space' as const, label, layerId, x: 0, y: 0, width: 9, height: 18, rotation: 0, labelPlacement: 'center' as const, fill: '#fff' });
    doc.floors[0].objects.push(sp('F1 37', doc.floors[0].layers[2].id), sp('F1 370', doc.floors[0].layers[2].id));
    f6.objects.push(sp('F6 37', f6.layers[2].id));
    const hits = searchMap(doc, '37');
    expect(hits.map((h) => h.title)).toEqual(['Space F1 37', 'Space F6 37', 'Space F1 370']);
    expect(hits[0].exact && hits[1].exact && !hits[2].exact).toBe(true);
    expect(searchMap(doc, 'F6 37').map((h) => h.title)).toEqual(['Space F6 37']);
  });

  it('finds quick-lot space "1B1" when the employee types B1', () => {
    const doc = createMap('Lot');
    const l = doc.floors[0].layers[2].id;
    const sp = (label: string) => ({ id: label, kind: 'space' as const, label, layerId: l, x: 0, y: 0, width: 9, height: 18, rotation: 0, labelPlacement: 'center' as const, fill: '#fff' });
    doc.floors[0].objects.push(sp('1B1'), sp('1B10'), sp('2B1'));
    expect(searchMap(doc, 'B1').map((h) => h.title)).toEqual(['Space 1B1', 'Space 2B1']);
    expect(searchMap(doc, '1').map((h) => h.title)[0]).toBe('Space 1B1');
  });
});
