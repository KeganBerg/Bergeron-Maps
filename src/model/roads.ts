/**
 * Road junctions for merged roads: where pieces join, how far a road end
 * reaches to meet a nearby road, which areas are intersections, and where
 * their stop lines go. All in world coordinates.
 */
import { insideRings, intersectRings, ringsArea, unionRings, type Ring } from './shape';

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
export function roadExtensions(pieces: RoadPiece[]): Ring[][] {
  return pieces.map((p, i) => {
    const others = pieces.filter((_, j) => j !== i);
    const bodies = others.map((o) => o.body);
    const extra: Ring[] = [];
    for (const e of p.ends) {
      if (matchedEnd(e, others)) continue;
      const hits = rayHits(e, bodies, p.width * 2);
      if (!hits) continue;
      // Ends facing the outside of a bend have a natural wedge-shaped gap, so they may reach further.
      const k = hits.indexOf(Math.min(...hits));
      const [sx, sy] = pointOnEnd(e, RAYS[k]);
      const hit = others.find((o) => insideRings(o.body, sx + e.out[0] * (hits[k] + 1), sy + e.out[1] * (hits[k] + 1)));
      const reach = hit && !hit.axis ? p.width : p.width * 0.5;
      const close = hits.filter((h) => h <= reach).length;
      const far = Math.max(...hits);
      if (close * 2 >= hits.length && far > 1) extra.push(swath(e, -0.5, far + 1));
    }
    return extra;
  });
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
function stemArms(runs: Sample[][]): Sample[][] {
  const info = runs.map((r) => {
    const a = r[0], b = r[r.length - 1];
    const nx = (a.nx + b.nx) / 2, ny = (a.ny + b.ny) / 2;
    // Extent across the arm (along the junction edge).
    const ta = -a.x * ny + a.y * nx, tb = -b.x * ny + b.y * nx;
    return { nx, ny, lo: Math.min(ta, tb), hi: Math.max(ta, tb) };
  });
  const through = info.map((p, i) =>
    info.some((q, j) => {
      if (j === i || p.nx * q.nx + p.ny * q.ny > -0.95) return false;
      // q's extent measured on p's axis is reversed, since its normal points the other way.
      const lo = Math.max(p.lo, -q.hi), hi = Math.min(p.hi, -q.lo);
      return hi - lo > 0.5 * Math.min(p.hi - p.lo, q.hi - q.lo);
    }),
  );
  if (through.every(Boolean)) return runs;
  return runs.filter((_, i) => !through[i]);
}

export interface Junctions {
  /** Intersection areas: centre lines and arrows stop here. */
  areas: Ring[];
  /** Stop bars, as two-point lines (drawn STOP_LINE.width wide). */
  stops: Ring[];
}

/**
 * Finds intersections in a merged road: places where three or more arms
 * meet (a T, a crossroads, or a road meeting a bend). A road simply
 * continuing, or turning a corner, is not an intersection.
 */
export function roadJunctions(pieces: RoadPiece[], road: Ring[]): Junctions {
  const candidates: Ring[][] = [];
  pieces.forEach((p, i) => {
    const others = pieces.filter((_, j) => j !== i);
    const otherBodies = unionRings(others.flatMap((o) => o.body));
    for (const e of p.ends) {
      if (matchedEnd(e, others)) continue;
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
      const ahead = intersectRings([swath(e, 0, depth)], road);
      if (ringsArea(ahead) < p.width * Math.min(depth, p.width) * 0.25) continue;
      const behind = intersectRings([swath(e, -p.width, 0)], otherBodies);
      candidates.push(unionRings([...ahead, ...behind]));
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
  if (!junctions.length) return { areas: [], stops: [] };
  const areas = unionRings(junctions.flat());
  const stops: Ring[] = [];
  for (const ring of areas) for (const run of stemArms(armRuns([ring], road, minW * 0.3))) {
    const a = run[0], b = run[run.length - 1];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const ux = (b.x - a.x) / len, uy = (b.y - a.y) / len;
    // Stop short of the road's painted edge lines.
    const trim = STOP_TRIM;
    const nx = (a.nx + b.nx) / 2, ny = (a.ny + b.ny) / 2;
    const o = STOP_LINE.offset;
    stops.push([a.x + ux * trim + nx * o, a.y + uy * trim + ny * o, b.x - ux * trim + nx * o, b.y - uy * trim + ny * o]);
  }
  return { areas, stops };
}
