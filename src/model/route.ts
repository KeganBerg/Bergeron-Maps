import { ASSET_BY_KEY } from '../assets/library';
import { objectBox } from './geometry';
import { floorGroup } from './interiors';
import type { Box, Floor, MapDocument, MapObject } from './types';
import { COST, type Grid, cellAt, cellX, cellY, clampedCell, floorGrid } from './route/grid';
import { BEND, DIRS, dedupe, KEEP_CLEAR, polyLength, roomAt, roundCorners, search, searchTurns, simplify, square, trace } from './route/search';
import { type End, type Place, approachOf, placeCells } from './route/places';
import { type Portal, type PortalKind, nameOf, portals } from './route/portals';
export { type Grid, cellAt, floorGrid } from './route/grid';
export { type Place } from './route/places';
export { type PortalKind, connectorKind, isConnector, reaches } from './route/portals';
export { roomAt, roundCorners } from './route/search';

/**
 * Walking directions. Each floor is turned into a grid of small squares, each
 * with a cost: walkways and sidewalks are cheapest, drive aisles and open
 * ground a little more, grass a lot more, and parking spaces, walls and
 * buildings can't be walked through at all. A* (or Dijkstra, when several
 * places are wanted at once) finds the cheapest way over the grid, and the
 * zig-zag of squares is pulled straight wherever nothing is in the way.
 *
 * Floors are joined by their stairs, elevators and ramps (the floors each one
 * "Goes to"), and site maps by the entrances of buildings that have a floor
 * plan inside. Nothing new has to be drawn: existing maps get directions as
 * they are, and walkways, doors and floor connections make them better.
 */

// ---------------------------------------------------------------- routes
// The parts: route/grid.ts (costs), route/search.ts (path finding),
// route/places.ts (route ends), route/portals.ts (floor connections).

export interface RouteLeg {
  floorId: string;
  /** Flat [x0, y0, x1, y1, …] in map pixels. */
  points: number[];
  /** Map pixels walked (5 px = 1 ft). */
  length: number;
}

export interface RouteStep {
  floorId: string;
  kind: 'walk' | PortalKind;
  text: string;
  /** For walking steps: the leg drawn on the map. */
  leg?: number;
  /** For floor changes: the floor you come out on. */
  toFloorId?: string;
  x: number;
  y: number;
}

export interface Route {
  legs: RouteLeg[];
  steps: RouteStep[];
  /** Map pixels walked, not counting floor changes. */
  length: number;
  /** Floor changes, in order. */
  changes: number;
  /** No way was found without walking between parked cars. */
  squeezed: boolean;
}

export interface RouteOptions {
  /** Step-free: skip stairs and escalators. */
  avoidStairs?: boolean;
}

export type RouteResult = { ok: true; route: Route } | { ok: false; reason: 'same' | 'none' };

function endOf(doc: MapDocument, p: Place): End | null {
  const floor = doc.floors.find((f) => f.id === p.floorId);
  if (!floor) return null;
  const obj = p.objectId ? floor.objects.find((o) => o.id === p.objectId) : undefined;
  return obj ? { floor, obj, x: obj.x, y: obj.y } : { floor, x: p.x, y: p.y };
}

/** Two ends that are one spot: the same object, or landings of one shaft on a floor with none drawn. */
const oneSpot = (a: End, b: End) =>
  a.floor === b.floor && ((!!a.obj && a.obj === b.obj) ||
    (!!a.landing && !!b.landing && a.landing.kind === b.landing.kind && Math.hypot(a.x - b.x, a.y - b.y) < 40));

const sameEnd = (a: End, b: End) => a.floor === b.floor && (a.obj && b.obj ? a.obj === b.obj : Math.hypot(a.x - b.x, a.y - b.y) < 1);

/** Floor cost grid for one search: a copy, so opening up the start and end doesn't leak into the next search. */
function costFor(g: Grid, squeeze: boolean): Uint8Array {
  const c = g.cost.slice();
  if (squeeze) for (let i = 0; i < c.length; i++) if (g.spaceOnly[i]) c[i] = COST.squeeze;
  return c;
}

interface LegResult { points: number[]; cost: number }

/** One walk on one floor between two places. */
export function walk(from: End, to: End, squeeze: boolean): LegResult | null {
  const g = floorGrid(from.floor);
  const cost = costFor(g, squeeze);
  const src = placeCells(g, from, cost);
  const dst = placeCells(g, to, cost);
  if (!src.length || !dst.length) return null;
  // Small places start from their middle, so the line starts on them.
  const mid = cellAt(g, from.x, from.y);
  const start = from.obj && !isBig(from.obj) && src.includes(mid) ? [mid] : src;
  const box = to.obj ? (approachBox(g, to.obj) ?? objectBox(to.obj)) : { x: to.x, y: to.y, width: 0, height: 0 };
  const r = searchTurns(g, cost, start, dst, box);
  if (!r) return null;
  return finish(g, cost, r.cells, r.dist, from, to);
}

/** The line along a path of squares from one place to another. */
function finish(g: Grid, cost: Uint8Array, cells: number[], total: number, from: End, to: End): LegResult {
  const pts = square(g, cost, simplify(g, cost, cells));
  // Start and finish on the places themselves; buildings and big areas at their edge.
  let head = from.obj && isBig(from.obj) ? [] : [from.x, from.y];
  let tail = to.obj && isBig(to.obj) ? [] : [to.x, to.y];
  // Parking spaces: from the middle of the lane, straight along the stall.
  const inA = from.obj ? approachOf(g, from.obj)?.get(cells[0]) : undefined;
  if (inA) {
    pts.splice(0, 2, inA[0], inA[1]);
    head = [inA[4], inA[5], inA[2], inA[3]];
  }
  const inB = to.obj ? approachOf(g, to.obj)?.get(cells[cells.length - 1]) : undefined;
  if (inB) {
    pts.splice(pts.length - 2, 2, inB[0], inB[1]);
    tail = inB.slice(2);
  }
  // The squares at either end are only roughly where the places are: no tiny hook to the exact spot.
  const near = (x: number, y: number, i: number) => Math.hypot(pts[i] - x, pts[i + 1] - y) < g.cell * 1.5;
  if (!inA && head.length && pts.length > 2 && near(head[head.length - 2], head[head.length - 1], 0)) pts.splice(0, 2);
  if (!inB && tail.length && pts.length > 2 && near(tail[0], tail[1], pts.length - 2)) pts.splice(pts.length - 2, 2);
  return { points: roundCorners(dedupe([...head, ...pts, ...tail]), BEND, curveFits(g)), cost: total };
}

/**
 * A rounded corner is fine when it comes no closer to anything solid than the
 * two straight lines it joins (checked where they start and at the corner).
 */
function curveFits(g: Grid) {
  return (c: number[], [bx, by]: [number, number]) => {
    const n = c.length;
    const need = Math.min(KEEP_CLEAR, roomAt(g, c[0], c[1]), roomAt(g, c[n - 2], c[n - 1]), roomAt(g, bx, by)) - g.cell * 0.5;
    if (need <= 0) return true;
    for (let i = 2; i < n - 2; i += 2) if (roomAt(g, c[i], c[i + 1]) < need) return false;
    return true;
  };
}

/** The box around the lane points a space is reached from (for A*'s estimate). */
function approachBox(g: Grid, o: MapObject): Box | null {
  const ap = approachOf(g, o);
  if (!ap) return null;
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const [i] of ap) {
    x1 = Math.min(x1, cellX(g, i)); y1 = Math.min(y1, cellY(g, i));
    x2 = Math.max(x2, cellX(g, i)); y2 = Math.max(y2, cellY(g, i));
  }
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

/** Buildings and big areas are reached at their edge, not walked into. */
export const isBig = (o: MapObject) => o.kind === 'asset' && (!!ASSET_BY_KEY[o.assetKey]?.enterable || Math.min(o.width, o.height) > 140);

/**
 * From one place to another, over as many floors and buildings as it takes.
 * Same floor: one A* search. Otherwise one Dijkstra out from the start and one
 * in from the destination find how far every floor connection is from each,
 * floors in between are estimated, and the best chain of connections wins.
 */
export function findRoute(doc: MapDocument, fromPlace: Place, toPlace: Place, opts: RouteOptions = {}): RouteResult {
  const from = endOf(doc, fromPlace);
  const to = endOf(doc, toPlace);
  if (!from || !to) return { ok: false, reason: 'none' };
  if (sameEnd(from, to)) return { ok: false, reason: 'same' };
  // A spot tapped outside the building's walls (or in a closed-off corner, behind a row):
  // if there's no way from there, start from the nearest place joined to the rest of the floor.
  const a = from.obj ? from : snapToMain(from), b = to.obj ? to : snapToMain(to);
  const tries: [End, End][] = a !== from || b !== to ? [[from, to], [a, b]] : [[from, to]];
  for (const squeeze of [false, true]) {
    for (const [x, y] of tries) {
      const r = routeOnce(doc, x, y, squeeze, opts);
      if (r) return { ok: true, route: { ...r, squeezed: squeeze } };
    }
  }
  return { ok: false, reason: 'none' };
}

/** Per floor: the part of the floor (squares joined to each other) with the most drawn lanes and walkways. */
const mains = new WeakMap<Grid, Uint8Array>();
function mainPart(g: Grid): Uint8Array {
  const hit = mains.get(g);
  if (hit) return hit;
  const n = g.cols * g.rows;
  const part = new Int32Array(n).fill(-1);
  let bestPart = -1, bestScore = -1;
  const q = new Int32Array(n);
  for (let s = 0, id = 0; s < n; s++) {
    if (g.cost[s] === 0 || part[s] >= 0) continue;
    let h = 0, t = 0, score = 0;
    q[t++] = s; part[s] = id;
    while (h < t) {
      const i = q[h++];
      score += g.cost[i] < COST.bare ? 1000 : 1;
      const c = i % g.cols, r = (i - c) / g.cols;
      for (const [dx, dy] of DIRS) {
        const nc = c + dx, nr = r + dy;
        if (nc < 0 || nr < 0 || nc >= g.cols || nr >= g.rows) continue;
        const j = nr * g.cols + nc;
        if (g.cost[j] !== 0 && part[j] < 0) { part[j] = id; q[t++] = j; }
      }
    }
    if (score > bestScore) { bestScore = score; bestPart = id; }
    id++;
  }
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = part[i] === bestPart ? 1 : 0;
  mains.set(g, out);
  return out;
}

function snapToMain(e: End): End {
  const g = floorGrid(e.floor);
  const main = mainPart(g);
  const at = clampedCell(g, e.x, e.y);
  if (main[at]) return e;
  let best = -1, bd = Infinity;
  for (let i = 0; i < main.length; i++) {
    if (!main[i]) continue;
    const d = Math.hypot(cellX(g, i) - e.x, cellY(g, i) - e.y);
    if (d < bd) { bd = d; best = i; }
  }
  return best < 0 ? e : { floor: e.floor, x: cellX(g, best), y: cellY(g, best) };
}

interface Hop { portal: Portal; forward: boolean }
type Seg = { kind: 'leg'; a: End; b: End; res: LegResult } | { kind: 'hop'; hop: Hop };

function routeOnce(doc: MapDocument, from: End, to: End, squeeze: boolean, opts: RouteOptions): Omit<Route, 'squeezed'> | null {
  if (from.floor === to.floor) {
    const leg = walk(from, to, squeeze);
    if (leg) return build(doc, [{ kind: 'leg', a: from, b: to, res: leg }]);
  }
  const all = portals(doc).filter((p) => !(opts.avoidStairs && (p.kind === 'stairs' || p.kind === 'escalator')));
  // Graph nodes: 0 = start, 1 = destination, then both ends of every portal.
  const ends: End[] = [from, to];
  for (const p of all) ends.push(p.a, p.b);
  const N = ends.length;
  const floorEnds = new Map<Floor, number[]>();
  for (let i = 2; i < N; i++) {
    const list = floorEnds.get(ends[i].floor) ?? [];
    list.push(i);
    floorEnds.set(ends[i].floor, list);
  }
  // Exact distances on the start floor (out from the start) and the destination floor (back from it).
  const exact = new Map<string, { cost: number; leg: () => LegResult | null }>();
  const fan = (src: End, reversed: boolean) => {
    const list = floorEnds.get(src.floor) ?? [];
    const key = (i: number) => (reversed ? `${i}>1` : `0>${i}`);
    const here = list.filter((i) => sameEnd(ends[i], src));
    for (const i of here) exact.set(key(i), { cost: 0, leg: () => ({ points: [src.x, src.y], cost: 0 }) });
    const rest = list.filter((i) => !here.includes(i));
    if (!rest.length) return;
    const g = floorGrid(src.floor);
    const cost = costFor(g, squeeze);
    const srcCells = placeCells(g, src, cost);
    const targets = rest.map((i) => placeCells(g, ends[i], cost));
    const r = search(g, cost, srcCells, targets);
    rest.forEach((i, k) => {
      const end = r.reached[k];
      if (end < 0) return;
      exact.set(key(i), {
        cost: r.dist[end],
        // Drawn with turns counted (see searchTurns); the plain search's path if that finds none.
        leg: () => (reversed ? walk(ends[i], src, squeeze) : walk(src, ends[i], squeeze))
          ?? (reversed ? finish(g, cost, trace(r.prev, end).reverse(), r.dist[end], ends[i], src) : finish(g, cost, trace(r.prev, end), r.dist[end], src, ends[i])),
      });
    });
  };
  fan(from, false);
  fan(to, true);

  const blocked = new Set<string>();
  for (let attempt = 0; attempt < 6; attempt++) {
    // Dijkstra over the graph of places (small: a few dozen nodes).
    const dist = new Array<number>(N).fill(Infinity);
    const prev = new Array<number>(N).fill(-1);
    const via = new Array<Hop | null>(N).fill(null);
    const done = new Array<boolean>(N).fill(false);
    dist[0] = 0;
    for (;;) {
      let u = -1;
      for (let i = 0; i < N; i++) if (!done[i] && dist[i] < Infinity && (u < 0 || dist[i] < dist[u])) u = i;
      if (u < 0 || u === 1) break;
      done[u] = true;
      const relax = (v: number, w: number, hop: Hop | null) => {
        if (w === Infinity || done[v] || blocked.has(`${u}>${v}`)) return;
        if (dist[u] + w < dist[v]) { dist[v] = dist[u] + w; prev[v] = u; via[v] = hop; }
      };
      const fl = ends[u].floor;
      if (u === 0) {
        for (const v of floorEnds.get(fl) ?? []) relax(v, exact.get(`0>${v}`)?.cost ?? Infinity, null);
        continue;
      }
      // Through the portal to its other end.
      const pi = (u - 2) >> 1;
      const forward = (u - 2) % 2 === 0;
      relax(forward ? u + 1 : u - 1, all[pi].penalty, { portal: all[pi], forward });
      if (fl === to.floor) relax(1, exact.get(`${u}>1`)?.cost ?? Infinity, null);
      // Across a floor in between: a straight-line estimate, walked for real once a route is picked.
      for (const v of floorEnds.get(fl) ?? []) {
        if (v === u) continue;
        const same = oneSpot(ends[u], ends[v]);
        relax(v, same ? 0 : Math.hypot(ends[u].x - ends[v].x, ends[u].y - ends[v].y) * 1.3 * (COST.road / 10), null);
      }
    }
    if (dist[1] === Infinity) return null;
    const chain: number[] = [];
    for (let v = 1; v >= 0; v = prev[v]) chain.unshift(v);
    const segs: Seg[] = [];
    let failed = false;
    for (let k = 1; k < chain.length; k++) {
      const u = chain[k - 1], v = chain[k];
      const hop = via[v];
      if (hop) { segs.push({ kind: 'hop', hop }); continue; }
      let leg: LegResult | null;
      if (u === 0) leg = exact.get(`0>${v}`)!.leg();
      else if (v === 1) leg = exact.get(`${u}>1`)!.leg();
      else if (oneSpot(ends[u], ends[v])) leg = { points: [ends[u].x, ends[u].y], cost: 0 };
      else leg = walk(ends[u], ends[v], squeeze);
      if (!leg) { blocked.add(`${u}>${v}`); failed = true; break; }
      segs.push({ kind: 'leg', a: ends[u], b: ends[v], res: leg });
    }
    if (!failed) return build(doc, joinWalks(segs, squeeze));
  }
  return null;
}

/**
 * Two walks in a row on one floor (to a stair that isn't taken, then on) are
 * one walk: the floor-to-floor search only estimates walks between floor
 * connections, so it can pass by one on the way.
 */
function joinWalks(segs: Seg[], squeeze: boolean): Seg[] {
  const out: Seg[] = [];
  for (const s of segs) {
    const last = out[out.length - 1];
    if (s.kind === 'leg' && last?.kind === 'leg' && last.a.floor === s.a.floor) {
      const res = walk(last.a, s.b, squeeze);
      if (res) { out[out.length - 1] = { kind: 'leg', a: last.a, b: s.b, res }; continue; }
    }
    out.push(s);
  }
  return out;
}

const FT = 5;
/** Map pixels to feet, rounded to 10 ft. */
export const feet = (px: number) => Math.max(10, Math.round(px / FT / 10) * 10);

/** "Space B4", "Elevator 1", "the spot you picked". */
export function placeLabel(o: MapObject | undefined): string {
  if (!o) return 'the spot you picked';
  if (o.kind === 'space') return `Space ${o.label || '(no number)'}`;
  if (o.kind === 'text') return o.text;
  return nameOf(o, 'there');
}

function build(doc: MapDocument, segs: Seg[]): Omit<Route, 'squeezed'> {
  const legs: RouteLeg[] = [];
  const steps: RouteStep[] = [];
  let changes = 0;
  let lastHop = -1; // index of the last floor-change step, while nothing has been walked since
  let lastName = '';
  for (const s of segs) {
    if (s.kind === 'leg') {
      const length = polyLength(s.res.points);
      if (length < 1) continue;
      legs.push({ floorId: s.a.floor.id, points: s.res.points, length });
      steps.push({ floorId: s.a.floor.id, kind: 'walk', text: `Walk to ${s.b.landing && !s.b.obj ? s.b.landing.name : placeLabel(s.b.obj)}`, leg: legs.length - 1, x: s.b.x, y: s.b.y });
      lastHop = -1;
      continue;
    }
    changes++;
    const [inn, out] = hopEnds(s.hop);
    const prev = lastHop >= 0 ? steps[lastHop] : null;
    // Riding the same elevator past a floor is one step, not two.
    if (prev && prev.kind === s.hop.portal.kind && prev.kind !== 'inside' && prev.kind !== 'outside') {
      // Named for the one you got on.
      steps[lastHop] = changeStep(doc, s.hop, prev.floorId, out, prev.x, prev.y, lastName);
    } else {
      // Named for the one you walked to (each floor's stair or ramp can have its own name).
      lastName = inn.obj ? nameOf(inn.obj, s.hop.portal.name) : s.hop.portal.name;
      steps.push(changeStep(doc, s.hop, inn.floor.id, out, inn.x, inn.y, lastName));
      lastHop = steps.length - 1;
    }
  }
  const length = legs.reduce((sum, l) => sum + l.length, 0);
  return { legs, steps, length, changes };
}

function hopEnds(h: Hop): [End, End] {
  return h.forward ? [h.portal.a, h.portal.b] : [h.portal.b, h.portal.a];
}

function changeStep(doc: MapDocument, hop: Hop, floorId: string, out: End, x: number, y: number, name = hop.portal.name): RouteStep {
  const p = hop.portal;
  if (p.kind === 'inside') {
    return hop.forward
      ? { floorId, kind: 'inside', text: `Go inside ${p.name}`, toFloorId: out.floor.id, x, y }
      : { floorId, kind: 'outside', text: `Leave ${p.name}`, toFloorId: out.floor.id, x, y };
  }
  const fromFloor = doc.floors.find((f) => f.id === floorId)!;
  const group = floorGroup(doc, fromFloor);
  const up = group.indexOf(out.floor) > group.indexOf(fromFloor);
  const dir = p.kind === 'walkway' ? 'across' : up ? 'up' : 'down';
  // "Up ramp to F3" already says where it goes.
  const says = new RegExp(`(^|\\s)${out.floor.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`, 'i').test(name);
  return { floorId, kind: p.kind, text: says ? `Take ${name}` : `Take ${name} ${dir} to ${out.floor.name}`, toFloorId: out.floor.id, x, y };
}
/** Rough walking time: about 250 ft a minute, plus time for each floor change. */
export function minutes(route: Route): number {
  return Math.max(1, Math.round(route.length / FT / 250 + route.changes * 0.5));
}

/** Places people commonly start from: entrances, elevators, stairs, pickup points. */
export function startPlaces(doc: MapDocument): { floor: Floor; obj: MapObject; name: string }[] {
  const out: { floor: Floor; obj: MapObject; name: string }[] = [];
  for (const f of doc.floors) {
    for (const o of f.objects) {
      if (o.kind !== 'asset' || o.hidden) continue;
      const def = ASSET_BY_KEY[o.assetKey];
      if (!def) continue;
      const k = o.assetKey;
      const useful = def.connector || def.walk === 'opener' && !['door', 'double-door', 'crosswalk', 'pedestrian-crossing', 'barrier-arm'].includes(k)
        || k.startsWith('pin-') || k.startsWith('valet-') || k === 'pay-station' || k === 'info-desk' || k === 'reception-desk';
      if (useful) out.push({ floor: f, obj: o, name: nameOf(o, def.name) });
    }
  }
  return out;
}
