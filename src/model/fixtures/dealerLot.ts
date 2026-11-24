/**
 * A dealership site drawn the way people draw over a satellite photo: one
 * public road along the front, buildings, rows of stalls and a few zones, and
 * no drive aisles drawn in the lot. Laid out from a real customer screenshot
 * (generic names only). Used by the directions tests and audits.
 */
import { ASSET_BY_KEY } from '../../assets/library';
import { createFloor, createMap } from '../factory';
import { newId } from '../ids';
import { buildRowSpaces, DEFAULT_ROW } from '../rows';
import type { AssetObject, Floor, MapDocument, RowSpec } from '../types';

const layerOf = (f: Floor, role: string) => f.layers.find((l) => l.role === role)!.id;

/** Screen px of the screenshot to map px (stalls there were 45 x 90). */
const K = 2.25;

/** An asset from its box (x1, y1)-(x2, y2) in screenshot px. */
function box(f: Floor, key: string, x1: number, y1: number, x2: number, y2: number, name: string, o: Partial<AssetObject> = {}) {
  const def = ASSET_BY_KEY[key];
  if (!def) throw new Error('No asset ' + key);
  const a: AssetObject = {
    id: newId('as'), kind: 'asset', assetKey: key, layerId: layerOf(f, def.layer),
    x: ((x1 + x2) / 2) * K, y: ((y1 + y2) / 2) * K, width: (x2 - x1) * K, height: (y2 - y1) * K, rotation: 0, name, label: name, ...o,
  };
  f.objects.push(a);
  return a;
}

/**
 * A row of stalls. (x, y): the first stall's center in screenshot px.
 * `down`: the row runs down the page (stalls face east and west).
 */
function row(f: Floor, prefix: string, start: number, count: number, x: number, y: number, down: boolean) {
  const spec: RowSpec = { ...DEFAULT_ROW, id: newId('row'), count, prefix, start, digits: 1 };
  f.rows[spec.id] = spec;
  const sp = buildRowSpaces(spec, { x: x * K, y: y * K, rotation: down ? 90 : 0 }, layerOf(f, 'spaces'));
  f.objects.push(...sp);
  return sp;
}

export function dealerLot(): MapDocument {
  const d = createMap('Sample Dealer Lot');
  d.floors = [createFloor('Site')];
  const f = d.floors[0];
  const P = 45 / K; // one stall along a row, in screenshot px

  // The public road along the front: the only driving surface drawn.
  box(f, 'road', -60, 645, 1180, 695, 'Main Street');

  // Buildings and departments.
  box(f, 'service-department', 288, -60, 688, 157, 'Mechanic Bay 2');
  box(f, 'service-department', 130, 125, 288, 187, 'Lube Techs');
  box(f, 'service-department', 288, 157, 830, 388, 'Mechanic Bay 1');
  box(f, 'service-department', 144, 308, 313, 545, 'Service department');
  box(f, 'dealership-building', 313, 388, 702, 565, 'Dealership building');
  box(f, 'parts-department', 313, 388, 432, 437, 'Parts department');
  box(f, 'customer-lounge', 313, 437, 387, 513, 'Customer lounge');
  box(f, 'finance-office', 702, 388, 830, 468, 'Finance office');
  box(f, 'vehicle-delivery-room', 702, 468, 830, 508, 'Vehicle delivery room');
  box(f, 'delivery-area', 737, 508, 820, 638, 'delivery area');

  // East lot: back-to-back columns of stalls with unmarked aisles between them.
  row(f, 'A', 1, 6, 854, 439, true);
  row(f, 'A', 7, 12, 940, 337, true);
  row(f, 'A', 19, 12, 980, 337, true);
  row(f, 'A', 31, 12, 1064, 337, true);
  row(f, 'B', 1, 8, 940, 62 - 7 * P, true);
  row(f, 'B', 9, 7, 940, 101, true);
  row(f, 'B', 16, 8, 980, 62 - 7 * P, true);
  row(f, 'B', 24, 7, 980, 101, true);
  row(f, 'B', 39, 3, 1064, 12, true);
  row(f, 'B', 42, 11, 1064, 87, true);

  // Front row along the road, in front of the showroom.
  row(f, '', 248, 6, 311, 614, false);
  row(f, '', 254, 6, 448, 614, false);
  row(f, '', 260, 4, 623, 614, false);

  // Across the road.
  row(f, '', 1, 10, 55, 718, false);
  row(f, '', 66, 9, 293, 718, false);
  row(f, '', 125, 10, 510, 718, false);
  row(f, '', 190, 4, 765, 718, false);
  row(f, '', 213, 5, 877, 718, false);
  for (const x of [28, 265, 482, 735, 852, 985]) box(f, 'grass-area', x - 12, 699, x + 12, 740, 'Grass');
  return d;
}
