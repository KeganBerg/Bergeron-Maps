import { describe, expect, it } from 'vitest';
import { alignObjects, distributeObjects } from './align';
import type { MapObject } from './types';

const asset = (id: string, x: number, y: number, w = 20, h = 20): MapObject => ({
  id, kind: 'asset', assetKey: 'column', layerId: 'l', x, y, width: w, height: h, rotation: 0,
});

describe('align and distribute', () => {
  it('aligns left edges', () => {
    const m = alignObjects([asset('a', 10, 0), asset('b', 50, 40, 40)], 'left');
    // a left = 0; b left = 30 -> moves -30
    expect(m.get('a')).toBeUndefined();
    expect(m.get('b')).toEqual({ dx: -30, dy: 0 });
  });

  it('aligns vertical centers', () => {
    const m = alignObjects([asset('a', 0, 0), asset('b', 100, 100)], 'vcenter');
    expect(m.get('a')!.dy).toBe(50);
    expect(m.get('b')!.dy).toBe(-50);
  });

  it('distributes with equal gaps and keeps the ends fixed', () => {
    const m = distributeObjects([asset('a', 10, 0), asset('b', 30, 0), asset('c', 210, 0)], 'horizontal');
    // boxes: a[0,20] b[20,40] c[200,220]; total width 60, span 220 -> gap 80 -> b at 100..120
    expect(m.get('a')).toBeUndefined();
    expect(m.get('c')).toBeUndefined();
    expect(m.get('b')).toEqual({ dx: 80, dy: 0 });
  });

  it('treats a selected row as one unit', () => {
    const row = [0, 1, 2].map((i): MapObject => ({
      id: `s${i}`, kind: 'space', label: String(i + 1), rowId: 'r', rowIndex: i, labelPlacement: 'center', fill: '#fff',
      layerId: 'l', x: 100 + i * 40, y: 100, width: 40, height: 80, rotation: 0,
    }));
    const m = alignObjects([...row, asset('t', 10, 300)], 'left');
    // the row's left edge is 80; the tree's left edge is 0. The whole row moves together.
    expect(m.get('s0')).toEqual({ dx: -80, dy: 0 });
    expect(m.get('s2')).toEqual({ dx: -80, dy: 0 });
  });
});
