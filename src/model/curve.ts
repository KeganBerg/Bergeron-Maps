/**
 * Shapeable curves for curved roads and lanes. A curved piece with no `curve`
 * is a quarter ring filling its box. Once its handles are dragged it gets a
 * `curve`: the centre line as a cubic Bézier (start, two bend handles, end),
 * stored as fractions of the box so it stretches with the piece, and the road
 * is drawn as a band of the piece's thickness around that line.
 */
import type { Ring } from './shape';

/** [x0, y0, c1x, c1y, c2x, c2y, x3, y3]: start, bend handles, end. */
export type CurvePoints = number[];

/** Points along the centre line. */
export const CURVE_STEPS = 48;
/** Bézier handle length for a quarter circle, as a fraction of the radius. */
const KAPPA = 0.5523;

/**
 * Centre line of the plain quarter ring, in px: from the middle of its left
 * end round to the middle of its bottom end.
 */
export function defaultCurvePx(w: number, h: number, t: number): CurvePoints {
  const rx = w - t / 2, ry = h - t / 2;
  return [0, h - ry, KAPPA * rx, h - ry, rx, h - KAPPA * ry, rx, h];
}

/** The piece's centre line in its own px (its stored curve, or the quarter ring's). */
export function curvePx(o: { width: number; height: number; curve?: number[] }, t: number): CurvePoints {
  if (!o.curve || o.curve.length !== 8) return defaultCurvePx(o.width, o.height, t);
  return o.curve.map((v, i) => v * (i % 2 ? o.height : o.width));
}

export function bezierAt(p: CurvePoints, t: number): [number, number] {
  const u = 1 - t;
  const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
  return [a * p[0] + b * p[2] + c * p[4] + d * p[6], a * p[1] + b * p[3] + c * p[5] + d * p[7]];
}

/** Unit direction of travel at t (from start to end). */
export function bezierDir(p: CurvePoints, t: number): [number, number] {
  const u = 1 - t;
  let dx = 3 * u * u * (p[2] - p[0]) + 6 * u * t * (p[4] - p[2]) + 3 * t * t * (p[6] - p[4]);
  let dy = 3 * u * u * (p[3] - p[1]) + 6 * u * t * (p[5] - p[3]) + 3 * t * t * (p[7] - p[5]);
  // A handle dragged onto its end point has no direction there: look a little further along.
  if (Math.hypot(dx, dy) < 1e-6) {
    const a = bezierAt(p, Math.max(0, t - 0.01)), b = bezierAt(p, Math.min(1, t + 0.01));
    dx = b[0] - a[0];
    dy = b[1] - a[1];
  }
  const l = Math.hypot(dx, dy) || 1;
  return [dx / l, dy / l];
}

/** The centre line as a polyline. */
export function curveLine(p: CurvePoints, steps = CURVE_STEPS): Ring {
  const out: Ring = [];
  for (let i = 0; i <= steps; i++) out.push(...bezierAt(p, i / steps));
  return out;
}

/** The centre line moved d px to its left (negative: right), as a polyline. */
export function offsetLine(p: CurvePoints, d: number, steps = CURVE_STEPS): Ring {
  const out: Ring = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const [x, y] = bezierAt(p, t);
    const [dx, dy] = bezierDir(p, t);
    out.push(x + dy * d, y - dx * d);
  }
  return out;
}

/** Outline of a band t px wide around the centre line (one ring, may cross itself on a very tight bend). */
export function curveBand(p: CurvePoints, t: number): Ring {
  const left = offsetLine(p, t / 2);
  const right = offsetLine(p, -t / 2);
  const out: Ring = [...left];
  for (let i = right.length - 2; i >= 0; i -= 2) out.push(right[i], right[i + 1]);
  return out;
}

/** The two open ends of a band, as segments in the piece's own px. */
export function curveEnds(p: CurvePoints, t: number): number[][] {
  return [0, 1].map((at) => {
    const [x, y] = bezierAt(p, at);
    const [dx, dy] = bezierDir(p, at);
    const h = t / 2;
    return [x + dy * h, y - dx * h, x - dy * h, y + dx * h];
  });
}

/**
 * After a handle moves (points in the piece's own px, possibly outside its
 * box), the box that fits the band again: its new size, how far its top-left
 * moved (in the piece's own, unrotated px), and the curve as fractions of it.
 */
export function refitCurve(p: CurvePoints, t: number): { dx: number; dy: number; width: number; height: number; curve: number[] } {
  const band = curveBand(p, t);
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (let i = 0; i < band.length; i += 2) {
    x1 = Math.min(x1, band[i]);
    x2 = Math.max(x2, band[i]);
    y1 = Math.min(y1, band[i + 1]);
    y2 = Math.max(y2, band[i + 1]);
  }
  const width = Math.max(4, x2 - x1), height = Math.max(4, y2 - y1);
  const curve = p.map((v, i) => Math.round(((i % 2 ? v - y1 : v - x1) / (i % 2 ? height : width)) * 10000) / 10000);
  return { dx: x1, dy: y1, width, height, curve };
}

interface Placed { x: number; y: number; width: number; height: number; rotation: number }

const toWorldOf = (o: Placed, x: number, y: number): [number, number] => {
  const a = (o.rotation * Math.PI) / 180;
  const lx = x - o.width / 2, ly = y - o.height / 2;
  return [o.x + lx * Math.cos(a) - ly * Math.sin(a), o.y + lx * Math.sin(a) + ly * Math.cos(a)];
};

/**
 * The fields to write after reshaping a curved piece: its centre line `p` in
 * the px of piece `o` as it was (the frame the handles were dragged in), and
 * its band width. The box is fitted round the band again; the piece keeps its
 * turn, so it only moves and resizes.
 */
export function reshapedFields(o: Placed, p: CurvePoints, t: number): { x: number; y: number; width: number; height: number; curve: number[] } {
  const fit = refitCurve(p, t);
  const [x, y] = toWorldOf(o, fit.dx + fit.width / 2, fit.dy + fit.height / 2);
  return { x, y, width: fit.width, height: fit.height, curve: fit.curve };
}
