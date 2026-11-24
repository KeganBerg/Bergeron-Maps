import { ASSET_BY_KEY } from '../../assets/library';
import type { AssetDef } from '../../assets/defs';
import { objectBox } from '../geometry';
import { insideRings, localOutline, toLocal, toWorld } from '../shape';
import type { AssetObject, Floor, MapObject } from '../types';

/**
 * Walking directions, part 1: the cost grid. Each floor becomes a grid of
 * small squares, each with a walking cost from what is drawn there (see
 * COST and roleOf). Entry point and overview: src/model/route.ts.
 */

/** Cost per map pixel, x10. 0 = can't be walked through. */
export const COST = {
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
export function eachCell(g: Grid, o: MapObject, def: AssetDef | undefined, growBy: number | [number, number], f: (i: number, lx: number, ly: number) => void) {
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
export function clampedCell(g: Grid, x: number, y: number): number {
  const c = Math.min(g.cols - 1, Math.max(0, Math.floor((x - g.x0) / g.cell)));
  const r = Math.min(g.rows - 1, Math.max(0, Math.floor((y - g.y0) / g.cell)));
  return r * g.cols + c;
}

export const cellX = (g: Grid, i: number) => g.x0 + ((i % g.cols) + 0.5) * g.cell;
export const cellY = (g: Grid, i: number) => g.y0 + (Math.floor(i / g.cols) + 0.5) * g.cell;
