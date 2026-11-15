import { ASSET_BY_KEY } from '../assets/library';
import type { AssetDef } from '../assets/defs';
import { objectBox } from './geometry';
import { buildingName, floorGroup, interiorFloors } from './interiors';
import { insideRings, localOutline, toLocal, toWorld } from './shape';
import type { AssetObject, Box, Floor, MapDocument, MapObject } from './types';

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

// ---------------------------------------------------------------- costs

/** Cost per map pixel, x10. 0 = can't be walked through. */
const COST = {
  walk: 10, // walkways, sidewalks, crosswalks, doors, entrances, stairs, elevators
  road: 12, // drive aisles and roads
  open: 14, // open ground with nothing drawn on it
  area: 16, // service bays, loading areas, sports fields
  edge: 45, // the walls of a room drawn without a door: crossable, but a door wins
  land: 50, // grass, flower beds, trees
  thing: 80, // furniture, vehicles, kiosks: squeeze past only if there's no other way
  squeeze: 120, // between parked cars, used only when there is no other way at all
} as const;

type Role = 'ignore' | 'walk' | 'road' | 'area' | 'land' | 'thing' | 'block' | 'space' | 'opener' | 'room' | 'shell';

const BLOCK = new Set([
  'wall', 'partial-wall', 'column', 'pillar', 'fence', 'guardrail', 'concrete-divider', 'protective-barrier', 'hvac-unit',
  'retaining-wall', 'interior-wall', 'glass-wall', 'window', 'hedge', 'planter', 'pond', 'water-feature', 'swimming-pool',
]);
const OPENERS = new Set([
  'door', 'double-door', 'gate', 'barrier-arm', 'garage-door', 'rollup-door', 'access-gate', 'entrance', 'exit',
  'ped-entrance', 'ped-exit', 'lobby-entrance', 'building-entrance', 'student-entrance', 'staff-entrance',
  'visitor-entrance', 'bus-entrance', 'delivery-entrance', 'security-checkpoint', 'crosswalk', 'pedestrian-crossing',
]);
/** Ways into a building from outside. */
const ENTRY_KEYS = new Set([
  'building-entrance', 'lobby-entrance', 'ped-entrance', 'ped-exit', 'entrance', 'student-entrance', 'staff-entrance',
  'visitor-entrance', 'bus-entrance', 'delivery-entrance', 'security-checkpoint', 'door', 'double-door',
]);
const IGNORE = new Set(['support-beam', 'canopy', 'covered-parking', 'bollard', 'parking-stop', 'curb', 'sidewalk-curb', 'drain-grate', 'storm-drain', 'sewer-access', 'speed-bump', 'stop-line', 'yield-line', 'lane-divider', 'road-centerline', 'road-boundary']);
const LAND = new Set(['grass-area', 'grass-divider', 'grass-divider-corner', 'grass-divider-curve', 'grass-island-half', 'grass-island-round', 'grass-island-quarter', 'flower-bed', 'rock-bed', 'dirt-area', 'gravel-area', 'shrub', 'tree', 'small-tree', 'large-tree']);
const WALK_AREAS = new Set(['valet-pickup', 'valet-dropoff', 'valet-queue', 'guest-waiting', 'student-dropoff', 'student-pickup', 'bus-loading', 'bus-unloading', 'courtyard', 'outdoor-seating', 'waiting-area', 'loading-dock']);
const ROAD_KEYS = new Set(['fire-lane', 'keep-clear', 'bus-loop', 'emergency-access-road', 'custom-road', 'service-drive']);

function roleOf(o: MapObject, def: AssetDef | undefined, interior: boolean): Role {
  if (o.kind === 'space') return 'space';
  if (o.kind !== 'asset' || !def) return 'ignore';
  const k = o.assetKey;
  if (def.connector) return 'opener';
  if (OPENERS.has(k)) return 'opener';
  if (k === 'outer-walls') return 'shell';
  if (BLOCK.has(k)) return 'block';
  if (IGNORE.has(k)) return 'ignore';
  if (LAND.has(k)) return 'land';
  if (WALK_AREAS.has(k)) return 'walk';
  if (ROAD_KEYS.has(k)) return 'road';
  if (def.creates === 'space' || k === 'custom-row') return 'space';
  if (def.enterable || k === 'custom-building') return interior ? 'room' : 'block';
  if (def.layer === 'labels' || def.layer === 'background') return 'ignore';
  switch (def.category) {
    case 'Roads and traffic': return 'road';
    case 'Pedestrian areas': return 'walk';
    case 'Zones and boundaries':
    case 'Text and labels':
    case 'Location markers':
    case 'Background and reference':
    case 'Drawing elements':
    case 'Custom and reusable':
    case 'Signs and safety':
      return def.layer === 'landmarks' ? 'thing' : 'ignore';
    case 'Vehicles': return 'thing';
    case 'Offices and interiors': return def.layer === 'structure' ? 'room' : 'thing';
    case 'Outdoor environment': return def.layer === 'landmarks' ? 'thing' : 'area';
    default: return def.layer === 'landmarks' ? 'thing' : 'area';
  }
}

// ---------------------------------------------------------------- grid

export interface Grid {
  x0: number;
  y0: number;
  cell: number;
  cols: number;
  rows: number;
  /** Cost per cell (see COST); 0 = blocked. */
  cost: Uint8Array;
  /** 1 where only a parking space blocks the way (opened up when nothing else works). */
  spaceOnly: Uint8Array;
}

/** Biggest grid per floor. ~160k squares keeps a 2,000-space level under a tenth of a second. */
const MAX_CELLS = 160_000;
const MIN_CELL = 6;
const MARGIN = 80;

const grids = new WeakMap<Floor, Grid>();

export function floorGrid(floor: Floor): Grid {
  const hit = grids.get(floor);
  if (hit) return hit;
  const g = buildGrid(floor);
  grids.set(floor, g);
  return g;
}

interface Painted { o: MapObject; def?: AssetDef; role: Role }

function visibleObjects(floor: Floor): Painted[] {
  const out: Painted[] = [];
  const interior = !!floor.interiorOf;
  for (const l of floor.layers) {
    if (!l.visible) continue;
    for (const o of floor.objects) {
      if (o.layerId !== l.id || o.hidden) continue;
      const def = o.kind === 'asset' ? ASSET_BY_KEY[o.assetKey] : undefined;
      out.push({ o, def, role: roleOf(o, def, interior) });
    }
  }
  return out;
}

function buildGrid(floor: Floor): Grid {
  const visible = visibleObjects(floor);
  const items = visible.filter((p) => p.role !== 'ignore');
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const { o } of visible) {
    const b = objectBox(o);
    x1 = Math.min(x1, b.x); y1 = Math.min(y1, b.y);
    x2 = Math.max(x2, b.x + b.width); y2 = Math.max(y2, b.y + b.height);
  }
  if (!Number.isFinite(x1)) { x1 = 0; y1 = 0; x2 = 100; y2 = 100; }
  x1 -= MARGIN; y1 -= MARGIN; x2 += MARGIN; y2 += MARGIN;
  const cell = Math.max(MIN_CELL, Math.ceil(Math.sqrt(((x2 - x1) * (y2 - y1)) / MAX_CELLS)));
  const cols = Math.ceil((x2 - x1) / cell);
  const rows = Math.ceil((y2 - y1) / cell);
  const g: Grid = { x0: x1, y0: y1, cell, cols, rows, cost: new Uint8Array(cols * rows), spaceOnly: new Uint8Array(cols * rows) };

  const shells = items.filter((p) => p.role === 'shell');
  // Inside a building's floor plan, the space outside its outer walls isn't walkable.
  g.cost.fill(shells.length ? 0 : COST.open);
  for (const { o } of shells) paint(g, o, undefined, 0, () => COST.open);
  for (const { o } of shells) {
    const t = Math.max(6, (o.strokeWidth ?? 6) + 2);
    paintFrame(g, o, t);
  }

  const set = (v: number) => () => v;
  for (const p of items) {
    const { o, def, role } = p;
    switch (role) {
      case 'walk': paint(g, o, def, 0, set(COST.walk)); break;
      case 'road': paint(g, o, def, 0, set(COST.road)); break;
      case 'area': paint(g, o, def, 0, set(COST.area)); break;
      case 'land': paint(g, o, def, 0, (c) => (c === 0 ? 0 : COST.land)); break;
      case 'thing': paint(g, o, def, 0, (c) => (c === 0 ? 0 : Math.max(c, COST.thing))); break;
      case 'room':
        paint(g, o, def, 0, set(COST.open));
        paintFrame(g, o, Math.max(4, o.strokeWidth ?? 2), COST.edge);
        break;
      case 'block': paint(g, o, def, g.cell * 0.5, set(0), undefined, true); break;
      case 'space':
        paint(g, o, def, 0, set(0), g.spaceOnly);
        break;
      default:
        break;
    }
  }
  // Doors, entrances, gates and floor connections open up whatever they sit on.
  for (const p of items) if (p.role === 'opener') paint(g, p.o, p.def, g.cell, set(COST.walk), undefined, true);
  // Keep a little off walls and parked cars, so routes run down the middle of an aisle, not along its edge.
  const near = new Uint8Array(cols * rows);
  const reach = Math.max(1, Math.round(25 / cell));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      if (g.cost[r * cols + c] !== 0) continue;
      for (let dr = -reach; dr <= reach; dr++)
        for (let dc = -reach; dc <= reach; dc++) {
          const rr = r + dr, cc = c + dc;
          if (rr >= 0 && cc >= 0 && rr < rows && cc < cols) near[rr * cols + cc] = 1;
        }
    }
  for (let i = 0; i < near.length; i++) if (near[i] && g.cost[i] !== 0) g.cost[i] = Math.min(250, g.cost[i] + 4);
  return g;
}

/** Calls `f` with each cell whose center is inside the object (grown by `grow` px). */
function eachCell(g: Grid, o: MapObject, def: AssetDef | undefined, grow: number, f: (i: number, lx: number, ly: number) => void) {
  const b = objectBox(o);
  const c0 = Math.max(0, Math.floor((b.x - grow - g.x0) / g.cell));
  const c1 = Math.min(g.cols - 1, Math.floor((b.x + b.width + grow - g.x0) / g.cell));
  const r0 = Math.max(0, Math.floor((b.y - grow - g.y0) / g.cell));
  const r1 = Math.min(g.rows - 1, Math.floor((b.y + b.height + grow - g.y0) / g.cell));
  const outline = def?.outline && def.outline !== 'rect' ? def.outline : undefined;
  const rings = outline || (o.cuts?.length ?? 0) > 0
    ? localOutline({ width: o.width, height: o.height, outline, band: (o as AssetObject).band ?? def?.band, cuts: o.cuts })
    : null;
  let any = false;
  for (let r = r0; r <= r1; r++) {
    const wy = g.y0 + (r + 0.5) * g.cell;
    for (let c = c0; c <= c1; c++) {
      const wx = g.x0 + (c + 0.5) * g.cell;
      const [lx, ly] = toLocal(o, wx, wy);
      if (lx < -grow || ly < -grow || lx > o.width + grow || ly > o.height + grow) continue;
      if (rings && !insideRings(rings, lx, ly)) continue;
      any = true;
      f(r * g.cols + c, lx, ly);
    }
  }
  // Something smaller than a square still counts: the square under its center.
  if (!any) {
    const i = cellAt(g, o.x, o.y);
    if (i >= 0) f(i, o.width / 2, o.height / 2);
  }
}

/** `clearMark`: whatever was under it is gone (a wall over a space can't be squeezed past). */
function paint(g: Grid, o: MapObject, def: AssetDef | undefined, grow: number, value: (cur: number) => number, mark?: Uint8Array, clearMark = false) {
  eachCell(g, o, def, grow, (i) => {
    if (mark) {
      // A parking space can be squeezed past; a wall under it can't.
      if (g.cost[i] !== 0 || mark[i]) { g.cost[i] = 0; mark[i] = 1; }
      return;
    }
    g.cost[i] = value(g.cost[i]);
    if (clearMark || g.cost[i] !== 0) g.spaceOnly[i] = 0;
  });
}

/** The border of a box `t` px thick (outer walls, room walls). */
function paintFrame(g: Grid, o: MapObject, t: number, value = 0) {
  const grow = value === 0 ? g.cell * 0.5 : 0;
  eachCell(g, o, undefined, grow, (i, lx, ly) => {
    const d = Math.min(lx, ly, o.width - lx, o.height - ly);
    if (d <= t + grow) {
      g.cost[i] = value === 0 ? 0 : Math.max(g.cost[i] === 0 ? 0 : g.cost[i], value);
      g.spaceOnly[i] = 0;
    }
  });
}

export function cellAt(g: Grid, x: number, y: number): number {
  const c = Math.floor((x - g.x0) / g.cell);
  const r = Math.floor((y - g.y0) / g.cell);
  if (c < 0 || r < 0 || c >= g.cols || r >= g.rows) return -1;
  return r * g.cols + c;
}

/** The square under a point, or the nearest one on the grid's edge. */
function clampedCell(g: Grid, x: number, y: number): number {
  const c = Math.min(g.cols - 1, Math.max(0, Math.floor((x - g.x0) / g.cell)));
  const r = Math.min(g.rows - 1, Math.max(0, Math.floor((y - g.y0) / g.cell)));
  return r * g.cols + c;
}

const cellX = (g: Grid, i: number) => g.x0 + ((i % g.cols) + 0.5) * g.cell;
const cellY = (g: Grid, i: number) => g.y0 + (Math.floor(i / g.cols) + 0.5) * g.cell;

// ---------------------------------------------------------------- search

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
const DIRS: [number, number, number][] = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, SQRT2], [1, -1, SQRT2], [-1, 1, SQRT2], [-1, -1, SQRT2]];

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
function search(g: Grid, cost: Uint8Array, sources: number[], targets: number[][], toward?: Box): SearchResult {
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

function trace(prev: Int32Array, end: number): number[] {
  const out: number[] = [];
  for (let i = end; i >= 0; i = prev[i]) out.push(i);
  return out.reverse();
}

/** Can a straight line from cell a to cell b be walked without anything more costly than `max`? */
function clear(g: Grid, cost: Uint8Array, ax: number, ay: number, bx: number, by: number, max: number): boolean {
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
  }
  return true;
}

/** Turns a staircase of cells into a few straight lines. */
function smooth(g: Grid, cost: Uint8Array, cells: number[]): number[] {
  if (cells.length <= 2) return cells.flatMap((i) => [cellX(g, i), cellY(g, i)]);
  const out = [cellX(g, cells[0]), cellY(g, cells[0])];
  let i = 0;
  while (i < cells.length - 1) {
    let max = cost[cells[i]];
    let best = i + 1;
    for (let j = i + 1; j < cells.length; j++) {
      max = Math.max(max, cost[cells[j]]);
      if (clear(g, cost, cellX(g, cells[i]), cellY(g, cells[i]), cellX(g, cells[j]), cellY(g, cells[j]), max)) best = j;
      else if (j - best > 6) break;
    }
    out.push(cellX(g, cells[best]), cellY(g, cells[best]));
    i = best;
  }
  return out;
}

function polyLength(p: number[]): number {
  let L = 0;
  for (let i = 2; i < p.length; i += 2) L += Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1]);
  return L;
}

// ---------------------------------------------------------------- places

/** A place on a floor: an object, or a spot someone tapped. */
export interface Place {
  floorId: string;
  objectId?: string;
  x: number;
  y: number;
}

interface End {
  floor: Floor;
  obj?: MapObject;
  x: number;
  y: number;
}

/** The cells of a place, opened up so a route can reach it even inside a row of spaces. */
function placeCells(g: Grid, e: End, cost: Uint8Array): number[] {
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

// ---------------------------------------------------------------- floor connections

export type PortalKind = 'elevator' | 'stairs' | 'escalator' | 'ramp' | 'walkway' | 'inside' | 'outside';

interface Portal {
  kind: PortalKind;
  a: End;
  b: End;
  name: string;
  penalty: number;
}

function connectorKind(key: string): PortalKind {
  if (key.startsWith('elevator')) return 'elevator';
  if (key === 'escalator') return 'escalator';
  if (key.includes('ramp')) return 'ramp';
  if (key === 'walkway' || key === 'pedestrian-bridge') return 'walkway';
  return 'stairs';
}

const isConnector = (o: MapObject): o is AssetObject => o.kind === 'asset' && !!ASSET_BY_KEY[o.assetKey]?.connector;

/** Floors a connector reaches. Older maps without "Goes to" use the floors next to it (any floor for elevators). */
function reaches(doc: MapDocument, floor: Floor, o: AssetObject): Floor[] {
  if (o.connectsTo?.length) return o.connectsTo.map((id) => doc.floors.find((f) => f.id === id)).filter((f): f is Floor => !!f && f !== floor);
  const group = floorGroup(doc, floor);
  const i = group.indexOf(floor);
  if (connectorKind(o.assetKey) === 'elevator') return group.filter((f) => f !== floor);
  return [group[i - 1], group[i + 1]].filter((f): f is Floor => !!f);
}

const nameOf = (o: MapObject, fallback: string) =>
  o.name?.trim() || (o.kind === 'asset' ? o.label?.trim() || ASSET_BY_KEY[o.assetKey]?.name : undefined) || fallback;

const portalsCache = new WeakMap<MapDocument, Portal[]>();

function portals(doc: MapDocument): Portal[] {
  const hit = portalsCache.get(doc);
  if (hit) return hit;
  const out: Portal[] = [];
  const seen = new Set<string>();
  for (const f of doc.floors) {
    for (const o of f.objects) {
      if (!isConnector(o) || o.hidden) continue;
      const kind = connectorKind(o.assetKey);
      for (const to of reaches(doc, f, o)) {
        // On the other floor: the same kind of connector that comes back here, nearest to this one.
        let best: AssetObject | undefined;
        let bestD = Infinity;
        for (const y of to.objects) {
          if (!isConnector(y) || y.hidden || connectorKind(y.assetKey) !== kind) continue;
          if (!reaches(doc, to, y).includes(f)) continue;
          const d = Math.hypot(y.x - o.x, y.y - o.y);
          if (d < bestD) { bestD = d; best = y; }
        }
        const key = best ? [o.id, best.id].sort().join('|') : `${o.id}>${to.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const steps = Math.max(1, Math.abs(floorGroup(doc, to).indexOf(to) - floorGroup(doc, f).indexOf(f)));
        const penalty =
          kind === 'elevator' ? 150 + 30 * steps
          : kind === 'escalator' ? 150 * steps
          : kind === 'ramp' ? Math.max(o.width, o.height) * 1.5 + 200
          : kind === 'walkway' ? 50
          : 250 * steps;
        out.push({
          kind,
          name: nameOf(o, ASSET_BY_KEY[o.assetKey]?.name ?? 'Stairs'),
          penalty,
          a: { floor: f, obj: o, x: o.x, y: o.y },
          b: best ? { floor: to, obj: best, x: best.x, y: best.y } : { floor: to, x: o.x, y: o.y },
        });
      }
    }
  }
  // Buildings with a floor plan inside: in through their entrances.
  for (const site of doc.floors) {
    if (site.interiorOf) continue;
    for (const b of site.objects) {
      if (b.kind !== 'asset') continue;
      const inside = interiorFloors(doc, b.id)[0];
      if (!inside) continue;
      const bb = objectBox(b);
      const grow = 30;
      const doors = site.objects.filter((d) => d.kind === 'asset' && ENTRY_KEYS.has(d.assetKey) && !d.hidden &&
        d.x > bb.x - grow && d.x < bb.x + bb.width + grow && d.y > bb.y - grow && d.y < bb.y + bb.height + grow);
      const shell = inside.objects.find((o) => o.kind === 'asset' && o.assetKey === 'outer-walls');
      const frame = shell ?? null;
      const ib = frame ? objectBox(frame) : objectBox({ x: 0, y: 0, width: 1, height: 1, rotation: 0 });
      const innerDoors = inside.objects.filter((d) => d.kind === 'asset' && ENTRY_KEYS.has(d.assetKey) && !d.hidden);
      const outsideDoors = frame
        ? innerDoors.filter((d) => {
            const [lx, ly] = toLocal(frame, d.x, d.y);
            return Math.min(lx, ly, frame.width - lx, frame.height - ly) < 40;
          })
        : innerDoors;
      const entries: End[] = doors.length ? doors.map((d) => ({ floor: site, obj: d, x: d.x, y: d.y })) : [{ floor: site, obj: b, x: b.x, y: b.y }];
      for (const e of entries) {
        // Where this entrance lands on the floor plan: the same spot around the building's outline.
        const [lx, ly] = toLocal(b, e.x, e.y);
        const u = Math.min(1, Math.max(0, lx / b.width)), v = Math.min(1, Math.max(0, ly / b.height));
        const [px, py] = frame ? toWorld(frame, u * frame.width, v * frame.height) : [ib.x + u * ib.width, ib.y + v * ib.height];
        let inner: MapObject | undefined;
        let bestD = Infinity;
        for (const d of outsideDoors) {
          const dd = Math.hypot(d.x - px, d.y - py);
          if (dd < bestD) { bestD = dd; inner = d; }
        }
        out.push({
          kind: 'inside',
          name: buildingName(b),
          penalty: 20,
          a: e,
          b: inner ? { floor: inside, obj: inner, x: inner.x, y: inner.y } : { floor: inside, x: px, y: py },
        });
      }
    }
  }
  portalsCache.set(doc, out);
  return out;
}

// ---------------------------------------------------------------- routes

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

const sameEnd = (a: End, b: End) => a.floor === b.floor && (a.obj && b.obj ? a.obj === b.obj : Math.hypot(a.x - b.x, a.y - b.y) < 1);

/** Floor cost grid for one search: a copy, so opening up the start and end doesn't leak into the next search. */
function costFor(g: Grid, squeeze: boolean): Uint8Array {
  const c = g.cost.slice();
  if (squeeze) for (let i = 0; i < c.length; i++) if (g.spaceOnly[i]) c[i] = COST.squeeze;
  return c;
}

interface LegResult { points: number[]; cost: number }

/** One walk on one floor between two places. */
function walk(from: End, to: End, squeeze: boolean): LegResult | null {
  const g = floorGrid(from.floor);
  const cost = costFor(g, squeeze);
  const src = placeCells(g, from, cost);
  const dst = placeCells(g, to, cost);
  if (!src.length || !dst.length) return null;
  // Small places start from their middle, so the line starts on them.
  const mid = cellAt(g, from.x, from.y);
  const start = from.obj && !isBig(from.obj) && src.includes(mid) ? [mid] : src;
  const box = to.obj ? objectBox(to.obj) : { x: to.x, y: to.y, width: 0, height: 0 };
  const r = search(g, cost, start, [dst], box);
  if (r.reached[0] < 0) return null;
  return finish(g, cost, r, r.reached[0], from, to, false);
}

/** The line for a search result. `reversed`: the search ran from `to` back to `from`. */
function finish(g: Grid, cost: Uint8Array, r: SearchResult, end: number, from: End, to: End, reversed: boolean): LegResult {
  let cells = trace(r.prev, end);
  if (reversed) cells = cells.reverse();
  const pts = smooth(g, cost, cells);
  // Start and finish on the places themselves; buildings and big areas at their edge.
  const head = from.obj && isBig(from.obj) ? [] : [from.x, from.y];
  const tail = to.obj && isBig(to.obj) ? [] : [to.x, to.y];
  return { points: dedupe([...head, ...pts, ...tail]), cost: r.dist[end] };
}

/** Buildings and big areas are reached at their edge, not walked into. */
export const isBig = (o: MapObject) => o.kind === 'asset' && (!!ASSET_BY_KEY[o.assetKey]?.enterable || Math.min(o.width, o.height) > 140);

function dedupe(p: number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < p.length; i += 2) {
    const n = out.length;
    if (n && Math.abs(out[n - 2] - p[i]) < 0.5 && Math.abs(out[n - 1] - p[i + 1]) < 0.5) continue;
    out.push(p[i], p[i + 1]);
  }
  return out;
}

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
  for (const squeeze of [false, true]) {
    const r = routeOnce(doc, from, to, squeeze, opts);
    if (r) return { ok: true, route: { ...r, squeezed: squeeze } };
  }
  return { ok: false, reason: 'none' };
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
        leg: () => (reversed ? finish(g, cost, r, end, ends[i], src, true) : finish(g, cost, r, end, src, ends[i], false)),
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
        const same = !!ends[u].obj && ends[u].obj === ends[v].obj;
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
      else if (ends[u].obj && ends[u].obj === ends[v].obj) leg = { points: [ends[u].x, ends[u].y], cost: 0 };
      else leg = walk(ends[u], ends[v], squeeze);
      if (!leg) { blocked.add(`${u}>${v}`); failed = true; break; }
      segs.push({ kind: 'leg', a: ends[u], b: ends[v], res: leg });
    }
    if (!failed) return build(doc, segs);
  }
  return null;
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
  for (const s of segs) {
    if (s.kind === 'leg') {
      const length = polyLength(s.res.points);
      if (length < 1) continue;
      legs.push({ floorId: s.a.floor.id, points: s.res.points, length });
      steps.push({ floorId: s.a.floor.id, kind: 'walk', text: `Walk to ${placeLabel(s.b.obj)}`, leg: legs.length - 1, x: s.b.x, y: s.b.y });
      lastHop = -1;
      continue;
    }
    changes++;
    const [inn, out] = hopEnds(s.hop);
    const prev = lastHop >= 0 ? steps[lastHop] : null;
    // Riding the same elevator past a floor is one step, not two.
    if (prev && prev.kind === s.hop.portal.kind && prev.kind !== 'inside' && prev.kind !== 'outside') {
      steps[lastHop] = changeStep(doc, s.hop, prev.floorId, out, prev.x, prev.y);
    } else {
      steps.push(changeStep(doc, s.hop, inn.floor.id, out, inn.x, inn.y));
      lastHop = steps.length - 1;
    }
  }
  const length = legs.reduce((sum, l) => sum + l.length, 0);
  return { legs, steps, length, changes };
}

function hopEnds(h: Hop): [End, End] {
  return h.forward ? [h.portal.a, h.portal.b] : [h.portal.b, h.portal.a];
}

function changeStep(doc: MapDocument, hop: Hop, floorId: string, out: End, x: number, y: number): RouteStep {
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
  return { floorId, kind: p.kind, text: `Take ${p.name} ${dir} to ${out.floor.name}`, toFloorId: out.floor.id, x, y };
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
      const useful = def.connector || OPENERS.has(k) && !['door', 'double-door', 'crosswalk', 'pedestrian-crossing', 'barrier-arm'].includes(k)
        || k.startsWith('pin-') || k.startsWith('valet-') || k === 'pay-station' || k === 'info-desk' || k === 'reception-desk';
      if (useful) out.push({ floor: f, obj: o, name: nameOf(o, def.name) });
    }
  }
  return out;
}
