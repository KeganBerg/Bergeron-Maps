import { describe, expect, it } from 'vitest';
import { jointEnds, jointShapes, roadCenterLines, roadExtensions, roadJoints, roadJunctions, type RoadPiece } from './roads';
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

/** A straight two-lane road from (x, y) heading `deg` degrees for `len` px, with its centre line. */
function seg(x: number, y: number, deg: number, len: number, w = 120): RoadPiece {
  const a = (deg * Math.PI) / 180, d: [number, number] = [Math.cos(a), Math.sin(a)], n = [-d[1], d[0]];
  const p = (s: number, t: number) => [x + d[0] * s + n[0] * t, y + d[1] * s + n[1] * t];
  return {
    body: [[...p(0, -w / 2), ...p(len, -w / 2), ...p(len, w / 2), ...p(0, w / 2)]],
    width: w,
    axis: d,
    center: [...p(0, 0), ...p(len, 0)],
    ends: [{ seg: [...p(0, -w / 2), ...p(0, w / 2)], out: [-d[0], -d[1]] }, { seg: [...p(len, -w / 2), ...p(len, w / 2)], out: d }],
  };
}

/** Everything the merged road needs, the way the map draws it. */
function build(ps: RoadPiece[]) {
  const joints = roadJoints(ps);
  const bends = jointShapes(ps, joints);
  const ext = roadExtensions(ps, jointEnds(joints));
  const road = merged(ps.map((p, i) => ({ ...p, body: [...p.body, ...ext[i], ...bends.fill[i]] })));
  const junctions = roadJunctions(ps, road, jointEnds(joints));
  return { joints, junctions, centers: roadCenterLines(ps, joints, junctions) };
}
const lengthOf = (l: number[]) => {
  let s = 0;
  for (let i = 2; i < l.length; i += 2) s += Math.hypot(l[i] - l[i - 2], l[i + 1] - l[i - 1]);
  return s;
};

describe('road bends and joins', () => {
  it('two pieces meeting at an angle make one smooth bend, not a junction, and the yellow line runs round it', () => {
    const { joints, junctions, centers } = build([seg(150, 900, -90, 500), seg(150, 400, -70, 400)]);
    expect(joints.length).toBe(1);
    expect(junctions.stops).toEqual([]);
    // One double line (two polylines) running the whole way.
    expect(centers.length).toBe(2);
    for (const l of centers) expect(lengthOf(l)).toBeGreaterThan(880);
  });

  it('pieces overlapping by eye at a bend still join', () => {
    const { joints, centers } = build([seg(1900, 300, 90, 400), seg(1900, 680, 65, 300)]);
    expect(joints.length).toBe(1);
    expect(centers.length).toBe(2);
  });

  it('at a T the through road keeps its yellow line across; only the joining road stops', () => {
    const { junctions, centers } = build([seg(0, 200, 0, 800), seg(400, 700, -90, 440)]);
    expect(junctions.stops.length).toBe(1);
    // A line of the through road crosses the junction (x = 340..460) unbroken.
    expect(centers.some((l) => l[0] < 300 && l[l.length - 2] > 500)).toBe(true);
  });

  it('a road joining at a slant gets one stop bar, square across it, and the through road carries on', () => {
    const { junctions, centers } = build([seg(1100, 1200, 0, 700), seg(1080, 1650, -45, 530)]);
    expect(junctions.stops.length).toBe(1);
    const [x1, y1, x2, y2] = junctions.stops[0];
    // Square to the joining road (heading up-right at 45 degrees): the bar runs down-right.
    expect(Math.abs((x2 - x1) - (y2 - y1))).toBeLessThan(2);
    expect(centers.some((l) => l[0] < 1200 && l[l.length - 2] > 1700)).toBe(true);
  });

  it('a side road joining a bend is a T, not a four-way stop', () => {
    const { junctions, centers } = build([seg(150, 900, -90, 500), seg(150, 400, -70, 400), seg(820, 330, 182, 610)]);
    expect(junctions.stops.length).toBe(1);
    // The bent road's yellow line still runs unbroken round the bend.
    expect(centers.some((l) => lengthOf(l) > 880)).toBe(true);
  });

  it('a real crossroads still stops every way', () => {
    const { junctions, centers } = build([seg(100, 1300, 0, 800), seg(500, 950, 90, 700)]);
    expect(junctions.stops.length).toBe(4);
    for (const l of centers) expect(lengthOf(l)).toBeLessThan(400);
  });
});
