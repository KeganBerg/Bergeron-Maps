import type { Box } from '../types';
import { COST, type Grid, cellAt, cellX, cellY } from './grid';

/**
 * Walking directions, part 2: finding the cheapest way over a floor's grid
 * (A* / Dijkstra, with a turn penalty), then straightening and rounding the
 * zig-zag of squares into a clean line.
 */

class Heap {
  private k: number[] = [];
  private v: number[] = [];
  get size() { return this.k.length; }
  push(key: number, val: number) {
    const k = this.k, v = this.v;
    let i = k.length;
    k.push(key); v.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= key) break;
      k[i] = k[p]; v[i] = v[p]; i = p;
    }
    k[i] = key; v[i] = val;
  }
  pop(): number {
    const k = this.k, v = this.v;
    const top = v[0];
    const lk = k.pop()!, lv = v.pop()!;
    const n = k.length;
    if (n) {
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && k[c + 1] < k[c]) c++;
        if (k[c] >= lk) break;
        k[i] = k[c]; v[i] = v[c]; i = c;
      }
      k[i] = lk; v[i] = lv;
    }
    return top;
  }
}

const SQRT2 = Math.SQRT2;
export const DIRS: [number, number, number][] = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, SQRT2], [1, -1, SQRT2], [-1, 1, SQRT2], [-1, -1, SQRT2]];
const DX = DIRS.map((d) => d[0]), DY = DIRS.map((d) => d[1]), LEN = DIRS.map((d) => d[2]);
/** Each of DIRS as a compass point, 0..7 in 45° steps. */
const HEADING = DIRS.map(([dx, dy]) => (Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) + 8) % 8);
/**
 * Cost of turning, per 45°. A car (and a person following an aisle) keeps
 * going straight: without it, the cheapest path wobbles from side to side of
 * a wide aisle and cuts open ground on a slant.
 */
const TURN = 30;
/**
 * On a lot's open ground (its undrawn aisles and bare ground), a step on the
 * slant costs as much as going across and then along: routes there run square
 * to the rows, like the aisles, instead of cutting corners. Drawn lanes and
 * walkways keep the true √2.
 */
const OPEN_SLANT = 2.05;

interface SearchResult {
  prev: Int32Array;
  dist: Float64Array;
  /** Per target: the first of its cells reached, or -1. */
  reached: number[];
}

/**
 * Cheapest paths from `sources` until every target (a list of cells) is
 * reached. With one target and a `toward` box it runs as A*.
 */
export function search(g: Grid, cost: Uint8Array, sources: number[], targets: number[][], toward?: Box): SearchResult {
  const n = g.cols * g.rows;
  const dist = new Float64Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1);
  const done = new Uint8Array(n);
  const owner = new Int16Array(n).fill(-1);
  targets.forEach((t, ti) => t.forEach((i) => (owner[i] = ti)));
  const reached = targets.map(() => -1);
  let left = targets.length;
  const h = toward
    ? (i: number) => {
        const x = cellX(g, i), y = cellY(g, i);
        const dx = Math.max(toward.x - x, 0, x - toward.x - toward.width);
        const dy = Math.max(toward.y - y, 0, y - toward.y - toward.height);
        return Math.hypot(dx, dy);
      }
    : () => 0;
  const heap = new Heap();
  for (const s of sources) {
    if (s < 0 || cost[s] === 0 || dist[s] === 0) continue;
    dist[s] = 0;
    heap.push(h(s), s);
  }
  const cols = g.cols, rows = g.rows, cell = g.cell;
  while (heap.size && left > 0) {
    const i = heap.pop();
    if (done[i]) continue;
    done[i] = 1;
    const ti = owner[i];
    if (ti >= 0 && reached[ti] < 0) {
      reached[ti] = i;
      left--;
      // A target was reached; for several targets keep going until all are.
      for (let t = 0; t < targets.length; t++) if (reached[t] < 0 && targets[t].includes(i)) { reached[t] = i; left--; }
      if (left === 0) break;
    }
    const c = i % cols, r = (i - c) / cols;
    const ci = cost[i];
    for (const [dx, dy, len] of DIRS) {
      const nc = c + dx, nr = r + dy;
      if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
      const j = nr * cols + nc;
      const cj = cost[j];
      if (cj === 0 || done[j]) continue;
      // No cutting corners past something solid.
      if (dx && dy && (cost[r * cols + nc] === 0 || cost[nr * cols + c] === 0)) continue;
      const nd = dist[i] + ((ci + cj) / 20) * len * cell;
      if (nd < dist[j]) {
        dist[j] = nd;
        prev[j] = i;
        heap.push(nd + h(j), j);
      }
    }
  }
  return { prev, dist, reached };
}

/**
 * The line that gets drawn: the cheapest path from `sources` to `targets`
 * counting turns too (see TURN). It searches square-and-heading pairs, so it
 * runs only for the one walk that is drawn; picking floors and connections
 * uses the plain search's distances. A*, toward the `toward` box.
 */
export function searchTurns(g: Grid, cost: Uint8Array, sources: number[], targets: number[], toward: Box): { cells: number[]; dist: number } | null {
  const n = g.cols * g.rows;
  const N = n * 8;
  const b = turnBuffers(N);
  // Stamped instead of cleared: a square-and-heading's numbers count only when stamped this search.
  const gen = ++b.gen;
  const { dist, prev, stamp, best } = b;
  const D = (st: number) => (stamp[st] === gen ? dist[st] : Infinity);
  const isTarget = new Uint8Array(n);
  for (const t of targets) isTarget[t] = 1;
  const h = (i: number) => {
    const x = cellX(g, i), y = cellY(g, i);
    const dx = Math.max(toward.x - x, 0, x - toward.x - toward.width);
    const dy = Math.max(toward.y - y, 0, y - toward.y - toward.height);
    return Math.hypot(dx, dy);
  };
  const heap = new Heap();
  for (const s of sources) {
    if (s < 0 || cost[s] === 0) continue;
    // A start has no heading yet: any first move is free of a turn.
    for (let d = 0; d < 8; d++) {
      const st = s * 8 + d;
      if (D(st) === 0) continue;
      stamp[st] = gen; dist[st] = 0; prev[st] = -1;
      heap.push(h(s), st);
    }
    best[s] = 0; b.bestStamp[s] = gen;
  }
  const cols = g.cols, rows = g.rows, cell = g.cell;
  // Only where the rows run along the grid: a lot laid out on a slant keeps true slants.
  const squareLot = g.axis === 0;
  const base = g.base;
  // A heading is never worth more than a U-turn's cost over the best way into the same square.
  const SPAN = 4 * TURN;
  let end = -1;
  while (heap.size) {
    const st = heap.pop();
    const ds = dist[st];
    if (b.done[st] === gen) continue;
    const i = st >> 3, hd = st & 7;
    // Squares come off the heap cheapest first, so the first heading out of one is its best.
    if (b.bestStamp[i] === gen) { if (ds > best[i] + SPAN) continue; }
    else { best[i] = ds; b.bestStamp[i] = gen; }
    if (isTarget[i]) { end = st; break; }
    b.done[st] = gen;
    const c = i % cols, r = (i - c) / cols;
    const ci = cost[i];
    const hi = h(i);
    for (let k = 0; k < 8; k++) {
      const dx = DX[k], dy = DY[k], len = LEN[k];
      const nc = c + dx, nr = r + dy;
      if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
      const j = nr * cols + nc;
      const cj = cost[j];
      if (cj === 0) continue;
      if (dx && dy && (cost[r * cols + nc] === 0 || cost[nr * cols + c] === 0)) continue;
      const nh = HEADING[k];
      const ns = j * 8 + nh;
      if (b.done[ns] === gen) continue;
      const step = dx && dy && squareLot && (base[i] === COST.lot || base[i] >= COST.bare || base[j] === COST.lot || base[j] >= COST.bare) && base[i] !== COST.land && base[j] !== COST.land ? OPEN_SLANT : len;
      const t = Math.abs(hd - nh);
      // The very first move (dist 0) turns from nothing.
      const turn = ds === 0 ? 0 : Math.min(t, 8 - t) * TURN;
      const nd = ds + ((ci + cj) / 20) * step * cell + turn;
      if (b.bestStamp[j] === gen && nd > best[j] + SPAN) continue;
      if (nd < D(ns)) {
        stamp[ns] = gen; dist[ns] = nd; prev[ns] = st;
        // The estimate changes by at most a step's length: cheaper than a square root per push.
        heap.push(nd + Math.max(0, hi - len * cell), ns);
      }
    }
  }
  if (end < 0) return null;
  const cells: number[] = [];
  for (let st = end; st >= 0; st = prev[st]) cells.push(st >> 3);
  return { cells: cells.reverse(), dist: dist[end] };
}

/** Kept between searches (a big floor's are tens of MB): see searchTurns. */
interface TurnBuffers { N: number; gen: number; dist: Float32Array; prev: Int32Array; stamp: Uint32Array; done: Uint32Array; best: Float32Array; bestStamp: Uint32Array }
let turnBuf: TurnBuffers | null = null;
function turnBuffers(N: number): TurnBuffers {
  if (!turnBuf || turnBuf.N < N || turnBuf.gen > 4e9) {
    turnBuf = { N, gen: 0, dist: new Float32Array(N), prev: new Int32Array(N), stamp: new Uint32Array(N), done: new Uint32Array(N), best: new Float32Array(N / 8), bestStamp: new Uint32Array(N / 8) };
  }
  return turnBuf;
}

export function trace(prev: Int32Array, end: number): number[] {
  const out: number[] = [];
  for (let i = end; i >= 0; i = prev[i]) out.push(i);
  return out.reverse();
}

/** Map px from a point to the nearest wall, parked car or other blocked square. */
export function roomAt(g: Grid, x: number, y: number): number {
  const i = cellAt(g, x, y);
  return i < 0 ? 0 : g.room[i];
}

/** The clearance the drawn line keeps from what's around it: the search's own, up to this much (map px). */
export const KEEP_CLEAR = 30;

/**
 * Can a straight line from cell a to cell b be walked without anything more
 * costly than `max`, while staying at least `need` px from anything solid?
 */
function clear(g: Grid, cost: Uint8Array, ax: number, ay: number, bx: number, by: number, max: number, need = 0): boolean {
  const d = Math.hypot(bx - ax, by - ay);
  const steps = Math.ceil(d / (g.cell * 0.35));
  const r = g.cell * 0.3;
  for (let s = 1; s < steps; s++) {
    const x = ax + ((bx - ax) * s) / steps, y = ay + ((by - ay) * s) / steps;
    // Check a little either side too, so the line never grazes a wall.
    for (const [ox, oy] of [[0, 0], [r, r], [-r, -r], [r, -r], [-r, r]]) {
      const i = cellAt(g, x + ox, y + oy);
      if (i < 0 || cost[i] === 0 || cost[i] > max) return false;
    }
    if (need > 0 && roomAt(g, x, y) < need) return false;
  }
  return true;
}

/**
 * Turns the staircase of squares into a few straight lines that stay where the
 * search put them (down the middle of the lane): points closer than `tol` to
 * a straight line are dropped (Douglas-Peucker), and a line is kept apart
 * wherever the straight version would clip something solid.
 */
export function simplify(g: Grid, cost: Uint8Array, cells: number[]): number[] {
  const xs = cells.map((i) => cellX(g, i)), ys = cells.map((i) => cellY(g, i));
  const n = cells.length;
  if (n <= 2) return cells.flatMap((_, k) => [xs[k], ys[k]]);
  const tol = Math.max(5, g.cell * 1.3);
  const keep = new Uint8Array(n);
  keep[0] = keep[n - 1] = 1;
  const stack: [number, number][] = [[0, n - 1]];
  while (stack.length) {
    const [i, j] = stack.pop()!;
    if (j - i < 2) continue;
    const ax = xs[i], ay = ys[i], dx = xs[j] - ax, dy = ys[j] - ay;
    const L = Math.hypot(dx, dy) || 1;
    let far = -1, fd = -1;
    for (let k = i + 1; k < j; k++) {
      const d = Math.abs((xs[k] - ax) * dy - (ys[k] - ay) * dx) / L;
      if (d > fd) { fd = d; far = k; }
    }
    // The straight line may not come any closer to a row, wall or island than the squares it replaces.
    let need = KEEP_CLEAR;
    for (let k = i; k <= j; k++) need = Math.min(need, g.room[cells[k]]);
    if (fd > tol || !clear(g, cost, ax, ay, xs[j], ys[j], 249, need - g.cell * 0.5)) {
      keep[far] = 1;
      stack.push([i, far], [far, j]);
    }
  }
  const out: number[] = [];
  for (let k = 0; k < n; k++) if (keep[k]) out.push(xs[k], ys[k]);
  return out;
}

/** A slanted line is squared off once it leans more than this many degrees off the lot's layout. */
const SLANT = 8;

/**
 * Lot routes run square to the rows, like the aisles do: a line that cuts
 * across open ground on a slant becomes two lines along the layout (an L),
 * when both stay on ground no worse than the slanted line crossed, keep as
 * much room from what's around, and aren't much longer. The ends stay put.
 */
export function square(g: Grid, cost: Uint8Array, p: number[]): number[] {
  if (g.axis === null || p.length < 4) return p;
  const r = (g.axis * Math.PI) / 180;
  const ux = Math.cos(r), uy = Math.sin(r), vx = -uy, vy = ux;
  const out = [p[0], p[1]];
  for (let k = 2; k < p.length; k += 2) {
    const ax = out[out.length - 2], ay = out[out.length - 1], bx = p[k], by = p[k + 1];
    const dx = bx - ax, dy = by - ay;
    const a = dx * ux + dy * uy, b = dx * vx + dy * vy;
    const L = Math.hypot(a, b);
    const lean = (Math.atan2(Math.min(Math.abs(a), Math.abs(b)), Math.max(Math.abs(a), Math.abs(b))) * 180) / Math.PI;
    if (L > 2 * g.cell && lean > SLANT) {
      const corner = bestCorner(g, cost, ax, ay, bx, by, [[ax + a * ux, ay + a * uy], [ax + b * vx, ay + b * vy]]);
      if (corner) out.push(corner[0], corner[1]);
    }
    out.push(bx, by);
  }
  return straightRuns(out);
}

/** Of the two corners of an L, the one that works and costs least; null when neither does. */
function bestCorner(g: Grid, cost: Uint8Array, ax: number, ay: number, bx: number, by: number, corners: number[][]): number[] | null {
  const along = sample(g, cost, [[ax, ay, bx, by]]);
  if (!along) return null;
  let best: number[] | null = null, bc = Infinity;
  for (const c of corners) {
    const l = sample(g, cost, [[ax, ay, c[0], c[1]], [c[0], c[1], bx, by]]);
    if (!l || l.ground > along.ground || l.room < Math.min(KEEP_CLEAR, along.room) - g.cell * 0.5) continue;
    if (l.cost > along.cost * 1.15 + 20 || l.cost >= bc) continue;
    bc = l.cost; best = c;
  }
  return best;
}

/** Walks the lines: their summed cost, the worst ground and the least room on them; null where blocked. */
function sample(g: Grid, cost: Uint8Array, lines: number[][]) {
  let total = 0, ground = 0, room = Infinity;
  for (const [ax, ay, bx, by] of lines) {
    const d = Math.hypot(bx - ax, by - ay);
    const steps = Math.max(1, Math.ceil(d / (g.cell * 0.5)));
    for (let s = 1; s < steps; s++) {
      const i = cellAt(g, ax + ((bx - ax) * s) / steps, ay + ((by - ay) * s) / steps);
      if (i < 0 || cost[i] === 0) return null;
      total += (cost[i] / 10) * (d / steps);
      ground = Math.max(ground, g.base[i]);
      room = Math.min(room, g.room[i]);
    }
  }
  return { cost: total, ground, room };
}

/** Drops points that sit on a straight line between their neighbours. */
function straightRuns(p: number[]): number[] {
  const out = [p[0], p[1]];
  for (let k = 2; k < p.length - 2; k += 2) {
    const ax = out[out.length - 2], ay = out[out.length - 1];
    const bx = p[k], by = p[k + 1], cx = p[k + 2], cy = p[k + 3];
    const cross = (bx - ax) * (cy - by) - (by - ay) * (cx - bx);
    const dot = (bx - ax) * (cx - bx) + (by - ay) * (cy - by);
    if (Math.abs(cross) < 1e-6 * Math.max(1, Math.hypot(bx - ax, by - ay) * Math.hypot(cx - bx, cy - by)) * 1000 && dot > 0) continue;
    out.push(bx, by);
  }
  out.push(p[p.length - 2], p[p.length - 1]);
  return out;
}

/** Corner radius of the drawn route, in map px. */
export const BEND = 30;

/**
 * Rounds every corner of a line with a curve of up to `radius` px (never more
 * than half of either side, so two curves never overlap). The ends stay put.
 * `fits` can turn a curve down (it then tries a tighter one, and at last
 * keeps the sharp corner): a curve cuts the inside of the bend, which is
 * where a row's corner or a wall end usually is.
 */
export function roundCorners(p: number[], radius = BEND, fits?: (curve: number[], corner: [number, number]) => boolean): number[] {
  const n = p.length / 2;
  if (n < 3) return p.slice();
  const out = [p[0], p[1]];
  for (let k = 1; k < n - 1; k++) {
    const ax = p[2 * k - 2], ay = p[2 * k - 1], bx = p[2 * k], by = p[2 * k + 1], cx = p[2 * k + 2], cy = p[2 * k + 3];
    const l1 = Math.hypot(ax - bx, ay - by), l2 = Math.hypot(cx - bx, cy - by);
    if (l1 < 0.5 || l2 < 0.5) { out.push(bx, by); continue; }
    const u1x = (ax - bx) / l1, u1y = (ay - by) / l1, u2x = (cx - bx) / l2, u2y = (cy - by) / l2;
    // Nearly straight on: nothing to round.
    if (u1x * u2x + u1y * u2y < -0.998) { out.push(bx, by); continue; }
    let curve: number[] | null = null;
    for (const f of [1, 0.6, 0.35, 0.18]) {
      const r = Math.min(radius * f, l1 / 2, l2 / 2);
      const sx = bx + u1x * r, sy = by + u1y * r, ex = bx + u2x * r, ey = by + u2y * r;
      const N = 8;
      const c: number[] = [];
      for (let s = 0; s <= N; s++) {
        const t = s / N, m = 1 - t;
        c.push(m * m * sx + 2 * m * t * bx + t * t * ex, m * m * sy + 2 * m * t * by + t * t * ey);
      }
      if (!fits || fits(c, [bx, by])) { curve = c; break; }
    }
    if (curve) out.push(...curve);
    else out.push(bx, by);
  }
  out.push(p[2 * n - 2], p[2 * n - 1]);
  return dedupe(out);
}

export function polyLength(p: number[]): number {
  let L = 0;
  for (let i = 2; i < p.length; i += 2) L += Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1]);
  return L;
}

export function dedupe(p: number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < p.length; i += 2) {
    const n = out.length;
    if (n && Math.abs(out[n - 2] - p[i]) < 0.5 && Math.abs(out[n - 1] - p[i + 1]) < 0.5) continue;
    out.push(p[i], p[i + 1]);
  }
  return out;
}
