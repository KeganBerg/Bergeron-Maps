/**
 * Outline geometry for shapeable objects: rounded or beveled corners, curved
 * pieces (circles, half circles, quarter rounds, curved bands, L corners),
 * cut-outs, and the automatic merging of neighbouring landscape pieces.
 *
 * Polygon math (union, difference, offset) is done with Clipper, in integer
 * coordinates scaled by SCALE. Rings come back as flat [x0, y0, x1, y1, ...]
 * arrays; outer rings and holes have opposite winding, so drawing them all in
 * one path with the nonzero rule shows the holes.
 */
import ClipperLib from 'clipper-lib';
import type { MapObject } from './types';

export type OutlineKind = 'rect' | 'ellipse' | 'half' | 'quarter' | 'arc' | 'L';

/** A ring as flat x,y pairs. */
export type Ring = number[];

const SCALE = 100;
const ARC_STEPS = 48;

type IntPath = { X: number; Y: number }[];

const toInt = (r: Ring): IntPath => {
  const p: IntPath = [];
  for (let i = 0; i < r.length; i += 2) p.push({ X: Math.round(r[i] * SCALE), Y: Math.round(r[i + 1] * SCALE) });
  return p;
};
const fromInt = (p: IntPath): Ring => p.flatMap((pt) => [pt.X / SCALE, pt.Y / SCALE]);

function ellipsePoints(cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, steps: number): Ring {
  const out: Ring = [];
  for (let i = 0; i <= steps; i++) {
    const a = a0 + ((a1 - a0) * i) / steps;
    out.push(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry);
  }
  return out;
}

/** Thickness of curved bands and L corners, in map pixels. */
export const bandWidth = (o: { width: number; height: number; band?: number }) =>
  Math.max(4, Math.min(o.band ?? Math.min(o.width, o.height) * 0.3, Math.min(o.width, o.height) - 2));

/** The basic outline of a w × h piece, in the object's own coordinates (0,0 top-left). */
export function basePolygon(kind: OutlineKind, w: number, h: number, band = Math.min(w, h) * 0.3): Ring {
  const H = Math.PI / 2;
  switch (kind) {
    case 'ellipse':
      return ellipsePoints(w / 2, h / 2, w / 2, h / 2, 0, Math.PI * 2, ARC_STEPS * 2).slice(0, -2);
    case 'half':
      // Flat edge along the bottom, dome on top.
      return ellipsePoints(w / 2, h, w / 2, h, Math.PI, Math.PI * 2, ARC_STEPS);
    case 'quarter':
      // Pie wedge: the square corner sits bottom-left.
      return [0, h, ...ellipsePoints(0, h, w, h, -H, 0, ARC_STEPS)];
    case 'arc': {
      // Curved band: a quarter ring around the bottom-left corner.
      const t = Math.min(band, w - 1, h - 1);
      const outer = ellipsePoints(0, h, w, h, -H, 0, ARC_STEPS);
      const inner = ellipsePoints(0, h, w - t, h - t, 0, -H, ARC_STEPS);
      return [...outer, ...inner];
    }
    case 'L': {
      const t = Math.min(band, w - 1, h - 1);
      return [0, 0, t, 0, t, h - t, w, h - t, w, h, 0, h];
    }
    default:
      return [0, 0, w, 0, w, h, 0, h];
  }
}

function offset(paths: IntPath[], delta: number, join: number): IntPath[] {
  if (!paths.length || delta === 0) return paths;
  const co = new ClipperLib.ClipperOffset(2, 0.25 * SCALE);
  co.AddPaths(paths, join, ClipperLib.EndType.etClosedPolygon);
  const out: IntPath[] = [];
  co.Execute(out, delta * SCALE);
  return out;
}

function boolean(subject: IntPath[], clip: IntPath[], op: number): IntPath[] {
  const c = new ClipperLib.Clipper();
  c.AddPaths(subject, ClipperLib.PolyType.ptSubject, true);
  if (clip.length) c.AddPaths(clip, ClipperLib.PolyType.ptClip, true);
  const out: IntPath[] = [];
  c.Execute(op, out, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);
  return out;
}

/**
 * Rounds (or bevels) every corner, convex and concave, with radius r:
 * a closing (grow then shrink) rounds the inside corners, an opening
 * (shrink then grow) the outside ones.
 */
function roundCorners(paths: IntPath[], r: number, bevel: boolean): IntPath[] {
  if (r <= 0) return paths;
  const join = bevel ? ClipperLib.JoinType.jtSquare : ClipperLib.JoinType.jtRound;
  const closed = offset(offset(paths, r, join), -r, join);
  return offset(offset(closed, -r, join), r, join);
}

/** Largest corner radius that keeps the piece in one piece. */
export function maxCorner(o: ShapeSource): number {
  const thin = o.outline === 'arc' || o.outline === 'L' ? bandWidth(o) : Math.min(o.width, o.height);
  return Math.max(0, Math.floor(thin / 2 - 1));
}

export interface ShapeSource {
  width: number;
  height: number;
  outline?: OutlineKind;
  corner?: number;
  bevel?: boolean;
  band?: number;
  /** Cut-outs as flat rings in fractions of width/height (0..1), so they stretch with the object. */
  cuts?: number[][];
}

/** Does this object need a custom outline, or is it a plain box? */
export const isShaped = (o: ShapeSource) =>
  (o.outline && o.outline !== 'rect') || (o.corner ?? 0) > 0 || !!o.cuts?.length;

const cache = new Map<string, Ring[]>();

/** The object's final outline in its own coordinates: base shape, rounded, minus cuts. */
export function localOutline(o: ShapeSource, withCuts = true): Ring[] {
  const key = JSON.stringify([o.width, o.height, o.outline, o.corner, o.bevel, o.band, withCuts ? o.cuts : null]);
  const hit = cache.get(key);
  if (hit) return hit;
  let paths = [toInt(basePolygon(o.outline ?? 'rect', o.width, o.height, bandWidth(o)))];
  paths = boolean(paths, [], ClipperLib.ClipType.ctUnion);
  paths = roundCorners(paths, Math.min(o.corner ?? 0, maxCorner(o)), !!o.bevel);
  if (withCuts && o.cuts?.length) paths = boolean(paths, cutRings(o).map(toInt), ClipperLib.ClipType.ctDifference);
  const rings = paths.map(fromInt);
  if (cache.size > 500) cache.clear();
  cache.set(key, rings);
  return rings;
}

/** Cut rings in the object's own coordinates (pixels). */
export function cutRings(o: Pick<ShapeSource, 'width' | 'height' | 'cuts'>): Ring[] {
  return (o.cuts ?? []).map((c) => c.map((v, i) => v * (i % 2 ? o.height : o.width)));
}

type Placed = Pick<MapObject, 'x' | 'y' | 'width' | 'height' | 'rotation'>;

/** Object-local point → world point (objects rotate around their center). */
export function toWorld(o: Placed, x: number, y: number): [number, number] {
  const a = (o.rotation * Math.PI) / 180;
  const lx = x - o.width / 2;
  const ly = y - o.height / 2;
  return [o.x + lx * Math.cos(a) - ly * Math.sin(a), o.y + lx * Math.sin(a) + ly * Math.cos(a)];
}

/** World point → object-local point. */
export function toLocal(o: Placed, x: number, y: number): [number, number] {
  const a = (-o.rotation * Math.PI) / 180;
  const dx = x - o.x;
  const dy = y - o.y;
  return [dx * Math.cos(a) - dy * Math.sin(a) + o.width / 2, dx * Math.sin(a) + dy * Math.cos(a) + o.height / 2];
}

const ringToWorld = (o: Placed, r: Ring): Ring => {
  const out: Ring = [];
  for (let i = 0; i < r.length; i += 2) out.push(...toWorld(o, r[i], r[i + 1]));
  return out;
};

export interface MergeMember extends Placed, ShapeSource {
  blend?: number;
}

const areaOf = (paths: IntPath[]) => paths.reduce((s, p) => s + ClipperLib.Clipper.Area(p), 0) / (SCALE * SCALE);
const overlaps = (a: IntPath[], b: IntPath[]) => Math.abs(areaOf(boolean(a, b, ClipperLib.ClipType.ctIntersection))) > 0.01;

interface IntBox { x1: number; y1: number; x2: number; y2: number }
function boundsOf(paths: IntPath[]): IntBox {
  const b = { x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity };
  for (const p of paths) for (const pt of p) {
    if (pt.X < b.x1) b.x1 = pt.X;
    if (pt.Y < b.y1) b.y1 = pt.Y;
    if (pt.X > b.x2) b.x2 = pt.X;
    if (pt.Y > b.y2) b.y2 = pt.Y;
  }
  return b;
}
const boxesNear = (a: IntBox, b: IntBox, d: number) => a.x1 - d <= b.x2 && b.x1 - d <= a.x2 && a.y1 - d <= b.y2 && b.y1 - d <= a.y2;

/** Groups indices into connected sets, where `linked(i, j)` says two items join. */
function components(n: number, linked: (i: number, j: number) => boolean): number[][] {
  const parent = [...Array(n).keys()];
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (find(i) !== find(j) && linked(i, j)) parent[find(i)] = find(j);
  const out = new Map<number, number[]>();
  for (let i = 0; i < n; i++) out.set(find(i), [...(out.get(find(i)) ?? []), i]);
  return [...out.values()];
}

export interface MergedCluster {
  /** Indices into the members array, in their original order. */
  members: number[];
  rings: Ring[];
}

/**
 * Merges landscape pieces into clean shapes, like metaballs.
 *
 * Pieces that overlap or touch become one shape with one outline and sharp,
 * exact corners where they join (no notches). Pieces that are close but not
 * touching (within `blend`) get a smooth bridge between them; the rounding
 * is added only in the gap, never to the pieces' own corners. Pieces farther
 * apart stay separate clusters. Cuts are applied last so they stay crisp.
 */
export function mergeClusters(members: MergeMember[]): MergedCluster[] {
  if (!members.length) return [];
  const shapes = members.map((m) => boolean(localOutline(m, false).map((r) => toInt(ringToWorld(m, r))), [], ClipperLib.ClipType.ctUnion));
  const blendOf = (m: MergeMember) => Math.max(0, m.blend ?? DEFAULT_BLEND);
  const boxes = shapes.map(boundsOf);
  // Grown a hair so pieces that share an edge exactly count as touching.
  const touch = shapes.map((p) => offset(p, 0.5, ClipperLib.JoinType.jtMiter));
  const grown = shapes.map((p, i) => offset(p, blendOf(members[i]) / 2 + 0.5, ClipperLib.JoinType.jtRound));
  const near = (i: number, j: number) => boxesNear(boxes[i], boxes[j], (Math.max(blendOf(members[i]), blendOf(members[j])) + 2) * SCALE);
  const clusters = components(members.length, (i, j) => near(i, j) && overlaps(grown[i], grown[j]));

  return clusters.map((idx) => {
    const aligned = alignEdges(idx.map((i) => shapes[i]));
    let paths = boolean(aligned.flat(), [], ClipperLib.ClipType.ctUnion);
    if (idx.length > 1) {
      // Where pieces meet at a shallow angle (a circle resting on a strip) the
      // union leaves thin wedges and slits. A small closing fills anything
      // narrower than 2 × FILL_SLIVERS; square joins keep a barely visible radius.
      const j = ClipperLib.JoinType.jtRound;
      paths = offset(offset(paths, FILL_SLIVERS, j), -FILL_SLIVERS, j);
    }
    const blend = Math.max(...idx.map((i) => blendOf(members[i])));
    if (idx.length > 1 && blend > 0) {
      // Solid parts: pieces that actually overlap or touch.
      const solid = components(idx.length, (a, b) => near(idx[a], idx[b]) && overlaps(touch[idx[a]], touch[idx[b]])).map((c) =>
        boolean(c.flatMap((k) => shapes[idx[k]]), [], ClipperLib.ClipType.ctUnion),
      );
      if (solid.length > 1) {
        const j = ClipperLib.JoinType.jtRound;
        const close = (p: IntPath[]) => offset(offset(p, blend / 2, j), -blend / 2, j);
        // Bridge = what closing the whole cluster adds, minus what closing each solid part alone adds.
        const bridge = boolean(close(paths), solid.flatMap(close), ClipperLib.ClipType.ctDifference);
        // Grown by a pixel so it fuses with the pieces instead of leaving a hairline seam.
        paths = boolean(paths, offset(bridge, 1, j), ClipperLib.ClipType.ctUnion);
      }
    }
    const cuts = idx.flatMap((i) => cutRings(members[i]).map((r) => toInt(ringToWorld(members[i], r))));
    if (cuts.length) paths = boolean(paths, cuts, ClipperLib.ClipType.ctDifference);
    // Drop slivers left by rounding.
    paths = paths.filter((p) => Math.abs(ClipperLib.Clipper.Area(p)) / (SCALE * SCALE) > 0.5);
    return { members: idx, rings: paths.map(fromInt) };
  });
}

/** All merged outlines as one list of rings (every cluster together). */
export function mergeOutlines(members: MergeMember[]): Ring[] {
  return mergeClusters(members).flatMap((c) => c.rings);
}

/** Gaps and wedges narrower than twice this (map px) inside a merged shape are filled. */
const FILL_SLIVERS = 3;

/** Straight edges of different pieces closer than this (map px) are lined up before merging. */
const ALIGN_TOLERANCE = 2.5;

/**
 * Pieces placed by hand rarely line up to the pixel, and a 1-2 px offset
 * shows as a notch where they join. Horizontal and vertical edges of later
 * pieces that sit within ALIGN_TOLERANCE of an earlier piece's edge are moved
 * onto it. Only vertices exactly on such an edge move, so curves are untouched.
 */
function alignEdges(pieces: IntPath[][]): IntPath[][] {
  const tol = ALIGN_TOLERANCE * SCALE;
  const levels = (paths: IntPath[], axis: 'X' | 'Y') => {
    const other = axis === 'X' ? 'Y' : 'X';
    const out = new Set<number>();
    for (const p of paths)
      for (let i = 0; i < p.length; i++) {
        const a = p[i];
        const b = p[(i + 1) % p.length];
        if (a[axis] === b[axis] && Math.abs(a[other] - b[other]) > tol * 2) out.add(a[axis]);
      }
    return [...out];
  };
  const anchors: Record<'X' | 'Y', number[]> = { X: [], Y: [] };
  return pieces.map((paths) => {
    const moved = paths.map((p) => p.map((pt) => ({ ...pt })));
    for (const axis of ['X', 'Y'] as const) {
      const own = levels(paths, axis);
      for (const v of own) {
        const target = anchors[axis].find((t) => t !== v && Math.abs(t - v) <= tol);
        if (target === undefined) continue;
        for (const p of moved) for (const pt of p) if (pt[axis] === v) pt[axis] = target;
      }
      anchors[axis].push(...own);
    }
    return moved;
  });
}

/** How close (map px) two landscape pieces must be to flow together. */
export const DEFAULT_BLEND = 16;

/**
 * Converts a cut drawn in world coordinates into the object's own
 * fractional coordinates, or null if it misses the object.
 */
export function cutForObject(o: Placed & ShapeSource, worldRing: Ring): number[] | null {
  const local: Ring = [];
  for (let i = 0; i < worldRing.length; i += 2) local.push(...toLocal(o, worldRing[i], worldRing[i + 1]));
  const hit = boolean(localOutline(o).map(toInt), [toInt(local)], ClipperLib.ClipType.ctIntersection);
  const area = hit.reduce((s, p) => s + Math.abs(ClipperLib.Clipper.Area(p)), 0) / (SCALE * SCALE);
  if (area < 1) return null;
  return local.map((v, i) => Math.round((v / (i % 2 ? o.height : o.width)) * 10000) / 10000);
}

/** Simplifies a freehand stroke: drops points closer than `minStep` to the previous kept one. */
export function simplifyStroke(points: Ring, minStep: number): Ring {
  const out: Ring = [];
  for (let i = 0; i < points.length; i += 2) {
    const n = out.length;
    if (n && Math.hypot(points[i] - out[n - 2], points[i + 1] - out[n - 1]) < minStep) continue;
    out.push(points[i], points[i + 1]);
  }
  return out;
}

/** Area of all rings (holes subtract), for tests and sanity checks. */
export function ringsArea(rings: Ring[]): number {
  let a = 0;
  for (const r of rings) {
    let s = 0;
    for (let i = 0; i < r.length; i += 2) {
      const j = (i + 2) % r.length;
      s += r[i] * r[j + 1] - r[j] * r[i + 1];
    }
    a += s / 2;
  }
  return Math.abs(a);
}

/** Traces rings into a canvas path (for Konva sceneFunc / clipFunc). */
export function traceRings(ctx: { beginPath(): void; moveTo(x: number, y: number): void; lineTo(x: number, y: number): void; closePath(): void }, rings: Ring[]) {
  ctx.beginPath();
  for (const r of rings) {
    if (r.length < 6) continue;
    ctx.moveTo(r[0], r[1]);
    for (let i = 2; i < r.length; i += 2) ctx.lineTo(r[i], r[i + 1]);
    ctx.closePath();
  }
}


/** How far (map px) outline points may sit from a road end and still count as on it (edges get lined up by up to ALIGN_TOLERANCE). */
const END_TOLERANCE = ALIGN_TOLERANCE + 0.5;

/** World rings `a` minus world rings `b`. */
export function subtractRings(a: Ring[], b: Ring[]): Ring[] {
  if (!b.length) return a;
  return boolean(a.map(toInt), b.map(toInt), ClipperLib.ClipType.ctDifference).map(fromInt);
}

/** Even-odd point-in-rings test. */
function insideRings(rings: Ring[], x: number, y: number): boolean {
  let inside = false;
  for (const r of rings)
    for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
      const [xi, yi, xj, yj] = [r[i], r[i + 1], r[j], r[j + 1]];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
  return inside;
}

function distToSegment(px: number, py: number, s: number[]): number {
  const [x1, y1, x2, y2] = s;
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2)) : 0;
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

/**
 * Painted edge lines for a merged road: the outline of `rings`, moved `inset`
 * px inside, as open polylines. Stretches of outline that lie on a road's
 * open end (`ends`: world segments [x1, y1, x2, y2]) get no line, and the
 * lines beside them run all the way out to the end, as on a single piece.
 */
export function insetLines(rings: Ring[], ends: number[][], inset: number): Ring[] {
  const out: Ring[] = [];
  for (const raw of rings) {
    const P: [number, number][] = [];
    for (let i = 0; i < raw.length; i += 2) {
      const last = P[P.length - 1];
      // Points closer than half a pixel only add jitter (and miter spikes) to the line.
      if (!last || Math.hypot(raw[i] - last[0], raw[i + 1] - last[1]) > 0.5) P.push([raw[i], raw[i + 1]]);
    }
    while (P.length > 1 && Math.hypot(P[0][0] - P[P.length - 1][0], P[0][1] - P[P.length - 1][1]) <= 0.5) P.pop();
    const n = P.length;
    if (n < 3) continue;
    const d = P.map((p, i) => {
      const q = P[(i + 1) % n];
      const l = Math.hypot(q[0] - p[0], q[1] - p[1]);
      return [(q[0] - p[0]) / l, (q[1] - p[1]) / l];
    });
    // Which side is inside: test just off the middle of the longest edge.
    let k = 0;
    const lenOf = (i: number) => Math.hypot(P[(i + 1) % n][0] - P[i][0], P[(i + 1) % n][1] - P[i][1]);
    for (let i = 1; i < n; i++) if (lenOf(i) > lenOf(k)) k = i;
    const mx = (P[k][0] + P[(k + 1) % n][0]) / 2, my = (P[k][1] + P[(k + 1) % n][1]) / 2;
    const s = insideRings(rings, mx - d[k][1] * 0.5, my + d[k][0] * 0.5) ? 1 : -1;
    const nrm = d.map(([dx, dy]) => [-dy * s, dx * s]);
    const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1];
    // Inset corner between edge i-1 and edge i.
    const corner = (i: number): [number, number] => {
      const a = nrm[(i - 1 + n) % n], b = nrm[i];
      const den = 1 + dot(a, b);
      if (den < 0.25) return [P[i][0] + b[0] * inset, P[i][1] + b[1] * inset];
      return [P[i][0] + ((a[0] + b[0]) * inset) / den, P[i][1] + ((a[1] + b[1]) * inset) / den];
    };
    // Which road end (if any) each outline edge lies on: those edges get no line.
    const open = P.map((p, i) => {
      const q = P[(i + 1) % n];
      return ends.findIndex((s4) => distToSegment(p[0], p[1], s4) < END_TOLERANCE && distToSegment(q[0], q[1], s4) < END_TOLERANCE);
    }).map((e) => (e < 0 ? null : ends[e]));
    // Where edge e's inset line reaches the line of a road end, so the edge
    // line runs right out to the end (vertex v is the fallback).
    const meet = (e: number, end: number[], v: number): [number, number] => {
      const len = Math.hypot(end[2] - end[0], end[3] - end[1]) || 1;
      const N = [-(end[3] - end[1]) / len, (end[2] - end[0]) / len];
      const den = dot(d[e], N);
      if (Math.abs(den) < 0.2) return corner(v);
      const bx = P[e][0] + nrm[e][0] * inset, by = P[e][1] + nrm[e][1] * inset;
      const t = -((bx - end[0]) * N[0] + (by - end[1]) * N[1]) / den;
      return [bx + d[e][0] * t, by + d[e][1] * t];
    };
    if (!open.some(Boolean)) {
      const line: Ring = [];
      for (let i = 0; i <= n; i++) line.push(...corner(i % n));
      out.push(line);
      continue;
    }
    for (let i = 0; i < n; i++) {
      if (!open[i] || open[(i + 1) % n]) continue;
      // A line starts after open edge i and runs until the next open edge.
      const first = (i + 1) % n;
      const line: Ring = [...meet(first, open[i]!, first)];
      let e = first;
      while (!open[(e + 1) % n]) {
        e = (e + 1) % n;
        line.push(...corner(e));
      }
      const v = (e + 1) % n;
      line.push(...meet(e, open[v]!, v));
      out.push(line);
    }
  }
  return out;
}
