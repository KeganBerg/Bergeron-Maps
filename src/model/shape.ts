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

/**
 * Merges landscape pieces into one outline, like metaballs: pieces that
 * overlap become one, and pieces closer than `blend` grow a smooth bridge
 * (a closing with round joins). Cuts are applied afterwards so they stay crisp.
 */
export function mergeOutlines(members: MergeMember[]): Ring[] {
  if (!members.length) return [];
  const shapes = members.flatMap((m) => localOutline(m, false).map((r) => toInt(ringToWorld(m, r))));
  const blend = Math.max(0, ...members.map((m) => m.blend ?? DEFAULT_BLEND));
  let paths = boolean(shapes, [], ClipperLib.ClipType.ctUnion);
  if (blend > 0 && members.length > 1) {
    const j = ClipperLib.JoinType.jtRound;
    paths = offset(offset(paths, blend / 2, j), -blend / 2, j);
  }
  const cuts = members.flatMap((m) => cutRings(m).map((r) => toInt(ringToWorld(m, r))));
  if (cuts.length) paths = boolean(paths, cuts, ClipperLib.ClipType.ctDifference);
  return paths.map(fromInt);
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

