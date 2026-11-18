/**
 * Road junctions for merged roads: where pieces join, how far a road end
 * reaches to meet a nearby road, which areas are intersections, and where
 * their stop lines go. All in world coordinates.
 */
import { growRings, insideRings, intersectRings, linesOutside, ringsArea, subtractRings, unionRings, type Ring } from './shape';

export interface RoadEnd {
  /** The open end as a segment [x1, y1, x2, y2]. */
  seg: number[];
  /** Unit vector pointing out of the piece, along the road. */
  out: [number, number];
}

export interface RoadPiece {
  /** World outline. */
  body: Ring[];
  ends: RoadEnd[];
  /** Road width (across the direction of travel). */
  width: number;
  /** Direction of travel of a straight piece (either way); missing for curves. */
  axis?: [number, number];
  /** Pieces painted with a double yellow centre line: that line, as a world polyline from end 0 to end 1. */
  center?: number[];
}

/**
 * Two road ends that meet at an angle, the road carrying on round a bend (not
 * a junction): piece `a`'s end `ea` and piece `b`'s end `eb`, whose centre
 * lines cross at `c`. `sa` / `sb` are how far `c` lies beyond each end
 * (negative: the piece runs on past it).
 */
export interface RoadJoint {
  a: number;
  ea: number;
  b: number;
  eb: number;
  c: [number, number];
  sa: number;
  sb: number;
}

/**
 * A ring wound the same way as piece outlines, so it adds to the road when
 * merged (wound the other way, the nonzero rule would cut it out as a hole).
 */
const outer = (r: Ring): Ring[] => unionRings([r]);

const endKey = (piece: number, end: number) => `${piece}:${end}`;
const midOf = (e: RoadEnd) => pointOnEnd(e, 0.5);

/**
 * Bends made of separate pieces: two ends that face each other and turn by
 * up to about 80 degrees, whose centre lines cross within a road width of
 * both ends. Each end joins at most one other (the closest).
 */
export function roadJoints(pieces: RoadPiece[]): RoadJoint[] {
  const found: (RoadJoint & { d: number })[] = [];
  pieces.forEach((p, i) => {
    for (let j = i + 1; j < pieces.length; j++) {
      const q = pieces[j];
      if (Math.abs(p.width - q.width) > 0.2 * Math.max(p.width, q.width)) continue;
      const w = Math.min(p.width, q.width);
      p.ends.forEach((e, ea) => q.ends.forEach((f, eb) => {
        const cross = e.out[0] * f.out[1] - e.out[1] * f.out[0];
        // Lined up (one road carrying straight on) is handled elsewhere; side by side or a T is not a bend.
        if (Math.abs(cross) < 0.05 || e.out[0] * f.out[0] + e.out[1] * f.out[1] > -0.17) return;
        const [ax, ay] = midOf(e), [bx, by] = midOf(f);
        if (Math.hypot(bx - ax, by - ay) > w) return;
        // a + sa·outA = b + sb·outB
        const sa = ((bx - ax) * f.out[1] - (by - ay) * f.out[0]) / cross;
        const sb = ((bx - ax) * e.out[1] - (by - ay) * e.out[0]) / cross;
        if (Math.abs(sa) > 0.75 * w || Math.abs(sb) > 0.75 * w) return;
        found.push({ a: i, ea, b: j, eb, c: [ax + e.out[0] * sa, ay + e.out[1] * sa], sa, sb, d: Math.hypot(bx - ax, by - ay) });
      }));
    }
  });
  found.sort((x, y) => x.d - y.d);
  const used = new Set<string>();
  const out: RoadJoint[] = [];
  for (const { d: _d, ...j } of found) {
    const ka = endKey(j.a, j.ea), kb = endKey(j.b, j.eb);
    if (used.has(ka) || used.has(kb)) continue;
    used.add(ka);
    used.add(kb);
    out.push(j);
  }
  return out;
}

/** The ends taking part in a bend, as "piece:end" keys. */
export const jointEnds = (joints: RoadJoint[]) => new Set(joints.flatMap((j) => [endKey(j.a, j.ea), endKey(j.b, j.eb)]));

function disk(c: [number, number], r: number, steps = 40): Ring {
  const out: Ring = [];
  for (let i = 0; i < steps; i++) out.push(c[0] + Math.cos((i / steps) * Math.PI * 2) * r, c[1] + Math.sin((i / steps) * Math.PI * 2) * r);
  return out;
}

/**
 * How bends are smoothed: `fill` per piece is added to the road (each end
 * stretched to the bend's centre, and a round outside corner), and `trim` is
 * taken off it (a piece's corner that pokes out past the bend because the
 * pieces overlap).
 */
export function jointShapes(pieces: RoadPiece[], joints: RoadJoint[]): { fill: Ring[][]; trim: Ring[] } {
  const fill: Ring[][] = pieces.map(() => []);
  const trim: Ring[] = [];
  for (const j of joints) {
    const pa = pieces[j.a], pb = pieces[j.b];
    const ea = pa.ends[j.ea], eb = pb.ends[j.eb];
    const r = Math.max(pa.width, pb.width) / 2;
    const round = disk(j.c, r);
    fill[j.a].push(...outer(round));
    if (j.sa > 0) fill[j.a].push(...outer(swath(ea, -0.5, j.sa + 0.5)));
    if (j.sb > 0) fill[j.b].push(...outer(swath(eb, -0.5, j.sb + 0.5)));
    const others = pieces.filter((_, k) => k !== j.a && k !== j.b).flatMap((o) => o.body);
    const poke = (e: RoadEnd, s: number, q: RoadPiece, f: RoadEnd, t: number) => {
      if (s >= -0.5) return;
      const beyond = swath(e, s, 0.5);
      const keep = [...q.body, swath(f, -0.5, Math.max(t, 0) + 0.5), round, ...others];
      trim.push(...subtractRings([beyond], keep));
    };
    poke(ea, j.sa, pb, eb, j.sb);
    poke(eb, j.sb, pa, ea, j.sa);
  }
  return { fill, trim };
}

const ALONG_STEP = 1;
/** Ends this close (map px) to another piece's end count as one road continuing. */
const END_MATCH = 4;
/** Stop bar thickness and its distance outside the junction. */
export const STOP_LINE = { width: 4, offset: 3 };
/** How far stop bars stop short of a road's painted edge lines. */
export const STOP_TRIM = 5.5;

const inAny = (bodies: Ring[][], x: number, y: number) => bodies.some((b) => insideRings(b, x, y));

function pointOnEnd(e: RoadEnd, t: number): [number, number] {
  const [x1, y1, x2, y2] = e.seg;
  return [x1 + (x2 - x1) * t, y1 + (y2 - y1) * t];
}

/** The rectangle in front of (positive) or behind (negative) an end, from distance s0 to s1. */
function swath(e: RoadEnd, s0: number, s1: number): Ring {
  const [x1, y1, x2, y2] = e.seg;
  const [nx, ny] = e.out;
  return [x1 + nx * s0, y1 + ny * s0, x2 + nx * s0, y2 + ny * s0, x2 + nx * s1, y2 + ny * s1, x1 + nx * s1, y1 + ny * s1];
}

/** Distance along the ray from (x, y) in direction d to the first point inside / outside `bodies`. */
function march(bodies: Ring[][], x: number, y: number, d: [number, number], max: number, until: 'in' | 'out'): number | null {
  for (let s = 0.5; s <= max; s += ALONG_STEP) {
    const inside = inAny(bodies, x + d[0] * s, y + d[1] * s);
    if ((until === 'in') === inside) return s;
  }
  return null;
}

/** Does `e` meet an end of another piece head on (the road just continues)? */
function matchedEnd(e: RoadEnd, others: RoadPiece[]): boolean {
  const near = (px: number, py: number, s: number[]) => {
    const [x1, y1, x2, y2] = s;
    const dx = x2 - x1, dy = y2 - y1;
    const l2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / l2));
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy)) <= END_MATCH;
  };
  return others.some((o) =>
    o.ends.some((f) => {
      const parallel = Math.abs(e.out[0] * f.out[1] - e.out[1] * f.out[0]) < 0.1;
      // One end lies along the other (same width, or a road narrowing into a lane).
      return parallel && ((near(f.seg[0], f.seg[1], e.seg) && near(f.seg[2], f.seg[3], e.seg)) || (near(e.seg[0], e.seg[1], f.seg) && near(e.seg[2], e.seg[3], f.seg)));
    }),
  );
}

/**
 * Road ends that stop short of another road are stretched to meet it, so a
 * road placed by eye against a bend or the side of another road joins it.
 * The end must face the other road: at least half of it reaches the road
 * within one road width, and all of it within two. Returns, per piece, the
 * extra area to add.
 */
export function roadExtensions(pieces: RoadPiece[], joined: Set<string> = new Set()): Ring[][] {
  return pieces.map((p, i) => {
    const others = pieces.filter((_, j) => j !== i);
    const bodies = others.map((o) => o.body);
    const extra: Ring[] = [];
    for (const [ei, e] of p.ends.entries()) {
      if (joined.has(endKey(i, ei)) || matchedEnd(e, others)) continue;
      const hits = rayHits(e, bodies, p.width * 2);
      if (!hits) continue;
      // Ends facing the outside of a bend have a natural wedge-shaped gap, so they may reach further.
      const k = hits.indexOf(Math.min(...hits));
      const [sx, sy] = pointOnEnd(e, RAYS[k]);
      const hit = others.find((o) => insideRings(o.body, sx + e.out[0] * (hits[k] + 1), sy + e.out[1] * (hits[k] + 1)));
      const reach = hit && !hit.axis ? p.width : p.width * 0.5;
      const close = hits.filter((h) => h <= reach).length;
      const far = Math.max(...hits);
      if (close * 2 < hits.length || far <= 1) continue;
      // Each part of the end reaches just as far as the road in front of it, so
      // an end meeting a road at a slant fills the gap without poking out past it.
      const back: number[] = [], front: number[] = [];
      RAYS.forEach((t, r) => {
        const [x, y] = pointOnEnd(e, t);
        back.push(x - e.out[0] * 0.5, y - e.out[1] * 0.5);
        front.push(x + e.out[0] * (hits[r] + 1), y + e.out[1] * (hits[r] + 1));
      });
      for (let r = front.length - 2; r >= 0; r -= 2) back.push(front[r], front[r + 1]);
      extra.push(...outer(back));
    }
    return extra;
  });
}

/** The part of straight piece `hit` (across its full width) that end `e`, carried on ahead, passes over. */
function slab(e: RoadEnd, hit: RoadPiece, road: Ring[]): Ring[] {
  const ax = hit.axis!, nr = [-ax[1], ax[0]];
  const u = (x: number, y: number) => x * ax[0] + y * ax[1];
  const v = (x: number, y: number) => x * nr[0] + y * nr[1];
  let v0 = Infinity, v1 = -Infinity;
  for (const r of hit.body) for (let i = 0; i < r.length; i += 2) {
    v0 = Math.min(v0, v(r[i], r[i + 1]));
    v1 = Math.max(v1, v(r[i], r[i + 1]));
  }
  const us: number[] = [];
  const dv = v(e.out[0], e.out[1]), du = u(e.out[0], e.out[1]);
  for (const [x, y] of [[e.seg[0], e.seg[1]], [e.seg[2], e.seg[3]]]) {
    us.push(u(x, y));
    // Where this corner's line crosses each side of the road.
    if (Math.abs(dv) > 1e-6) for (const side of [v0, v1]) us.push(u(x, y) + (du * (side - v(x, y))) / dv);
  }
  const u0 = Math.min(...us), u1 = Math.max(...us);
  const at = (a: number, b: number) => [ax[0] * a + nr[0] * b, ax[1] * a + nr[1] * b];
  return intersectRings([[...at(u0, v0), ...at(u1, v0), ...at(u1, v1), ...at(u0, v1)]], road);
}

/** Where rays start across an end (fractions of its length), out to its very edges. */
const RAYS = [0.01, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.99];

/** Distances from points across an end to the first of `bodies`, or null if any ray misses within `reach`. */
function rayHits(e: RoadEnd, bodies: Ring[][], reach: number): number[] | null {
  const out: number[] = [];
  for (const t of RAYS) {
    const [x, y] = pointOnEnd(e, t);
    const hit = march(bodies, x, y, e.out, reach, 'in');
    if (hit === null) return null;
    out.push(hit);
  }
  return out;
}

/** Points along a ring's edges, about every `step` px. */
function samplePerimeter(r: Ring, step: number): Sample[] {
  const out: Sample[] = [];
  const n = r.length / 2;
  for (let i = 0; i < n; i++) {
    const x1 = r[i * 2], y1 = r[i * 2 + 1];
    const x2 = r[((i + 1) % n) * 2], y2 = r[((i + 1) % n) * 2 + 1];
    const len = Math.hypot(x2 - x1, y2 - y1);
    if (len < 1e-6) continue;
    const k = Math.max(1, Math.round(len / step));
    for (let j = 0; j < k; j++) {
      const t = (j + 0.5) / k;
      out.push({ x: x1 + (x2 - x1) * t, y: y1 + (y2 - y1) * t, nx: -(y2 - y1) / len, ny: (x2 - x1) / len });
    }
  }
  return out;
}

/**
 * Stretches of a junction's outline where road carries on beyond it (the
 * arms), as straight runs of points just outside the junction.
 */
type Sample = { x: number; y: number; nx: number; ny: number };

function armRuns(area: Ring[], road: Ring[], minLen: number): Sample[][] {
  const runs: Sample[][] = [];
  for (const r of area) {
    const pts = samplePerimeter(r, 2);
    if (!pts.length) continue;
    // Point each normal out of the junction.
    const flags = pts.map((p) => {
      const s = insideRings(area, p.x + p.nx * 0.5, p.y + p.ny * 0.5) ? -1 : 1;
      p.nx *= s;
      p.ny *= s;
      const px = p.x + p.nx * 3, py = p.y + p.ny * 3;
      return insideRings(road, px, py) && !insideRings(area, px, py);
    });
    // Start the walk at a break, so a run never wraps around the start.
    const start = flags.findIndex((f, i) => !f || turned(pts, i));
    if (start < 0) continue;
    let cur: Sample[] = [];
    const flush = () => {
      if (cur.length >= 2) {
        const a = cur[0], b = cur[cur.length - 1];
        if (Math.hypot(b.x - a.x, b.y - a.y) >= minLen) runs.push(cur);
      }
      cur = [];
    };
    for (let k = 0; k < pts.length; k++) {
      const i = (start + k) % pts.length;
      if (!flags[i] || (cur.length && turned(pts, i))) flush();
      if (flags[i]) cur.push(pts[i]);
    }
    flush();
  }
  return runs;
}

/** Does the outline turn a corner between sample i-1 and sample i? */
function turned(pts: { nx: number; ny: number }[], i: number): boolean {
  const a = pts[(i - 1 + pts.length) % pts.length], b = pts[i];
  return a.nx * b.nx + a.ny * b.ny < 0.87;
}

/**
 * The arms of one junction that get a stop bar. At a T (or wherever a road
 * runs straight through and others join it from the side) the through road
 * keeps going without bars and only the joining roads stop, as painted on a
 * real street or a parking lot's main drive aisle. Where every arm has one
 * across from it (a crossroads), every arm stops.
 */
function throughArms(runs: Sample[][]): boolean[] {
  const info = runs.map((r) => {
    const a = r[0], b = r[r.length - 1];
    const nx = (a.nx + b.nx) / 2, ny = (a.ny + b.ny) / 2;
    // Extent across the arm (along the junction edge).
    const ta = -a.x * ny + a.y * nx, tb = -b.x * ny + b.y * nx;
    return { nx, ny, lo: Math.min(ta, tb), hi: Math.max(ta, tb) };
  });
  const through = info.map((p, i) =>
    info.some((q, j) => {
      // Roughly opposite: a through road may bend a little where a road joins it.
      if (j === i || p.nx * q.nx + p.ny * q.ny > -THROUGH_BEND) return false;
      // q's extent measured on p's axis is reversed, since its normal points the other way.
      const lo = Math.max(p.lo, -q.hi), hi = Math.min(p.hi, -q.lo);
      return hi - lo > 0.5 * Math.min(p.hi - p.lo, q.hi - q.lo);
    }),
  );
  // Every arm has one across from it: a crossroads, where every arm stops.
  return through.every(Boolean) ? through.map(() => false) : through;
}

/** Cosine of the sharpest bend (about 40 degrees) a road may take and still run straight through a junction. */
const THROUGH_BEND = 0.76;

export interface Junctions {
  /** Intersection areas: centre lines and arrows stop here. */
  areas: Ring[];
  /** Stop bars, as two-point lines (drawn STOP_LINE.width wide). */
  stops: Ring[];
  /** Each intersection, with the pieces of the road running straight through it (their centre lines carry on across). */
  each: { ring: Ring; through: Set<number> }[];
}

/**
 * Finds intersections in a merged road: places where three or more arms
 * meet (a T, a crossroads, or a road meeting a bend). A road simply
 * continuing, or turning a corner, is not an intersection.
 */
export function roadJunctions(pieces: RoadPiece[], road: Ring[], joined: Set<string> = new Set()): Junctions {
  const candidates: Ring[][] = [];
  pieces.forEach((p, i) => {
    const others = pieces.filter((_, j) => j !== i);
    const otherBodies = unionRings(others.flatMap((o) => o.body));
    for (const [ei, e] of p.ends.entries()) {
      if (joined.has(endKey(i, ei)) || matchedEnd(e, others)) continue;
      const [mx, my] = pointOnEnd(e, 0.5);
      // How far the road goes on beyond this end, and how wide the road it meets is.
      const exit = march([road], mx, my, e.out, 800, 'out') ?? 800;
      const hits = rayHits(e, others.map((o) => o.body), exit + 1);
      if (!hits) continue;
      const near = Math.min(...hits);
      const k = hits.indexOf(near);
      const [sx, sy] = pointOnEnd(e, RAYS[k]);
      const hit = others.find((o) => insideRings(o.body, sx + e.out[0] * (near + 1), sy + e.out[1] * (near + 1)));
      // Running into a road going the same way is the road carrying on (it may be wider), not a junction.
      if (hit?.axis && Math.abs(hit.axis[0] * e.out[1] - hit.axis[1] * e.out[0]) < 0.1) continue;
      // A straight road is crossed at its width past where it starts. A bend met
      // from its outside (a road lined up with the bend's other arm) becomes part
      // of the junction all the way through, so no curved centre line is left
      // running across it.
      let depth = near + Math.max(p.width, hit?.width ?? 0) + 8;
      if (hit && !hit.axis) {
        const hx = sx + e.out[0] * (near + 1), hy = sy + e.out[1] * (near + 1);
        depth = near + 1 + (march([hit.body], hx, hy, e.out, 800, 'out') ?? 0);
      }
      depth = Math.min(exit, depth);
      let ahead = intersectRings([swath(e, 0, depth)], road);
      if (ringsArea(ahead) < p.width * Math.min(depth, p.width) * 0.25) continue;
      // Joining a straight road at a slant: the junction is the stretch of that
      // road the joining one covers, cut square to it, so the road running
      // through has clean, matching arms on both sides.
      if (hit?.axis && Math.abs(hit.axis[0] * e.out[0] + hit.axis[1] * e.out[1]) > 0.2) ahead = unionRings([...slab(e, hit, road), ...ahead]);
      const behind = intersectRings([swath(e, -p.width, 0)], otherBodies);
      // A road joining at a slant runs into the other road one corner first: the
      // junction reaches back until all of it is clear, so its stop bar goes
      // straight across it there instead of along the other road's edge.
      const backs = RAYS.map((t) => {
        const [x, y] = pointOnEnd(e, t);
        return march([otherBodies], x, y, [-e.out[0], -e.out[1]], p.width * 2, 'out') ?? 0;
      });
      const back = Math.max(...backs);
      const clear = back > 2 && Math.max(...backs) - Math.min(...backs) > 2 ? intersectRings([swath(e, -back, 0)], road) : [];
      candidates.push(unionRings([...ahead, ...behind, ...clear]));
    }
    // Crossings: two pieces overlapping away from either one's ends.
    for (let j = i + 1; j < pieces.length; j++) {
      const q = pieces[j];
      const both = intersectRings(p.body, q.body);
      if (ringsArea(both) < 1) continue;
      const endInside = [...p.ends, ...q.ends].some((e) => [0.1, 0.5, 0.9].some((t) => insideRings(both, ...pointOnEnd(e, t))));
      if (!endInside) candidates.push(both);
    }
  });

  const minW = Math.min(...pieces.map((p) => p.width));
  const junctions = candidates.filter((area) => armRuns(area, road, minW * 0.3).length >= 3);
  if (!junctions.length) return { areas: [], stops: [], each: [] };
  const areas = unionRings(junctions.flat());
  const stops: Ring[] = [];
  const each: Junctions['each'] = [];
  for (const ring of areas) {
    const runs = armRuns([ring], road, minW * 0.3);
    const through = throughArms(runs);
    const pass = new Set<number>();
    runs.forEach((run, k) => {
      if (!through[k]) return;
      const m = run[Math.floor(run.length / 2)];
      pieces.forEach((p, i) => {
        // Just past the junction may still be a bend's rounded corner, so look a little further too.
        if ([4, minW * 0.4].some((d) => insideRings(p.body, m.x + m.nx * d, m.y + m.ny * d))) pass.add(i);
      });
    });
    each.push({ ring, through: pass });
    for (const run of runs.filter((_, k) => !through[k])) {
    const a = run[0], b = run[run.length - 1];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const ux = (b.x - a.x) / len, uy = (b.y - a.y) / len;
    // Stop short of the road's painted edge lines.
    const trim = STOP_TRIM;
    const nx = (a.nx + b.nx) / 2, ny = (a.ny + b.ny) / 2;
    const o = STOP_LINE.offset;
    stops.push([a.x + ux * trim + nx * o, a.y + uy * trim + ny * o, b.x - ux * trim + nx * o, b.y - uy * trim + ny * o]);
    }
  }
  return { areas, stops, each };
}

/** In-line pieces whose centre lines are this close (map px) are lined up with each other. */
export const CENTER_ALIGN = 6;

/** Distance from (x, y) to a polyline's first / last point. */
const nearStart = (l: number[], x: number, y: number) => Math.hypot(l[0] - x, l[1] - y) <= Math.hypot(l[l.length - 2] - x, l[l.length - 1] - y);

/** Ends polyline `l`, at its end nearest end `e`, at point `c` (trimming what runs past it), then on along `more`. */
function toBend(l: number[], e: RoadEnd, c: [number, number], more: [number, number][]): number[] {
  const [mx, my] = midOf(e);
  const pts: [number, number][] = [];
  for (let i = 0; i < l.length; i += 2) pts.push([l[i], l[i + 1]]);
  const start = nearStart(l, mx, my);
  if (start) pts.reverse();
  // Drop points beyond the bend's centre, then finish at it.
  while (pts.length > 1 && (pts[pts.length - 1][0] - c[0]) * e.out[0] + (pts[pts.length - 1][1] - c[1]) * e.out[1] > -0.01) pts.pop();
  pts.push(c, ...more);
  if (start) pts.reverse();
  return pts.flat();
}

/** A polyline moved d px to one side, with mitred corners. */
export function offsetPolyline(l: number[], d: number): number[] {
  const n = l.length / 2;
  const seg: [number, number][] = [];
  for (let i = 0; i + 1 < n; i++) {
    const dx = l[i * 2 + 2] - l[i * 2], dy = l[i * 2 + 3] - l[i * 2 + 1];
    const len = Math.hypot(dx, dy) || 1;
    seg.push([-dy / len, dx / len]);
  }
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = seg[Math.max(0, i - 1)], b = seg[Math.min(seg.length - 1, i)];
    let nx = a[0] + b[0], ny = a[1] + b[1];
    const len = Math.hypot(nx, ny);
    if (len < 1e-6) [nx, ny] = b;
    else {
      nx /= len;
      ny /= len;
    }
    // Mitre: push the corner out so both sides stay d away, but never more than 3d.
    const k = Math.min(3, 1 / Math.max(1 / 3, nx * b[0] + ny * b[1]));
    out.push(l[i * 2] + nx * d * k, l[i * 2 + 1] + ny * d * k);
  }
  return out;
}

/** Joins polylines whose ends meet exactly (the two halves of a bend) into longer ones. */
function chain(lines: number[][]): number[][] {
  const out = lines.map((l) => [...l]);
  const same = (l: number[], i: number, m: number[], k: number) => Math.abs(l[i] - m[k]) < 1e-6 && Math.abs(l[i + 1] - m[k + 1]) < 1e-6;
  const rev = (l: number[]) => {
    const r: number[] = [];
    for (let i = l.length - 2; i >= 0; i -= 2) r.push(l[i], l[i + 1]);
    return r;
  };
  let joined = true;
  while (joined) {
    joined = false;
    for (let i = 0; i < out.length && !joined; i++)
      for (let j = i + 1; j < out.length && !joined; j++) {
        let a = out[i], b = out[j];
        const ea = a.length - 2, eb = b.length - 2;
        if (same(a, ea, b, 0)) out[i] = [...a, ...b.slice(2)];
        else if (same(a, ea, b, eb)) out[i] = [...a, ...rev(b).slice(2)];
        else if (same(a, 0, b, eb)) out[i] = [...b, ...a.slice(2)];
        else if (same(a, 0, b, 0)) out[i] = [...rev(b), ...a.slice(2)];
        else continue;
        out.splice(j, 1);
        joined = true;
        a = b = [];
      }
  }
  return out;
}

/**
 * The double yellow centre lines of a merged road, as pairs of world
 * polylines (each line of the pair drawn on its own). Lines run on round a
 * bend made of separate pieces, carry straight on through a T where the road
 * runs through, and stop short of the stop bars of roads that join it or meet
 * at a crossroads.
 */
export function roadCenterLines(pieces: RoadPiece[], joints: RoadJoint[], junctions: Junctions, gap = 2): number[][] {
  const lines = pieces.map((p) => (p.center ? [...p.center] : null));
  const partner = new Map<number, Set<number>>();
  const link = (a: number, b: number) => {
    partner.set(a, (partner.get(a) ?? new Set()).add(b));
    partner.set(b, (partner.get(b) ?? new Set()).add(a));
  };
  for (const j of joints) {
    link(j.a, j.b);
    const la = lines[j.a], lb = lines[j.b];
    if (!la || !lb) continue;
    // Round the turn: each line stops short of the bend's centre and a curve joins them.
    const ea = pieces[j.a].ends[j.ea], eb = pieces[j.b].ends[j.eb];
    const r = Math.min(pieces[j.a].width, pieces[j.b].width) / 2;
    const q0: [number, number] = [j.c[0] - ea.out[0] * r, j.c[1] - ea.out[1] * r];
    const q2: [number, number] = [j.c[0] - eb.out[0] * r, j.c[1] - eb.out[1] * r];
    const turn: [number, number][] = [];
    for (let k = 1; k <= 12; k++) {
      const t = k / 12, u = 1 - t;
      turn.push(k === 12 ? q2 : [u * u * q0[0] + 2 * u * t * j.c[0] + t * t * q2[0], u * u * q0[1] + 2 * u * t * j.c[1] + t * t * q2[1]]);
    }
    lines[j.a] = toBend(la, ea, q0, turn);
    lines[j.b] = toBend(lb, eb, q2, []);
  }
  // Straight pieces laid end to end along one road: a piece a few px off has its line moved onto the first one's.
  pieces.forEach((p, i) => {
    const l = lines[i];
    if (!l || !p.axis) return;
    const n = [-p.axis[1], p.axis[0]];
    for (let j = 0; j < i; j++) {
      const q = pieces[j], m = lines[j];
      if (!m || !q.axis || Math.abs(p.axis[0] * q.axis[1] - p.axis[1] * q.axis[0]) > 0.05) continue;
      const d = (m[0] - l[0]) * n[0] + (m[1] - l[1]) * n[1];
      if (Math.abs(d) > CENTER_ALIGN) continue;
      link(i, j);
      if (Math.abs(d) > 0.05) lines[i] = l.map((v, k) => v + n[k % 2] * d);
      break;
    }
  });
  const stopZone = (r: Ring) => growRings([r], STOP_LINE.offset + STOP_LINE.width / 2 + 1);
  const clipped: number[][] = [];
  pieces.forEach((p, i) => {
    const l = lines[i];
    if (!l) return;
    const passes = junctions.each.filter((x) => x.through.has(i)).map((x) => x.ring);
    const stop = junctions.each.filter((x) => !x.through.has(i)).flatMap((x) => stopZone(x.ring));
    // Where another piece (not one carrying this road on) lies over this one.
    const over = pieces.flatMap((q, j) => (j === i || partner.get(i)?.has(j) ? [] : intersectRings(p.body, q.body)));
    const clip = unionRings([...stop, ...(passes.length ? subtractRings(over, passes) : over)]);
    clipped.push(...linesOutside([l], clip));
  });
  return chain(clipped).flatMap((l) => [offsetPolyline(l, gap), offsetPolyline(l, -gap)]);
}
