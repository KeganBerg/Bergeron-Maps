/**
 * Automatic merging of neighbouring landscape and road pieces into one
 * outline, after lining up edges that are a pixel or two apart. Re-exported
 * from shape.ts.
 */
import ClipperLib from 'clipper-lib';
import { ALIGN_TOLERANCE, DEFAULT_BLEND, FILL_SLIVERS, type IntPath, type Placed, type Ring, SCALE, type ShapeSource, boolean, cutRings, fromInt, localOutline, offset, toInt, toWorld } from './shape';

const ringToWorld = (o: Placed, r: Ring): Ring => {
  const out: Ring = [];
  for (let i = 0; i < r.length; i += 2) out.push(...toWorld(o, r[i], r[i + 1]));
  return out;
};

export interface MergeMember extends Placed, ShapeSource {
  blend?: number;
  /** Extra world-space area that belongs to this piece when merging (e.g. a road end stretched to meet a nearby road). */
  extra?: Ring[];
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
  const shapes = members.map((m) =>
    boolean([...localOutline(m, false).map((r) => toInt(ringToWorld(m, r))), ...(m.extra ?? []).map(toInt)], [], ClipperLib.ClipType.ctUnion),
  );
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
