import type { Box } from './types';

export type SnapMode = 'smart' | 'grid' | 'free';

export interface Guide {
  orientation: 'vertical' | 'horizontal';
  /** World coordinate of the guide line (x for vertical, y for horizontal). */
  at: number;
  from: number;
  to: number;
  kind: 'edge' | 'center' | 'spacing';
}

export interface SnapResult {
  dx: number;
  dy: number;
  guides: Guide[];
}

const xs = (b: Box) => [b.x, b.x + b.width / 2, b.x + b.width];
const ys = (b: Box) => [b.y, b.y + b.height / 2, b.y + b.height];

/**
 * Adjusts a proposed move so the moving box lines up with nearby boxes.
 * `box` is the moving selection's bounding box BEFORE the move; (dx, dy) is the
 * raw pointer delta. `threshold` is in world units.
 *
 * - free:  returns the delta untouched (no hidden alignment).
 * - grid:  snaps the box's top-left corner to the grid.
 * - smart: snaps edges/centers to other objects' edges/centers, and to equal
 *          spacing between two neighbors, showing guides for each match.
 */
export function snapMove(
  mode: SnapMode,
  box: Box,
  dx: number,
  dy: number,
  others: Box[],
  opts: { threshold: number; gridSize: number },
): SnapResult {
  if (mode === 'free') return { dx, dy, guides: [] };
  if (mode === 'grid') {
    const g = opts.gridSize;
    const nx = Math.round((box.x + dx) / g) * g;
    const ny = Math.round((box.y + dy) / g) * g;
    return { dx: nx - box.x, dy: ny - box.y, guides: [] };
  }

  const moved: Box = { ...box, x: box.x + dx, y: box.y + dy };
  const t = opts.threshold;

  // Best adjustment on each axis.
  let bestX: { d: number; at: number; kind: Guide['kind'] } | null = null;
  let bestY: { d: number; at: number; kind: Guide['kind'] } | null = null;
  const mx = xs(moved);
  const my = ys(moved);

  for (const o of others) {
    const ox = xs(o);
    const oy = ys(o);
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        const d = ox[j] - mx[i];
        if (Math.abs(d) <= t && (!bestX || Math.abs(d) < Math.abs(bestX.d)))
          bestX = { d, at: ox[j], kind: i === 1 && j === 1 ? 'center' : 'edge' };
        const e = oy[j] - my[i];
        if (Math.abs(e) <= t && (!bestY || Math.abs(e) < Math.abs(bestY.d)))
          bestY = { d: e, at: oy[j], kind: i === 1 && j === 1 ? 'center' : 'edge' };
      }
    }
  }

  // Equal spacing between the nearest neighbor on each side (same band).
  const spacingX = equalSpacing(moved, others, 'x', t);
  if (spacingX && (!bestX || Math.abs(spacingX.d) < Math.abs(bestX.d))) bestX = spacingX;
  const spacingY = equalSpacing(moved, others, 'y', t);
  if (spacingY && (!bestY || Math.abs(spacingY.d) < Math.abs(bestY.d))) bestY = spacingY;

  const fdx = dx + (bestX?.d ?? 0);
  const fdy = dy + (bestY?.d ?? 0);
  const final: Box = { ...box, x: box.x + fdx, y: box.y + fdy };
  const guides: Guide[] = [];

  if (bestX) {
    if (bestX.kind === 'spacing') {
      guides.push({ orientation: 'horizontal', at: final.y + final.height / 2, from: bestX.at, to: final.x + final.width, kind: 'spacing' });
    } else {
      const matched = others.filter((o) => xs(o).some((v) => Math.abs(v - bestX!.at) < 0.5));
      const span = matched.reduce((acc, o) => ({ from: Math.min(acc.from, o.y), to: Math.max(acc.to, o.y + o.height) }), {
        from: final.y,
        to: final.y + final.height,
      });
      guides.push({ orientation: 'vertical', at: bestX.at, ...span, kind: bestX.kind });
    }
  }
  if (bestY) {
    if (bestY.kind === 'spacing') {
      guides.push({ orientation: 'vertical', at: final.x + final.width / 2, from: bestY.at, to: final.y + final.height, kind: 'spacing' });
    } else {
      const matched = others.filter((o) => ys(o).some((v) => Math.abs(v - bestY!.at) < 0.5));
      const span = matched.reduce((acc, o) => ({ from: Math.min(acc.from, o.x), to: Math.max(acc.to, o.x + o.width) }), {
        from: final.x,
        to: final.x + final.width,
      });
      guides.push({ orientation: 'horizontal', at: bestY.at, ...span, kind: bestY.kind });
    }
  }
  return { dx: fdx, dy: fdy, guides };
}

function equalSpacing(
  moved: Box,
  others: Box[],
  axis: 'x' | 'y',
  t: number,
): { d: number; at: number; kind: 'spacing' } | null {
  const pos = axis === 'x' ? 'x' : 'y';
  const size = axis === 'x' ? 'width' : 'height';
  const cross = axis === 'x' ? 'y' : 'x';
  const crossSize = axis === 'x' ? 'height' : 'width';
  const band = others.filter((o) => o[cross] < moved[cross] + moved[crossSize] && moved[cross] < o[cross] + o[crossSize]);
  let before: Box | null = null;
  let after: Box | null = null;
  for (const o of band) {
    if (o[pos] + o[size] <= moved[pos] + t && (!before || o[pos] + o[size] > before[pos] + before[size])) before = o;
    if (o[pos] >= moved[pos] + moved[size] - t && (!after || o[pos] < after[pos])) after = o;
  }
  if (!before || !after) return null;
  const free = after[pos] - (before[pos] + before[size]) - moved[size];
  if (free < 0) return null;
  const target = before[pos] + before[size] + free / 2;
  const d = target - moved[pos];
  if (Math.abs(d) > t) return null;
  return { d, at: before[pos] + before[size], kind: 'spacing' };
}

/** Snap a single value (e.g. a resize edge) to the grid. */
export const snapToGrid = (v: number, grid: number) => Math.round(v / grid) * grid;
