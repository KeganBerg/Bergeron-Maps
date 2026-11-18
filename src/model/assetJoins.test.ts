import { describe, expect, it, vi } from 'vitest';

// The merge plan is plain geometry; the canvas components around it are not needed here.
vi.mock('react-konva', () => ({ Group: () => null, Image: () => null, Line: () => null, Rect: () => null, Shape: () => null, Text: () => null }));
import { ASSET_BY_KEY } from '../assets/library';
import { mergeKey } from '../assets/library';
import { localOutline, partEnds, insideRings } from './shape';
import { migrateDocument } from './migrate';
import { createQuickLot } from './quickLot';
import { createFloor, createMap } from './factory';
import { mergePlan } from '../render/MapObjects';
import type { AssetObject, Floor } from './types';
import { bend } from '../../scripts/asset-audit/scenes';

const put = (f: Floor, key: string, x: number, y: number, o: Partial<AssetObject> = {}): AssetObject => {
  const d = ASSET_BY_KEY[key];
  const a: AssetObject = { id: `${key}-${x}-${y}`, kind: 'asset', assetKey: key, layerId: f.layers.find((l) => l.role === d.layer)!.id, x, y, width: d.width, height: d.height, rotation: 0, ...o };
  f.objects.push(a);
  return a;
};

describe('asset joins', () => {
  it('joins intersections, roundabouts, turnarounds, loading and service lanes into the road', () => {
    for (const k of ['intersection', 'roundabout', 'turnaround', 'loading-lane', 'service-reception-lane']) expect(mergeKey(ASSET_BY_KEY[k]), k).toBe('road');
  });

  it('outlines road pieces made of arms by their real shape, not their box', () => {
    const cross = localOutline({ width: 300, height: 300, outline: 'cross', band: 120 });
    expect(insideRings(cross, 150, 10)).toBe(true);
    expect(insideRings(cross, 20, 20)).toBe(false);
    const round = localOutline({ width: 260, height: 260, outline: 'roundabout', band: 60 });
    expect(insideRings(round, 130, 5)).toBe(true);
    expect(insideRings(round, 10, 10)).toBe(false);
    const bulb = localOutline({ width: 240, height: 240, outline: 'bulb', band: 60 });
    expect(insideRings(bulb, 2, 120)).toBe(true);
    expect(insideRings(bulb, 2, 20)).toBe(false);
    expect(partEnds('cross', 300, 300, 120)).toHaveLength(4);
    expect(partEnds('bulb', 240, 240, 60)).toEqual([[0, 90, 0, 150]]);
  });

  it('merges a road into an intersection arm as one road', () => {
    const f = createFloor('F');
    put(f, 'intersection', 450, 150);
    put(f, 'straight-road', 150, 150, { width: 300, height: 120 });
    const plan = mergePlan(f.objects);
    expect(plan.leads.size).toBe(1);
    const cluster = [...plan.leads.values()][0];
    expect(cluster.members).toHaveLength(2);
    // The intersection's own stop bars are kept, so the road adds none at its arm.
    expect(cluster.stops ?? []).toHaveLength(0);
  });

  it('keeps wheel stops, columns and bollards above the parking spaces', () => {
    for (const k of ['parking-stop', 'column', 'pillar', 'bollard']) expect(ASSET_BY_KEY[k].layer, k).toBe('landmarks');
    const d = createMap('M');
    d.floors = [createFloor('F')];
    const f = d.floors[0];
    const structure = f.layers.find((l) => l.role === 'structure')!.id;
    put(f, 'parking-stop', 0, 0, { layerId: structure });
    put(f, 'wall', 0, 0);
    const out = migrateDocument(JSON.parse(JSON.stringify(d)));
    const [stop, wall] = out.floors[0].objects;
    expect(out.floors[0].layers.find((l) => l.id === stop.layerId)!.role).toBe('landmarks');
    expect(wall.layerId).toBe(structure);
  });

  it('builds quick lot ramps flush with the drive lane, and stairs clear of the elevator', () => {
    const f = createQuickLot('Q', { floors: 2, rows: 2, spacesPerRow: 6, accessible: 0 }).floors[0];
    const get = (k: string) => f.objects.find((o) => o.kind === 'asset' && o.assetKey === k)!;
    const ramp = get('ramp');
    const lane = f.objects.find((o) => o.kind === 'asset' && o.assetKey === 'road' && o.rotation === 0)!;
    expect(ramp.x - ramp.width / 2).toBeCloseTo(lane.x + lane.width / 2);
    expect(ramp.height).toBe(lane.height);
    const stairs = get('stairs'), lift = get('elevator');
    expect(stairs.y + stairs.height / 2).toBeLessThan(lift.y - lift.height / 2);
  });

  it('joins a road placed a few degrees and pixels off a curve as one road, with a smooth yellow line and no stop bar', () => {
    const f = bend().floors[0];
    const tilted = f.objects[0], curve = f.objects[1];
    const plan = mergePlan([tilted, curve]);
    const cluster = [...plan.leads.values()][0];
    expect(cluster.members).toHaveLength(2);
    expect(cluster.stops ?? []).toHaveLength(0);
    // Each yellow line turns gently everywhere: no step where the pieces meet.
    for (const l of cluster.centers ?? []) {
      for (let i = 2; i + 3 < l.length; i += 2) {
        const a = Math.atan2(l[i + 1] - l[i - 1], l[i] - l[i - 2]), b = Math.atan2(l[i + 3] - l[i + 1], l[i + 2] - l[i]);
        const d = Math.abs(((b - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
        if (Math.hypot(l[i + 2] - l[i], l[i + 3] - l[i + 1]) > 0.5) expect(d).toBeLessThan(0.5);
      }
    }
    // The outline has no spikes doubling back on themselves.
    for (const r of cluster.rings) {
      const n = r.length / 2;
      for (let i = 0; i < n; i++) {
        const p0 = [r[((i + n - 1) % n) * 2], r[((i + n - 1) % n) * 2 + 1]], p1 = [r[i * 2], r[i * 2 + 1]], p2 = [r[((i + 1) % n) * 2], r[((i + 1) % n) * 2 + 1]];
        const u = [p1[0] - p0[0], p1[1] - p0[1]], v = [p2[0] - p1[0], p2[1] - p1[1]];
        const cos = (u[0] * v[0] + u[1] * v[1]) / ((Math.hypot(...u) * Math.hypot(...v)) || 1);
        expect(cos).toBeGreaterThan(-0.95);
      }
    }
  });
});
