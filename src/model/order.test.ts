import { describe, expect, it } from 'vitest';
import { reorderObjects } from './order';
import type { AssetObject, Floor } from './types';

const obj = (id: string, layerId: string, x = 0): AssetObject => ({
  id, layerId, kind: 'asset', assetKey: 'tree', x, y: 0, width: 50, height: 50, rotation: 0,
});

function floor(objects: AssetObject[]): Floor {
  return {
    id: 'f', name: 'F1', rows: {},
    layers: [
      { id: 'low', name: 'Structure', visible: true, locked: false },
      { id: 'mid', name: 'Spaces', visible: true, locked: false },
      { id: 'top', name: 'Landmarks', visible: true, locked: false },
    ],
    objects,
  };
}

/** Bottom-to-top drawing order, as the canvas paints it. */
const drawn = (f: Floor) => f.layers.flatMap((l) => f.objects.filter((o) => o.layerId === l.id).map((o) => o.id));

describe('reorderObjects', () => {
  it('brings an object to the front of its own layer', () => {
    const f = floor([obj('a', 'mid'), obj('b', 'mid'), obj('c', 'mid')]);
    reorderObjects(f, ['a'], 'front');
    expect(drawn(f)).toEqual(['b', 'c', 'a']);
  });

  it('moves to a higher layer when that is the only way to be on top', () => {
    const f = floor([obj('a', 'low'), obj('b', 'top')]);
    const r = reorderObjects(f, ['a'], 'front');
    expect(drawn(f)).toEqual(['b', 'a']);
    expect(r.movedTo?.id).toBe('top');
    expect(f.objects.find((o) => o.id === 'a')!.layerId).toBe('top');
  });

  it('sends to the back, below objects on lower layers', () => {
    const f = floor([obj('a', 'low'), obj('b', 'mid'), obj('c', 'top')]);
    reorderObjects(f, ['c'], 'back');
    expect(drawn(f)).toEqual(['c', 'a', 'b']);
  });

  it('steps forward and back one overlapping object at a time', () => {
    const f = floor([obj('a', 'mid'), obj('b', 'mid'), obj('far', 'mid', 1000), obj('c', 'mid')]);
    reorderObjects(f, ['a'], 'forward');
    expect(drawn(f)).toEqual(['b', 'a', 'far', 'c']);
    // "far" does not overlap, so it is skipped.
    reorderObjects(f, ['a'], 'forward');
    expect(drawn(f)).toEqual(['b', 'far', 'c', 'a']);
    reorderObjects(f, ['a'], 'backward');
    expect(drawn(f)).toEqual(['b', 'far', 'a', 'c']);
  });

  it('reports a no-op when already at the front', () => {
    const f = floor([obj('a', 'mid'), obj('b', 'mid')]);
    expect(reorderObjects(f, ['b'], 'front').noop).toBe(true);
    expect(reorderObjects(f, ['b'], 'forward').noop).toBe(true);
    expect(reorderObjects(f, ['a'], 'back').noop).toBe(true);
  });

  it('does not move into a locked layer', () => {
    const f = floor([obj('a', 'low'), obj('b', 'top')]);
    f.layers[2].locked = true;
    const r = reorderObjects(f, ['a'], 'front');
    expect(r.blockedBy?.id).toBe('top');
    expect(f.objects.find((o) => o.id === 'a')!.layerId).toBe('low');
  });

  it('keeps the relative order of a multi-selection', () => {
    const f = floor([obj('a', 'mid'), obj('b', 'mid'), obj('c', 'mid'), obj('d', 'mid')]);
    reorderObjects(f, ['a', 'b'], 'front');
    expect(drawn(f)).toEqual(['c', 'd', 'a', 'b']);
    reorderObjects(f, ['a', 'b'], 'back');
    expect(drawn(f)).toEqual(['a', 'b', 'c', 'd']);
  });
});
