/**
 * Join test maps for the asset audit: pieces placed against each other the way
 * a real lot uses them (rows on lanes, grass between rows, curbs and sidewalks
 * along buildings, ramps and drives meeting roads). shoot.mjs saves each map
 * in the running app and screenshots it, so before/after shots compare the
 * same layout. Sample sites only: no client names.
 */
import { ASSET_BY_KEY } from '../../src/assets/library';
import { createFloor, createMap } from '../../src/model/factory';
import { newId } from '../../src/model/ids';
import { buildRowSpaces, DEFAULT_ROW } from '../../src/model/rows';
import { createQuickLot } from '../../src/model/quickLot';
import type { AssetObject, Floor, MapDocument, RowSpec } from '../../src/model/types';

const layerOf = (f: Floor, role: string) => f.layers.find((l) => l.role === role)!.id;

function put(f: Floor, key: string, x: number, y: number, o: Partial<AssetObject> = {}) {
  const def = ASSET_BY_KEY[key];
  if (!def) throw new Error('No asset ' + key);
  const a: AssetObject = { id: newId('as'), kind: 'asset', assetKey: key, layerId: layerOf(f, def.layer), x, y, width: def.width, height: def.height, rotation: 0, name: def.name, ...o };
  f.objects.push(a);
  return a;
}
/** Box placed by its top-left corner. */
const box = (f: Floor, key: string, x: number, y: number, w: number, h: number, o: Partial<AssetObject> = {}) => put(f, key, x + w / 2, y + h / 2, { width: w, height: h, ...o });

function row(f: Floor, prefix: string, count: number, x: number, y: number, o: { rotation?: number; angle?: number } = {}) {
  const spec: RowSpec = { ...DEFAULT_ROW, id: newId('row'), count, prefix, angle: o.angle };
  f.rows[spec.id] = spec;
  const sp = buildRowSpaces(spec, { x, y, rotation: o.rotation ?? 0 }, layerOf(f, 'spaces'));
  f.objects.push(...sp);
  return sp;
}

function doc(name: string): MapDocument {
  const d = createMap(name);
  d.floors = [createFloor('Lot')];
  return d;
}

/** A surface lot: road, lanes, rows, grass, curbs, sidewalks, building, entrances. */
export function lot(): MapDocument {
  const d = doc('Join test: surface lot');
  const f = d.floors[0];
  const W = 45, D = 90, L = 120;
  // Frontage road along the top with a two-way drive entering the lot.
  box(f, 'straight-road', -300, -260, 1700, L);
  box(f, 'two-way-lane', 60, -140, L, 140, { rotation: 0, width: 140, height: L, x: 120, y: -70, }).rotation = 90;
  box(f, 'crosswalk', 60, -40, L, 40, { width: 120, height: 40, x: 120, y: -40 + 20 });
  // Drive lane along the lot, rows facing it on both sides.
  box(f, 'road', 60, 0, 1100, L);
  row(f, 'A', 20, 240 + W / 2, -D / 2);
  row(f, 'B', 20, 240 + W / 2, L + D / 2);
  // Grass divider between back-to-back rows, with half islands at the row ends.
  box(f, 'grass-divider', 240, L + D, 20 * W, 30);
  row(f, 'C', 20, 240 + W / 2, L + D + 30 + D / 2);
  box(f, 'grass-island-half', 180, L + D - 15, 60, 60, { rotation: -90 });
  box(f, 'grass-island-half', 240 + 20 * W, L + D - 15, 60, 60, { rotation: 90 });
  // Second lane, and a turnaround at its end.
  box(f, 'road', 60, L + 2 * D + 30, 1100, L);
  put(f, 'turnaround', 1160 + 120, L + 2 * D + 30 + L / 2);
  // Lot drive down the left joining both lanes.
  box(f, 'road', 60, 0, L, 2 * D + 30 + 2 * L, { x: 120, y: (2 * D + 30 + 2 * L) / 2, width: 2 * D + 30 + 2 * L, height: L, rotation: 90 });
  // Grass area beside the lot drive, merged with a divider; trees on it.
  box(f, 'grass-area', -180, 0, 240, 300);
  box(f, 'grass-divider', -180, 300, 240, 30);
  put(f, 'tree', -100, 80);
  put(f, 'tree', -40, 200);
  // Building with curb, sidewalk, entrances, stairs and elevator; wheel stops in row C.
  const by = L + 2 * D + 30 + L;
  box(f, 'curb', 60, by, 1100, 20);
  box(f, 'sidewalk', 60, by + 20, 1100, 60);
  box(f, 'building-outline', 60, by + 80, 1100, 260);
  put(f, 'building-entrance', 260, by + 80);
  put(f, 'lobby-entrance', 520, by + 80);
  put(f, 'stairs', 900, by + 80 + 60);
  put(f, 'elevator', 980, by + 80 + 40);
  put(f, 'accessible-ramp', 760, by + 50);
  for (let i = 0; i < 20; i++) put(f, 'parking-stop', 240 + W / 2 + i * W, L + D + 30 + D - 10);
  put(f, 'entrance', 120, -320);
  return d;
}

/** Garage level: walls, ramps, columns, angled rows, stairwell and elevators. */
export function garage(): MapDocument {
  const d = doc('Join test: garage');
  const f = d.floors[0];
  const W = 45, D = 90, L = 120;
  box(f, 'wall', -20, -20, 1300, 10);
  box(f, 'wall', -20, 600, 1300, 10);
  row(f, 'A', 20, 100 + W / 2, -10 + D / 2);
  box(f, 'road', 0, 80, 1100, L);
  row(f, 'B', 20, 100 + W / 2, 80 + L + D / 2);
  row(f, 'C', 18, 100 + W / 2, 80 + L + D + D / 2, { rotation: 0, angle: 60 });
  box(f, 'one-way-lane', 0, 80 + L + 2 * D, 1100, L);
  box(f, 'ramp-up', 1100, 80, 240, L);
  box(f, 'ramp-down', 1100, 80 + L + 2 * D, 240, L);
  for (let x = 100; x <= 1000; x += 270) put(f, 'column', x, 80 + L + D);
  put(f, 'stairwell', -60, 260);
  put(f, 'elevator-bank', -60, 420, { rotation: 90 });
  box(f, 'speed-bump', 500, 80, 16, L);
  box(f, 'stop-line', 1080, 80 + L / 2, 14, L / 2);
  return d;
}

/** Roads: intersection, roundabout and turnaround pieces with roads joined to their arms; loading and service lanes. */
export function roads(): MapDocument {
  const d = doc('Join test: roads');
  const f = d.floors[0];
  const L = 120;
  // A crossroads built from the Intersection piece and four straight roads.
  put(f, 'intersection', 600, 300);
  box(f, 'straight-road', 0, 240, 450, L);
  box(f, 'straight-road', 750, 240, 450, L);
  put(f, 'straight-road', 600, 0, { width: 300, height: L, rotation: 90 });
  put(f, 'straight-road', 600, 600, { width: 300, height: L, rotation: 90 });
  // Driving lanes into a roundabout.
  box(f, 'road', 1200, 270, 300, 60);
  put(f, 'roundabout', 1630, 300);
  box(f, 'road', 1760, 270, 300, 60);
  put(f, 'road', 1630, 580, { width: 300, height: 60, rotation: 90 });
  // A lane ending in a turnaround.
  box(f, 'one-way-lane', 0, 1000, 600, 60);
  put(f, 'turnaround', 720, 1030);
  // Service and loading lanes joining a drive lane.
  box(f, 'road', 1000, 800, 1000, 60);
  box(f, 'service-reception-lane', 1100, 860, 300, 70, { rotation: 90, x: 1150, y: 1010, width: 300, height: 70 });
  box(f, 'loading-lane', 1500, 860, 300, 60, { rotation: 90, x: 1600, y: 1010, width: 300, height: 60 });
  box(f, 'two-way-lane', 0, 1200, 600, L);
  return d;
}

/** The quick lot builder's two-level garage (ramp meeting the first drive lane). */
export const quick = () => createQuickLot('Join test: quick lot', { floors: 2, rows: 4, spacesPerRow: 10, accessible: 2 });

export const SCENES: Record<string, () => MapDocument> = { lot, garage, roads, quick };
