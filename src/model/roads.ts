/**
 * Road junctions for merged roads: where pieces join, how far a road end
 * reaches to meet a nearby road, which areas are intersections, and where
 * their stop lines go. All in world coordinates.
 */

import { insideRings, intersectRings, subtractRings, unionRings, type Ring } from './shape';
export { CENTER_ALIGN, offsetPolyline, roadCenterLines } from './roadCenterLines';
export { type Junctions, roadJunctions } from './roadJunctions';

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
  /** The piece's centre line from end 0 to end 1 (every straight or curved piece), used to blend seams. */
  spine?: number[];
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
  /** Nearly lined up (one road running on, placed a little off): blended by a smooth seam, not a bend. */
  near?: boolean;
}

/**
 * A ring wound the same way as piece outlines, so it adds to the road when
 * merged (wound the other way, the nonzero rule would cut it out as a hole).
 */
const outer = (r: Ring): Ring[] => unionRings([r]);

export const endKey = (piece: number, end: number) => `${piece}:${end}`;
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
        const dot = e.out[0] * f.out[0] + e.out[1] * f.out[1];
        const [ax, ay] = midOf(e), [bx, by] = midOf(f);
        // Nearly lined up, placed by eye: a road running on into the next piece a few
        // degrees or pixels off (a tilted road into a curve, say). Joined as one
        // road whose centre line eases across, instead of a junction with a stop bar.
        // Straight pieces exactly in line are handled elsewhere (their lines are lined up).
        if (dot < -NEAR_LINED_UP && !(Math.abs(cross) < 0.05 && p.axis && q.axis)) {
          const gap = Math.hypot(bx - ax, by - ay);
          if (gap > w * 0.4) return;
          const c: [number, number] = [(ax + bx) / 2, (ay + by) / 2];
          const sa = (c[0] - ax) * e.out[0] + (c[1] - ay) * e.out[1];
          const sb = (c[0] - bx) * f.out[0] + (c[1] - by) * f.out[1];
          found.push({ a: i, ea, b: j, eb, c, sa, sb, near: true, d: gap });
          return;
        }
        // Lined up (one road carrying straight on) is handled elsewhere; side by side or a T is not a bend.
        if (Math.abs(cross) < 0.05 || dot > -0.17) return;
        if (Math.hypot(bx - ax, by - ay) > w) return;
        // a + sa*outA = b + sb*outB
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

/** Cosine of the largest angle (about 12 degrees) between two road ends that still count as one road running on. */
const NEAR_LINED_UP = 0.978;

/** The ends taking part in a bend, as "piece:end" keys. */
export const jointEnds = (joints: RoadJoint[]) => new Set(joints.flatMap((j) => [endKey(j.a, j.ea), endKey(j.b, j.eb)]));

function disk(c: [number, number], r: number, steps = 40): Ring {
  const out: Ring = [];
  for (let i = 0; i < steps; i++) out.push(c[0] + Math.cos((i / steps) * Math.PI * 2) * r, c[1] + Math.sin((i / steps) * Math.PI * 2) * r);
  return out;
}

/** Point and direction (towards the end) on a piece's centre line, `back` px before end `e`. */
function spinePoint(p: RoadPiece, e: RoadEnd, back: number): { p: [number, number]; t: [number, number] } {
  const line = p.spine ?? p.center;
  if (line && line.length >= 4) {
    const c = cutLine(line, e, back);
    const n = c.pts.length;
    if (n >= 2) {
      const a = c.pts[n - 2], b = c.pts[n - 1];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len > 1e-6) return { p: b, t: [(b[0] - a[0]) / len, (b[1] - a[1]) / len] };
    }
  }
  const [mx, my] = midOf(e);
  return { p: [mx - e.out[0] * back, my - e.out[1] * back], t: e.out };
}

/** How far back from each end a seam starts: the road width, so the blend is long and gentle. */
const SEAM_REACH = 1;

/**
 * The blended seam of a nearly lined-up joint: a cubic centre line from a
 * point on A's line to a point on B's line, leaving each along its own
 * direction (so it carries on smoothly), and the band around it with the
 * width easing from A's to B's.
 */
export function seam(pieces: RoadPiece[], j: RoadJoint) {
  const pa = pieces[j.a], pb = pieces[j.b];
  const ea = pa.ends[j.ea], eb = pb.ends[j.eb];
  const reach = Math.min(pa.width, pb.width) * SEAM_REACH;
  const backA = Math.max(1, reach - j.sa), backB = Math.max(1, reach - j.sb);
  const A = spinePoint(pa, ea, backA), B = spinePoint(pb, eb, backB);
  const k = Math.hypot(B.p[0] - A.p[0], B.p[1] - A.p[1]) / 3;
  const c1 = [A.p[0] + A.t[0] * k, A.p[1] + A.t[1] * k], c2 = [B.p[0] + B.t[0] * k, B.p[1] + B.t[1] * k];
  const N = 24;
  const line: [number, number][] = [];
  const band: { l: number[]; r: number[] } = { l: [], r: [] };
  for (let i = 0; i <= N; i++) {
    const t = i / N, u = 1 - t;
    const x = u * u * u * A.p[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * B.p[0];
    const y = u * u * u * A.p[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * B.p[1];
    let dx = 3 * u * u * (c1[0] - A.p[0]) + 6 * u * t * (c2[0] - c1[0]) + 3 * t * t * (B.p[0] - c2[0]);
    let dy = 3 * u * u * (c1[1] - A.p[1]) + 6 * u * t * (c2[1] - c1[1]) + 3 * t * t * (B.p[1] - c2[1]);
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    // Smoothstep, so the width changes gently too.
    const s = t * t * (3 - 2 * t);
    const half = (pa.width * (1 - s) + pb.width * s) / 2;
    line.push([x, y]);
    band.l.push(x - dy * half, y + dx * half);
    band.r.push(x + dy * half, y - dx * half);
  }
  // Each end of the band reaches a hair back into its piece so the join leaves no hairline.
  const ring: Ring = [...band.l];
  for (let i = band.r.length - 2; i >= 0; i -= 2) ring.push(band.r[i], band.r[i + 1]);
  return { line, band: ring, backA, backB };
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
    if (j.near) {
      // A road running on a few degrees or pixels off: both ends are cut back
      // and replaced by one band that eases from one piece into the other, so the
      // edges and the centre line flow through with no step, dip or kink.
      const m = seam(pieces, j);
      const band = outer(m.band);
      fill[j.a].push(...band);
      const others = pieces.filter((_, k) => k !== j.a && k !== j.b).flatMap((o) => o.body);
      const ends = unionRings([
        ...intersectRings(pa.body, [swath(ea, -m.backA - 0.5, pa.width)]),
        ...intersectRings(pb.body, [swath(eb, -m.backB - 0.5, pb.width)]),
      ]);
      trim.push(...subtractRings(ends, [...band, ...others]));
      continue;
    }
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

export function pointOnEnd(e: RoadEnd, t: number): [number, number] {
  const [x1, y1, x2, y2] = e.seg;
  return [x1 + (x2 - x1) * t, y1 + (y2 - y1) * t];
}

/** The rectangle in front of (positive) or behind (negative) an end, from distance s0 to s1. */
export function swath(e: RoadEnd, s0: number, s1: number): Ring {
  const [x1, y1, x2, y2] = e.seg;
  const [nx, ny] = e.out;
  return [x1 + nx * s0, y1 + ny * s0, x2 + nx * s0, y2 + ny * s0, x2 + nx * s1, y2 + ny * s1, x1 + nx * s1, y1 + ny * s1];
}

/** Distance along the ray from (x, y) in direction d to the first point inside / outside `bodies`. */
export function march(bodies: Ring[][], x: number, y: number, d: [number, number], max: number, until: 'in' | 'out'): number | null {
  for (let s = 0.5; s <= max; s += ALONG_STEP) {
    const inside = inAny(bodies, x + d[0] * s, y + d[1] * s);
    if ((until === 'in') === inside) return s;
  }
  return null;
}

/** Does `e` meet an end of another piece head on (the road just continues)? */
export function matchedEnd(e: RoadEnd, others: RoadPiece[]): boolean {
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


/** Where rays start across an end (fractions of its length), out to its very edges. */
export const RAYS = [0.01, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.99];

/** Distances from points across an end to the first of `bodies`, or null if any ray misses within `reach`. */
export function rayHits(e: RoadEnd, bodies: Ring[][], reach: number): number[] | null {
  const out: number[] = [];
  for (const t of RAYS) {
    const [x, y] = pointOnEnd(e, t);
    const hit = march(bodies, x, y, e.out, reach, 'in');
    if (hit === null) return null;
    out.push(hit);
  }
  return out;
}


/** Distance from (x, y) to a polyline's first / last point. */
const nearStart = (l: number[], x: number, y: number) => Math.hypot(l[0] - x, l[1] - y) <= Math.hypot(l[l.length - 2] - x, l[l.length - 1] - y);

/**
 * Polyline `l` cut `back` px (along the line) before its end nearest end `e`.
 * Returns the points running towards that end, finishing at the cut point `p`,
 * and whether that end is the line's start.
 */
export function cutLine(l: number[], e: RoadEnd, back: number): { pts: [number, number][]; p: [number, number]; atStart: boolean } {
  const [mx, my] = midOf(e);
  const atStart = nearStart(l, mx, my);
  const pts: [number, number][] = [];
  for (let i = 0; i < l.length; i += 2) pts.push([l[i], l[i + 1]]);
  if (atStart) pts.reverse();
  let left = Math.max(0, back);
  while (pts.length > 1) {
    const a = pts[pts.length - 1], b = pts[pts.length - 2];
    const seg = Math.hypot(a[0] - b[0], a[1] - b[1]);
    if (seg >= left) {
      const t = seg > 1e-9 ? left / seg : 0;
      pts[pts.length - 1] = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      break;
    }
    left -= seg;
    pts.pop();
  }
  return { pts, p: pts[pts.length - 1], atStart };
}

/** A line cut by cutLine, carried on along `more`, back in its original direction. */
