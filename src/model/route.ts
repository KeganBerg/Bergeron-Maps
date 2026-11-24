import { ASSET_BY_KEY } from '../assets/library';
import { spaceOutline, spaceSkew } from '../assets/catalog/spaces';
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
  open: 14, // open ground with nothing drawn on it (inside a building: the floor of a room)
  lot: 13, // the paved aisles in front of and around parking spaces (drawn lanes or not)
  bare: 40, // open ground on a site with roads, walkways or parking drawn: keep to what's drawn
  area: 16, // service bays, loading areas, sports fields
  edge: 45, // the walls of a room drawn without a door: crossable, but a door wins
  land: 50, // grass, flower beds, trees
  thing: 80, // furniture, vehicles, kiosks: squeeze past only if there's no other way
  squeeze: 120, // between parked cars, used only when there is no other way at all
} as const;

/** Extra cost at the very edge of a drive lane (none on its center line), so routes run down the middle like a car would. */
const LANE_EDGE = 14;
/** Extra cost right next to a wall or a parked car, fading out over CLEAR_REACH px. */
const CLEAR_COST = 30;
const CLEAR_REACH = 45;
/**
 * A lot's undrawn aisles: the open ground up to LOT_REACH px from the ends and
 * sides of parking spaces. Routes keep LOT_MID px off the stalls (half of a
 * 24 ft aisle), paying up to LOT_EDGE more right next to them, so they run down
 * the middle of the aisle and face the stalls like a car would.
 */
const LOT_REACH = 120;
const LOT_MID = 60;
const LOT_EDGE = 16;
/** No aisle where there's less than this much room either side (map px): 8 ft across. */
const LOT_SLOT = 20;

type Role = 'ignore' | 'walk' | 'road' | 'area' | 'land' | 'thing' | 'block' | 'space' | 'opener' | 'room' | 'shell';

function roleOf(o: MapObject, def: AssetDef | undefined, interior: boolean): Role {
  if (o.kind === 'space') return 'space';
  if (o.kind !== 'asset' || !def) return 'ignore';
  const k = o.assetKey;
  if (def.connector) return 'opener';
  if (k === 'outer-walls') return 'shell';
  if (def.walk) return def.walk;
  // Dashed zones (a delivery area, a service zone) mark ground, they don't pave it.
  if (def.dashed && def.category !== 'Pedestrian areas') return 'ignore';
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
  /** Map px from each square to the nearest wall, parked car or other blocked square. */
  room: Float32Array;
  /** Cost per cell before the keep-off-walls extra: what the ground is. */
  base: Uint8Array;
  /**
   * The way the lot is laid out, in degrees (0..90): the rows' and roads' own
   * angle. Routes over open ground run square to it. Null inside buildings and
   * where nothing sets it.
   */
  axis: number | null;
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
  const g: Grid = { x0: x1, y0: y1, cell, cols, rows, cost: new Uint8Array(cols * rows), spaceOnly: new Uint8Array(cols * rows), room: new Float32Array(cols * rows), base: new Uint8Array(0), axis: interiorFloor(floor) ? null : layoutAxis(items) };

  const shells = items.filter((p) => p.role === 'shell');
  // Inside a building's floor plan, the space outside its outer walls isn't walkable.
  // Where roads or walkways are drawn, bare ground (and any picture under it) is only a last resort.
  // Parking spaces count: the ground between their rows is the way (see paintLots).
  const drawnWays = items.some((p) => p.role === 'road' || p.role === 'walk' || (p.role === 'space' && !interiorFloor(floor)));
  const ground = shells.length ? 0 : drawnWays ? COST.bare : COST.open;
  g.cost.fill(ground);
  for (const { o } of shells) paint(g, o, undefined, 0, () => COST.open);
  for (const { o } of shells) {
    const t = Math.max(6, (o.strokeWidth ?? 6) + 2);
    paintFrame(g, o, t);
  }

  const set = (v: number) => () => v;
  const roadMask = new Uint8Array(cols * rows);
  for (const p of items) {
    const { o, def, role } = p;
    switch (role) {
      case 'walk': paint(g, o, def, 0, set(COST.walk)); break;
      case 'road': paintRoad(g, o, def, roadMask); break;
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
  // On a drive lane or walkway they change nothing (a cheap patch there would pull every
  // route across the marker); in a wall, on grass or on bare ground they are the way through.
  const opened = (c: number) => (c === 0 || c >= COST.bare ? COST.walk : c);
  // They open a little past their own thickness (to get through the wall they sit in),
  // but not past their ends: the wall beside a door stays a wall.
  const openerGrow = (o: MapObject): [number, number] => {
    const tiny = (v: number) => (v < 3 * g.cell ? g.cell : 0);
    return o.width <= o.height ? [g.cell, tiny(o.height)] : [tiny(o.width), g.cell];
  };
  // The aisles between and around the rows, where none are drawn.
  if (ground === COST.bare) distanceToBlocked(g);
  const lot = ground === COST.bare ? paintLots(g, COST.bare, items) : null;
  for (const p of items) if (p.role === 'opener') paint(g, p.o, p.def, openerGrow(p.o), opened, undefined, true);
  // Keep off walls and parked cars, most of all right next to them, so routes run down the middle of an aisle.
  distanceToBlocked(g);
  g.base = g.cost.slice();
  for (let i = 0; i < g.cost.length; i++) {
    if (g.cost[i] === 0) continue;
    const near = Math.max(0, 1 - g.room[i] / CLEAR_REACH);
    let extra = CLEAR_COST * near * near;
    if (lot?.[i] && g.cost[i] === COST.lot) extra += LOT_EDGE * Math.max(0, 1 - g.room[i] / LOT_MID);
    if (extra > 0) g.cost[i] = Math.min(250, g.cost[i] + Math.round(extra));
  }
  return g;
}

const interiorFloor = (f: Floor) => !!f.interiorOf;

/** The most common angle (mod 90°) of the floor's parking spaces and roads, weighted by size. */
function layoutAxis(items: Painted[]): number | null {
  const votes = new Map<number, number>();
  for (const { o, role } of items) {
    if (role !== 'space' && role !== 'road') continue;
    if (role === 'road' && o.kind === 'asset' && ASSET_BY_KEY[o.assetKey]?.outline && ASSET_BY_KEY[o.assetKey]?.outline !== 'rect') continue;
    const a = Math.round((((o.rotation % 90) + 90) % 90)) % 90;
    votes.set(a, (votes.get(a) ?? 0) + Math.max(o.width, o.height));
  }
  let best: number | null = null, n = 0;
  for (const [a, v] of votes) if (v > n) { n = v; best = a; }
  return best;
}

/**
 * Bare ground next to parking spaces is the lot's pavement: the aisle in front
 * of each stall and the cross aisles past the ends of its row. A stall whose
 * front opens onto a drawn lane or walkway gets no pavement behind it (the
 * curb or strip behind a row isn't a way in); one with nothing drawn at
 * either end is paved at both. Drawn lanes stay as they are, and grass,
 * buildings and zones painted over the ground too. Returns the squares paved.
 */
function paintLots(g: Grid, bare: number, items: Painted[]): Uint8Array | null {
  const stalls = items.filter((p) => p.role === 'space');
  if (!stalls.length) return null;
  const out = new Uint8Array(g.cols * g.rows);
  const R = LOT_REACH;
  const drawn = (i: number) => i >= 0 && !out[i] && g.cost[i] > 0 && g.cost[i] < bare && g.cost[i] !== COST.land;
  for (const { o } of stalls) {
    // Along: the way a car drives into the stall (across it, for a parallel one).
    const par = o.kind === 'space' && o.variant === 'parallel';
    const A = par ? o.width : o.height, B = par ? o.height : o.width;
    const at = (a: number, b: number) => {
      const [x, y] = par ? toWorld(o, a, b) : toWorld(o, b, a);
      return cellAt(g, x, y);
    };
    // What each end opens onto: a drawn way, or nothing (a wall or another stall stops the look).
    const front = [false, false];
    for (const end of [0, 1]) {
      for (let d = g.cell * 0.5; d <= R; d += g.cell * 0.5) {
        const i = at(end ? A + d : -d, B / 2);
        if (i < 0) break;
        if (drawn(i)) { front[end] = true; break; }
        if (g.cost[i] === 0) break;
      }
    }
    const open = front[0] || front[1] ? front : [true, true];
    eachCell(g, o, undefined, R, (i, lx, ly) => {
      // A slot too narrow for a car (between a wall and a row, say) isn't an aisle.
      if (g.cost[i] !== bare || g.room[i] < LOT_SLOT) return;
      const a = par ? lx : ly;
      const beside = a >= 0 && a <= A;
      const ahead = (open[0] && a < 0) || (open[1] && a > A);
      if (beside || ahead) { g.cost[i] = COST.lot; out[i] = 1; }
    });
  }
  return out;
}

/** Map px from every square to the nearest blocked one. */
function distanceToBlocked(g: Grid) {
  chamfer(g, g.room, (i) => g.cost[i] === 0);
}

/** Map px from every square to the nearest one where `at` holds (a two-pass chamfer distance). */
function chamfer(g: Grid, room: Float32Array, at: (i: number) => boolean) {
  const { cols, rows, cell } = g;
  const BIG = 1e6, D1 = cell, D2 = cell * Math.SQRT2;
  for (let i = 0; i < room.length; i++) room[i] = at(i) ? 0 : BIG;
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      let d = room[i];
      if (!d) continue;
      if (c > 0) d = Math.min(d, room[i - 1] + D1);
      if (r > 0) {
        d = Math.min(d, room[i - cols] + D1);
        if (c > 0) d = Math.min(d, room[i - cols - 1] + D2);
        if (c < cols - 1) d = Math.min(d, room[i - cols + 1] + D2);
      }
      room[i] = d;
    }
  for (let r = rows - 1; r >= 0; r--)
    for (let c = cols - 1; c >= 0; c--) {
      const i = r * cols + c;
      let d = room[i];
      if (!d) continue;
      if (c < cols - 1) d = Math.min(d, room[i + 1] + D1);
      if (r < rows - 1) {
        d = Math.min(d, room[i + cols] + D1);
        if (c < cols - 1) d = Math.min(d, room[i + cols + 1] + D2);
        if (c > 0) d = Math.min(d, room[i + cols - 1] + D2);
      }
      room[i] = d;
    }
}

/**
 * A drive lane: cheapest down its center line, a little dearer toward its
 * edges. Straight lanes (and square junctions, both ways) have a center line;
 * curved ones are painted flat. Where lanes overlap, the cheaper square wins.
 */
function paintRoad(g: Grid, o: MapObject, def: AssetDef | undefined, mask: Uint8Array) {
  const straight = !!def && def.merge === 'road' && (!def.outline || def.outline === 'rect') && !(o.cuts?.length);
  const sq = Math.abs(o.width - o.height) < 0.2 * Math.max(o.width, o.height);
  eachCell(g, o, def, 0, (i, lx, ly) => {
    let v: number = COST.road;
    if (straight) {
      const across = Math.abs(ly - o.height / 2) / (o.height / 2);
      const along = Math.abs(lx - o.width / 2) / (o.width / 2);
      const t = sq ? Math.min(across, along) : o.width >= o.height ? across : along;
      v = COST.road + Math.round(LANE_EDGE * Math.min(1, t));
    }
    g.cost[i] = mask[i] && g.cost[i] !== 0 ? Math.min(g.cost[i], v) : v;
    mask[i] = 1;
    g.spaceOnly[i] = 0;
  });
}

/** Calls `f` with each cell whose center is inside the object (grown by `grow` px). */
function eachCell(g: Grid, o: MapObject, def: AssetDef | undefined, growBy: number | [number, number], f: (i: number, lx: number, ly: number) => void) {
  const [gx, gy] = typeof growBy === 'number' ? [growBy, growBy] : growBy;
  const grow = Math.max(gx, gy);
  const b = objectBox(o);
  const c0 = Math.max(0, Math.floor((b.x - grow - g.x0) / g.cell));
  const c1 = Math.min(g.cols - 1, Math.floor((b.x + b.width + grow - g.x0) / g.cell));
  const r0 = Math.max(0, Math.floor((b.y - grow - g.y0) / g.cell));
  const r1 = Math.min(g.rows - 1, Math.floor((b.y + b.height + grow - g.y0) / g.cell));
  const outline = def?.outline && def.outline !== 'rect' ? def.outline : undefined;
  const rings = outline || (o.cuts?.length ?? 0) > 0
    ? localOutline({ width: o.width, height: o.height, outline, band: (o as AssetObject).band ?? def?.band, cuts: o.cuts, curve: outline === 'arc' ? (o as AssetObject).curve : undefined })
    : null;
  let any = false;
  for (let r = r0; r <= r1; r++) {
    const wy = g.y0 + (r + 0.5) * g.cell;
    for (let c = c0; c <= c1; c++) {
      const wx = g.x0 + (c + 0.5) * g.cell;
      const [lx, ly] = toLocal(o, wx, wy);
      if (lx < -gx || ly < -gy || lx > o.width + gx || ly > o.height + gy) continue;
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
function paint(g: Grid, o: MapObject, def: AssetDef | undefined, grow: number | [number, number], value: (cur: number) => number, mark?: Uint8Array, clearMark = false) {
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

/**
 * The line that gets drawn: the cheapest path from `sources` to `targets`
 * counting turns too (see TURN). It searches square-and-heading pairs, so it
 * runs only for the one walk that is drawn; picking floors and connections
 * uses the plain search's distances. A*, toward the `toward` box.
 */
function searchTurns(g: Grid, cost: Uint8Array, sources: number[], targets: number[], toward: Box): { cells: number[]; dist: number } | null {
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

function trace(prev: Int32Array, end: number): number[] {
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
const KEEP_CLEAR = 30;

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
function simplify(g: Grid, cost: Uint8Array, cells: number[]): number[] {
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
function square(g: Grid, cost: Uint8Array, p: number[]): number[] {
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
const BEND = 30;

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
  /**
   * Where a stair, elevator or ramp comes out on a floor that has none drawn
   * (a floor not mapped yet, say): its kind and name. Landings of the same
   * kind at the same spot are one shaft, ridden straight past.
   */
  landing?: { kind: PortalKind; name: string };
}

/** The cells of a place, opened up so a route can reach it even inside a row of spaces. */
function placeCells(g: Grid, e: End, cost: Uint8Array): number[] {
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

function approachOf(g: Grid, o: MapObject): Approach | null {
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

// ---------------------------------------------------------------- floor connections

export type PortalKind = 'elevator' | 'stairs' | 'escalator' | 'ramp' | 'walkway' | 'inside' | 'outside';

interface Portal {
  kind: PortalKind;
  a: End;
  b: End;
  name: string;
  penalty: number;
}

export function connectorKind(key: string): PortalKind {
  if (key.startsWith('elevator')) return 'elevator';
  if (key === 'escalator') return 'escalator';
  if (key.includes('ramp')) return 'ramp';
  if (key === 'walkway' || key === 'pedestrian-bridge') return 'walkway';
  return 'stairs';
}

export const isConnector = (o: MapObject): o is AssetObject => o.kind === 'asset' && !!ASSET_BY_KEY[o.assetKey]?.connector;

/** Floors a connector reaches. Older maps without "Goes to" use the floors next to it (any floor for elevators). */
export function reaches(doc: MapDocument, floor: Floor, o: AssetObject): Floor[] {
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
          // A garage ramp is a long walk on a car's way: stairs and elevators first.
          : kind === 'ramp' ? Math.max(o.width, o.height) * 1.5 + 400 * steps
          : kind === 'walkway' ? 50
          : 250 * steps;
        out.push({
          kind,
          name: nameOf(o, ASSET_BY_KEY[o.assetKey]?.name ?? 'Stairs'),
          penalty,
          a: { floor: f, obj: o, x: o.x, y: o.y },
          b: best ? { floor: to, obj: best, x: best.x, y: best.y } : { floor: to, x: o.x, y: o.y, landing: { kind, name: nameOf(o, ASSET_BY_KEY[o.assetKey]?.name ?? 'Stairs') } },
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
      const doors = site.objects.filter((d) => d.kind === 'asset' && !!ASSET_BY_KEY[d.assetKey]?.entersBuilding && !d.hidden &&
        d.x > bb.x - grow && d.x < bb.x + bb.width + grow && d.y > bb.y - grow && d.y < bb.y + bb.height + grow);
      const shell = inside.objects.find((o) => o.kind === 'asset' && o.assetKey === 'outer-walls');
      const frame = shell ?? null;
      const ib = frame ? objectBox(frame) : objectBox({ x: 0, y: 0, width: 1, height: 1, rotation: 0 });
      const innerDoors = inside.objects.filter((d) => d.kind === 'asset' && !!ASSET_BY_KEY[d.assetKey]?.entersBuilding && !d.hidden);
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
function walk(from: End, to: End, squeeze: boolean): LegResult | null {
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
