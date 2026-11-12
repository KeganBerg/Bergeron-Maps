import { describe, expect, it } from 'vitest';
import { createFloor } from './factory';
import { placeObjects } from './layers';
import { buildRowSpaces, DEFAULT_ROW } from './rows';
import type { MapObject } from './types';
import { layerItems } from './layerTree';
import { editableIds } from '../editor/store';

const text = (id: string, layerId: string): MapObject => ({ id, kind: 'text', layerId, x: 0, y: 0, width: 10, height: 10, rotation: 0, text: id, fontSize: 12, color: '#000000' });

function setup() {
  const f = createFloor('Level 1');
  const spaces = f.layers[2].id;
  const labels = f.layers[4].id;
  const spec = { ...DEFAULT_ROW, id: 'row_1', count: 3 };
  f.rows.row_1 = spec;
  f.objects.push(...buildRowSpaces(spec, { x: 0, y: 0, rotation: 0 }, spaces));
  f.objects.push(text('a', labels), text('b', labels), text('c', labels));
  return { f, spaces, labels };
}

describe('layer object list', () => {
  it('lists objects top of the drawing first', () => {
    const { f, labels } = setup();
    expect(layerItems(f, labels, new Set()).map((i) => i.key)).toEqual(['c', 'b', 'a']);
  });

  it('groups a row of spaces until the row is opened', () => {
    const { f, spaces } = setup();
    const closed = layerItems(f, spaces, new Set());
    expect(closed).toHaveLength(1);
    expect(closed[0].kind).toBe('row');
    expect(closed[0].kind === 'row' && closed[0].ids).toHaveLength(3);
    const open = layerItems(f, spaces, new Set(['row_1']));
    expect(open).toHaveLength(4);
    expect(open.slice(1).every((i) => i.kind === 'obj' && i.depth === 1)).toBe(true);
  });

  it('keeps 2,000 spaces to one entry per row', () => {
    const f = createFloor('Big');
    const layer = f.layers[2].id;
    for (let r = 0; r < 100; r++) {
      const spec = { ...DEFAULT_ROW, id: `row_${r}`, count: 20 };
      f.rows[spec.id] = spec;
      f.objects.push(...buildRowSpaces(spec, { x: 0, y: r * 60, rotation: 0 }, layer));
    }
    expect(layerItems(f, layer, new Set())).toHaveLength(100);
  });
});

describe('placeObjects', () => {
  it('moves an object above another', () => {
    const { f, labels } = setup();
    placeObjects(f, ['a'], labels, { id: 'c', side: 'above' });
    expect(layerItems(f, labels, new Set()).map((i) => i.key)).toEqual(['a', 'c', 'b']);
  });

  it('moves an object below another', () => {
    const { f, labels } = setup();
    placeObjects(f, ['c'], labels, { id: 'a', side: 'below' });
    expect(layerItems(f, labels, new Set()).map((i) => i.key)).toEqual(['b', 'a', 'c']);
  });

  it('moves objects to the top of another layer', () => {
    const { f, labels } = setup();
    const structure = f.layers[1].id;
    f.objects.push(text('s', structure));
    expect(placeObjects(f, ['a', 'b'], structure, null)).toBe(true);
    expect(layerItems(f, structure, new Set()).map((i) => i.key)).toEqual(['b', 'a', 's']);
    expect(layerItems(f, labels, new Set()).map((i) => i.key)).toEqual(['c']);
  });

  it('reports no change when dropped where it already is', () => {
    const { f, labels } = setup();
    expect(placeObjects(f, ['c'], labels, null)).toBe(false);
    expect(placeObjects(f, ['b'], labels, { id: 'b', side: 'above' })).toBe(false);
  });
});

describe('object lock and visibility', () => {
  it('locked or hidden objects cannot be selected', () => {
    const { f } = setup();
    const a = f.objects.find((o) => o.id === 'a')!;
    const b = f.objects.find((o) => o.id === 'b')!;
    a.locked = true;
    b.hidden = true;
    expect(editableIds(f, ['a', 'b', 'c'])).toEqual(['c']);
  });
});
