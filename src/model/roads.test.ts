import { describe, expect, it } from 'vitest';
import { roadExtensions, roadJunctions, type RoadPiece } from './roads';
import { mergeOutlines, unionRings } from './shape';

/** An axis-aligned straight road from (x1, y1) to (x2, y2), with its ends on the short sides of travel. */
function road(x1: number, y1: number, x2: number, y2: number, dir: 'h' | 'v'): RoadPiece {
  const body = [[x1, y1, x2, y1, x2, y2, x1, y2]];
  if (dir === 'h')
    return { body, width: y2 - y1, axis: [1, 0], ends: [{ seg: [x1, y1, x1, y2], out: [-1, 0] }, { seg: [x2, y1, x2, y2], out: [1, 0] }] };
  return { body, width: x2 - x1, axis: [0, 1], ends: [{ seg: [x1, y1, x2, y1], out: [0, -1] }, { seg: [x1, y2, x2, y2], out: [0, 1] }] };
}
const merged = (ps: RoadPiece[]) => unionRings(ps.flatMap((p) => p.body));

describe('road junctions', () => {
  it('a T gets a stop bar only on the road joining it; the through road carries on', () => {
    const ps = [road(0, 0, 300, 120, 'h'), road(300, 0, 600, 120, 'h'), road(240, 120, 360, 400, 'v')];
    const j = roadJunctions(ps, merged(ps));
    expect(j.areas.length).toBe(1);
    expect(j.stops.length).toBe(1);
    // Across the joining road (horizontal), just below the through road.
    const [x1, y1, x2, y2] = j.stops[0];
    expect(Math.abs(y1 - y2)).toBeLessThan(1);
    expect(y1).toBeGreaterThan(120);
    expect(Math.min(x1, x2)).toBeGreaterThan(240);
    expect(Math.max(x1, x2)).toBeLessThan(360);
  });

  it('a parking lot spine with aisles off one side: bars on the aisles only', () => {
    const spine = road(-110, 0, 0, 1000, 'v');
    const aisles = [road(0, 180, 600, 290, 'h'), road(0, 650, 600, 760, 'h')];
    const ps = [spine, ...aisles];
    const j = roadJunctions(ps, merged(ps));
    expect(j.stops.length).toBe(2);
    for (const [x1, , x2] of j.stops) expect(Math.abs(x1 - x2)).toBeLessThan(1);
  });

  it('a crossroads gets four stop bars', () => {
    const ps = [road(0, 140, 400, 260, 'h'), road(140, 0, 260, 400, 'v')];
    expect(roadJunctions(ps, merged(ps)).stops.length).toBe(4);
  });

  it('a road that just carries on, turns a corner, or narrows into a lane is not a junction', () => {
    const straight = [road(0, 0, 300, 120, 'h'), road(300, 0, 600, 120, 'h')];
    expect(roadJunctions(straight, merged(straight)).stops).toEqual([]);
    const corner = [road(0, 0, 300, 60, 'h'), road(240, 30, 300, 300, 'v')];
    expect(roadJunctions(corner, merged(corner)).stops).toEqual([]);
    const narrowing = [road(0, 0, 300, 120, 'h'), road(330, 30, 500, 90, 'h')];
    const ext = roadExtensions(narrowing);
    const all = merged(narrowing.map((p, i) => ({ ...p, body: [...p.body, ...ext[i]] })));
    expect(roadJunctions(narrowing, all).stops).toEqual([]);
  });

  it('a road ending just short of another is stretched to meet it', () => {
    const ps = [road(0, 0, 600, 120, 'h'), road(240, 150, 360, 400, 'v')];
    const ext = roadExtensions(ps);
    expect(ext[0]).toEqual([]);
    expect(ext[1].length).toBe(1);
    const joined = mergeOutlines(ps.map((p, i) => ({ x: 0, y: 0, rotation: 0, width: 0, height: 0, extra: [...p.body, ...ext[i]], blend: 0 })));
    expect(joined.length).toBe(1);
  });

  it('a road far from any other is left alone', () => {
    const ps = [road(0, 0, 600, 120, 'h'), road(240, 300, 360, 500, 'v')];
    expect(roadExtensions(ps)[1]).toEqual([]);
  });
});
