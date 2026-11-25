import { ASSET_BY_KEY } from '../../assets/library';
import { spaceOutline, spaceSkew } from '../../assets/catalog/spaces';
import { toLocal, toWorld } from '../shape';
import type { Floor, MapObject } from '../types';
import { COST, type Grid, cellAt, clampedCell, eachCell } from './grid';
import { DIRS } from './search';
import { type PortalKind } from './portals';

/**
 * Walking directions, part 3: where a route can start and end on an object
 * (the aisle in front of a parking space, the door side of a room) or a
 * tapped spot.
 */

/** A place on a floor: an object, or a spot someone tapped. */
export interface Place {
  floorId: string;
  objectId?: string;
  x: number;
  y: number;
}

export interface End {
  floor: Floor;
  obj?: MapObject;
  x: number;
  y: number;
  /**
   * Where a stair, elevator or ramp comes out on a floor that has none drawn
   * (a floor not mapped yet, say): its kind and name. Landings of the same
   * kind at the same spot are one shaft, ridden straight past. `of` is the
   * connector on the floor it came from, to name it in the reader's language.
   */
  landing?: { kind: PortalKind; name: string; of?: MapObject };
}

/** The cells of a place, opened up so a route can reach it even inside a row of spaces. */
export function placeCells(g: Grid, e: End, cost: Uint8Array): number[] {
  // A parking space is walked into from the lane it opens onto.
  const ap = e.obj ? approachOf(g, e.obj) : null;
  if (ap) return [...ap.keys()];
  const cells: number[] = [];
  if (e.obj) {
    const def = e.obj.kind === 'asset' ? ASSET_BY_KEY[e.obj.assetKey] : undefined;
    // Big places (a building, a lot) are reached at their edge, small ones anywhere on them.
    eachCell(g, e.obj, def, 0, (i) => cells.push(i));
  }
  const at = clampedCell(g, e.x, e.y);
  if (!cells.length) cells.push(at);
  if (!e.obj) {
    // A tapped spot inside something solid starts from the nearest square that isn't.
    if (at >= 0 && cost[at] === 0) {
      const near = nearestOpen(g, cost, at);
      if (near >= 0) return [near];
    }
    return cells;
  }
  for (const i of cells) if (cost[i] === 0 || cost[i] > COST.walk) cost[i] = COST.walk;
  return cells;
}

/**
 * How a parking space is reached: from a point in the middle of the lane in
 * front of it, straight along the stall into it, like the car would. Keyed by
 * the square of that lane point; the value is the rest of the way in
 * ([edge x, edge y, center x, center y]). Null when nothing open is in front
 * of either end (then the space is reached any way that works).
 */
type Approach = Map<number, number[]>;
const approaches = new WeakMap<Grid, WeakMap<MapObject, Approach | null>>();

export function approachOf(g: Grid, o: MapObject): Approach | null {
  if (o.kind !== 'space') return null;
  let byObj = approaches.get(g);
  if (!byObj) approaches.set(g, (byObj = new WeakMap()));
  if (byObj.has(o)) return byObj.get(o)!;
  const variant = o.variant ?? (o.accessible ? 'accessible' : 'standard');
  const ring = spaceOutline(variant, o.width, o.height, variant === 'angled' ? spaceSkew(o) : 0);
  const mid = (e: number) => toWorld(o, (ring[2 * e] + ring[(2 * e + 2) % 8]) / 2, (ring[2 * e + 1] + ring[(2 * e + 3) % 8]) / 2);
  // Edges 0..3: top, right, bottom, left. Cars come in at the ends of a stall, or the long side of a parallel one.
  const pairs: [number, number][] = variant === 'parallel' ? [[1, 3], [3, 1]] : [[0, 2], [2, 0]];
  const inside = (x: number, y: number) => {
    const [lx, ly] = toLocal(o, x, y);
    return lx > -0.5 && ly > -0.5 && lx < o.width + 0.5 && ly < o.height + 0.5;
  };
  const out: Approach = new Map();
  const found: { i: number; at: number[]; c: number }[] = [];
  for (const [e, opp] of pairs) {
    const [mx, my] = mid(e);
    const [ox, oy] = mid(opp);
    const L = Math.hypot(mx - ox, my - oy) || 1;
    const ux = (mx - ox) / L, uy = (my - oy) / L;
    const step = g.cell / 2;
    const across = variant === 'parallel' ? o.height : o.width;
    const reach = across * 0.6, narrow = across * 0.3;
    // The cheapest point out in front: the lane's center line, or the middle of the open space.
    const probe: { d: number; i: number; score: number }[] = [];
    let started = false;
    for (let d = step; d < 170; d += step) {
      const x = mx + ux * d, y = my + uy * d;
      const i = cellAt(g, x, y);
      if (i < 0) break;
      if (!started && inside(x, y)) continue;
      if (g.cost[i] === 0) break;
      // Out past the stall's own edge it has to open up: a slot between two rows isn't a lane.
      if (d > reach && g.room[i] < narrow) break;
      started = true;
      // Cheapest first; then the most room (the middle between the rows on either side).
      probe.push({ d, i, score: g.cost[i] - Math.min(g.room[i], across * 1.5) * 0.06 });
    }
    let k = -1;
    for (let j = 0; j < probe.length; j++) if (k < 0 || probe[j].score < probe[k].score - 1e-6) k = j;
    let best = -1, bx = 0, by = 0;
    if (k >= 0) {
      // The middle of the run of equally good points, so the stalls on both sides of an
      // aisle share one line down its middle instead of two side by side.
      let a0 = k, a1 = k;
      while (a0 > 0 && probe[a0 - 1].score <= probe[k].score + 0.05) a0--;
      while (a1 < probe.length - 1 && probe[a1 + 1].score <= probe[k].score + 0.05) a1++;
      const d = (probe[a0].d + probe[a1].d) / 2;
      bx = mx + ux * d; by = my + uy * d;
      best = cellAt(g, bx, by);
      if (best < 0 || g.cost[best] === 0) best = probe[k].i;
      // A wide aisle with no lane drawn has a band of equally good points: the route turns
      // in from wherever it runs down that band, with no jog over to its middle.
      if (g.base[best] === COST.lot) {
        const ok = (j: number) => g.base[probe[j].i] === COST.lot && g.cost[probe[j].i] <= g.cost[best] + 3;
        let b0 = k, b1 = k;
        while (b0 > 0 && ok(b0 - 1)) b0--;
        while (b1 < probe.length - 1 && ok(b1 + 1)) b1++;
        for (let j = b0; j <= b1; j++) {
          const q = probe[j];
          if (q.i !== best) found.push({ i: q.i, at: [mx + ux * q.d, my + uy * q.d, mx, my, o.x, o.y], c: g.cost[q.i] });
        }
      }
    }
    if (best >= 0) found.unshift({ i: best, at: [bx, by, mx, my, o.x, o.y], c: g.cost[best] });
  }
  // A stall is driven into from its lane: when one end opens onto a lane or walkway,
  // the other (a strip of bare ground behind the row, say) isn't a way in.
  const onWay = found.some((f) => f.c < COST.bare);
  for (const f of found) if ((!onWay || f.c < COST.bare) && !out.has(f.i)) out.set(f.i, f.at);
  const res = out.size ? out : null;
  byObj.set(o, res);
  return res;
}

function nearestOpen(g: Grid, cost: Uint8Array, from: number): number {
  const seen = new Uint8Array(g.cols * g.rows);
  const q = [from];
  seen[from] = 1;
  for (let h = 0; h < q.length && h < 40000; h++) {
    const i = q[h];
    if (cost[i] !== 0) return i;
    const c = i % g.cols, r = (i - c) / g.cols;
    for (const [dx, dy] of DIRS) {
      const nc = c + dx, nr = r + dy;
      if (nc < 0 || nr < 0 || nc >= g.cols || nr >= g.rows) continue;
      const j = nr * g.cols + nc;
      if (!seen[j]) { seen[j] = 1; q.push(j); }
    }
  }
  return -1;
}
