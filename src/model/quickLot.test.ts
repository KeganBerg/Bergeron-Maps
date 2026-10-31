import { describe, expect, it } from 'vitest';
import { clampQuickLot, createQuickLot, quickLotTotal } from './quickLot';
import type { SpaceObject } from './types';

const spaces = (objs: { kind: string }[]) => objs.filter((o): o is SpaceObject => o.kind === 'space');

describe('quick lot builder', () => {
  it('builds numbered rows with drive lanes and an entrance', () => {
    const doc = createQuickLot('Harbor', { floors: 1, rows: 4, spacesPerRow: 10, accessible: 2 });
    const f = doc.floors[0];
    const sp = spaces(f.objects);
    expect(sp).toHaveLength(40);
    expect(sp.map((s) => s.label)).toContain('A1');
    expect(sp.map((s) => s.label)).toContain('D10');
    expect(Object.keys(f.rows)).toHaveLength(4);
    expect(sp.filter((s) => s.accessible).map((s) => s.label)).toEqual(['A1', 'A2']);
    const keys = f.objects.filter((o) => o.kind === 'asset').map((o) => (o as { assetKey: string }).assetKey);
    expect(keys.filter((k) => k === 'road')).toHaveLength(3); // main lane + 2 aisles
    expect(keys).toContain('entrance');
    expect(keys).toContain('exit');
  });

  it('never overlaps spaces', () => {
    const sp = spaces(createQuickLot('X', { floors: 1, rows: 5, spacesPerRow: 6, accessible: 0 }).floors[0].objects);
    for (const a of sp)
      for (const b of sp)
        if (a !== b) expect(Math.abs(a.x - b.x) >= a.width - 0.01 || Math.abs(a.y - b.y) >= a.height - 0.01).toBe(true);
  });

  it('prefixes levels and links ramps between them', () => {
    const doc = createQuickLot('Garage', { floors: 3, rows: 2, spacesPerRow: 5, accessible: 1 });
    expect(doc.floors.map((f) => f.name)).toEqual(['Level 1', 'Level 2', 'Level 3']);
    expect(spaces(doc.floors[1].objects)[0].label).toBe('2A1');
    const ramp2 = doc.floors[1].objects.find((o) => o.kind === 'asset' && o.assetKey === 'ramp');
    expect(ramp2 && ramp2.kind === 'asset' && ramp2.connectsTo).toEqual([doc.floors[0].id, doc.floors[2].id]);
    expect(spaces(doc.floors[1].objects).some((s) => s.accessible)).toBe(false);
  });

  it('clamps silly input', () => {
    expect(clampQuickLot({ floors: 0, rows: 99, spacesPerRow: NaN, accessible: 50 })).toEqual({ floors: 1, rows: 26, spacesPerRow: 12, accessible: 12 });
    expect(quickLotTotal({ floors: 2, rows: 3, spacesPerRow: 10, accessible: 0 })).toBe(60);
  });
});
