/**
 * Sample maps for the industry pages on bergeronmaps.com, built from the app's
 * own library and row numbering. scripts/industry-shots/shoot.mjs loads this in
 * the running app, saves each map, and screenshots the real editor and viewer.
 * Sample sites only: no client names.
 */
import { ASSET_BY_KEY } from '../../src/assets/library';
import { createFloor, createMap } from '../../src/model/factory';
import { newId } from '../../src/model/ids';
import { buildRowSpaces, DEFAULT_ROW } from '../../src/model/rows';
import type { AssetObject, Floor, MapDocument, RowSpec, SpaceVariant, TextObject } from '../../src/model/types';

const layerOf = (f: Floor, role: string) => f.layers.find((l) => l.role === role)!.id;

function put(f: Floor, key: string, x: number, y: number, name: string, o: Partial<AssetObject> = {}) {
  const def = ASSET_BY_KEY[key];
  if (!def) throw new Error('No asset ' + key);
  const a: AssetObject = { id: newId('as'), kind: 'asset', assetKey: key, layerId: layerOf(f, def.layer), x, y, width: def.width, height: def.height, rotation: 0, name, ...o };
  f.objects.push(a);
  return a;
}

/** A numbered row: (x, y) is the centre of its first space. */
function row(f: Floor, prefix: string, count: number, x: number, y: number, o: { start?: number; rotation?: number; variant?: SpaceVariant; depth?: number; width?: number; digits?: number } = {}) {
  const spec: RowSpec = { ...DEFAULT_ROW, id: newId('row'), count, prefix, start: o.start ?? 1, digits: o.digits ?? 1, spaceDepth: o.depth ?? DEFAULT_ROW.spaceDepth, spaceWidth: o.width ?? DEFAULT_ROW.spaceWidth };
  f.rows[spec.id] = spec;
  const sp = buildRowSpaces(spec, { x, y, rotation: o.rotation ?? 0 }, layerOf(f, 'spaces'));
  if (o.variant) sp.forEach((s) => (s.variant = o.variant));
  f.objects.push(...sp);
  return sp;
}

const road = (f: Floor, x0: number, y0: number, x1: number, y1: number, name: string, w = 110) =>
  x0 === x1
    ? put(f, 'road', x0, (y0 + y1) / 2, name, { width: Math.abs(y1 - y0), height: w, rotation: 90 })
    : put(f, 'road', (x0 + x1) / 2, y0, name, { width: Math.abs(x1 - x0), height: w });

/** A zone: (x, y, w, h) as a box from its top-left corner. */
const zone = (f: Floor, key: string, x: number, y: number, w: number, h: number, label: string, shown = true) =>
  put(f, key, x + w / 2, y + h / 2, label, { width: w, height: h, label: shown ? label : '' });

function text(f: Floor, x: number, y: number, t: string, size = 26, color = '#0b2545') {
  const o: TextObject = { id: newId('tx'), kind: 'text', layerId: layerOf(f, 'labels'), x, y, width: t.length * size * 0.8, height: size * 1.3, rotation: 0, text: t, fontSize: size, color };
  f.objects.push(o);
}

function doc(name: string, floors: string[]): MapDocument {
  const d = createMap(name);
  d.floors = floors.map((n) => createFloor(n));
  return d;
}

/* ---------------------------------------------------------------- dealership */
export function dealership(): MapDocument {
  const d = doc('Sample Dealership', ['Main lot']);
  const f = d.floors[0];
  const W = 45, D = 90;
  road(f, -200, -70, 1640, -70, 'Frontage road');
  road(f, -60, -70, -60, 900, 'Lot drive');
  road(f, 40, 300, 1000, 300, 'Inventory lane');
  road(f, 40, 690, 1640, 690, 'Back lane');
  // New and used inventory, back to back, each in its own section.
  zone(f, 'inventory-section', 20, 30, 670, 210, 'New inventory', false);
  row(f, 'N', 14, 40 + W / 2, 40 + D / 2);
  row(f, 'N', 14, 40 + W / 2, 40 + D + D / 2, { start: 15 });
  zone(f, 'inventory-section', 20, 370, 670, 210, 'Used inventory', false);
  row(f, 'U', 14, 40 + W / 2, 380 + D / 2);
  row(f, 'U', 14, 40 + W / 2, 380 + D + D / 2, { start: 15 });
  text(f, 355, 15, 'NEW INVENTORY', 20);
  text(f, 355, 355, 'USED INVENTORY', 20);
  text(f, 1300, 316, 'CUSTOMER PARKING', 18);
  text(f, 1250, 458, 'SERVICE', 18);
  text(f, 560, 745, 'OVERFLOW', 18);
  put(f, 'new-inventory-sign', 730, 70, 'New inventory sign');
  put(f, 'used-inventory-sign', 730, 420, 'Used inventory sign');
  // Showroom, customer parking and the service drive.
  put(f, 'dealership-building', 1290, 150, 'Showroom', { width: 440, height: 250, label: 'Showroom' });
  zone(f, 'customer-service-zone', 1050, 330, 500, 120, 'Customer parking', false);
  row(f, 'C', 10, 1080 + W / 2, 340 + D / 2);
  zone(f, 'service-zone', 1050, 470, 500, 140, 'Service', false);
  row(f, 'S', 8, 1080 + W / 2, 490 + D / 2);
  put(f, 'service-reception-lane', 1500, 550, 'Service drive', { rotation: 90 });
  put(f, 'key-box', 1100, 60, 'Key box');
  put(f, 'monument-sign', 900, -150, 'Monument sign', { label: 'SAMPLE MOTORS' });
  // Overflow along the back lane.
  zone(f, 'overflow-zone', 20, 760, 1080, 120, 'Overflow', false);
  row(f, 'O', 22, 40 + W / 2, 770 + D / 2);
  put(f, 'entrance', -60, -190, 'Entrance');
  return d;
}

/* ---------------------------------------------------------------- warehouse */
export function warehouse(): MapDocument {
  const d = doc('Sample Distribution Center', ['Main floor']);
  const f = d.floors[0];
  put(f, 'outer-walls', 760, 430, 'Building', { width: 1640, height: 980 });
  // Racks: numbered bay locations in long rows, aisles between them.
  const racks = ['A', 'B', 'C', 'D', 'E', 'F'];
  racks.forEach((r, i) => {
    const y = 120 + i * 120;
    row(f, r + '-', 16, 300 + 22, y, { depth: 50, width: 44, digits: 2 });
    zone(f, 'custom-rect', 296, y - 27, 16 * 44 + 8, 54, 'Rack ' + r).label = '';
    text(f, 240, y, 'Rack ' + r, 22);
    if (i % 2 === 0) text(f, 660, y + 60, `Aisle ${i / 2 + 1}`, 16, '#5d6b7e');
  });
  zone(f, 'delivery-zone', 1100, 40, 400, 260, 'Receiving');
  zone(f, 'service-zone', 1100, 340, 400, 200, 'Staging');
  zone(f, 'customer-service-zone', 1100, 580, 400, 260, 'Shipping');
  for (let i = 0; i < 4; i++) put(f, 'loading-dock', 1150 + i * 95, -45, `Receiving dock ${i + 1}`);
  for (let i = 0; i < 4; i++) put(f, 'loading-dock', 1150 + i * 95, 905, `Shipping dock ${i + 1}`, { rotation: 180 });
  put(f, 'office-building', 120, 830, 'Warehouse office', { width: 220, height: 130, label: 'Office' });
  put(f, 'break-room', 380, 830, 'Break room', { width: 180, height: 130, label: 'Break room' });
  put(f, 'storage-area', 720, 830, 'Returns', { width: 300, height: 130, label: 'Returns' });
  put(f, 'restroom', 960, 830, 'Restrooms');
  put(f, 'fire-extinguisher', 60, 120, 'Fire extinguisher');
  put(f, 'emergency-exit', -50, 500, 'Emergency exit');
  return d;
}

/* ---------------------------------------------------------------- school */
export function school(): MapDocument {
  const d = doc('Sample High School', ['Campus']);
  const f = d.floors[0];
  const W = 45, D = 90;
  road(f, -260, -80, 1700, -80, 'Main street');
  road(f, -120, -80, -120, 980, 'Campus drive');
  road(f, -120, 980, 1100, 980, 'Bus loop', 110);
  put(f, 'admin-building', 380, 120, 'Main office', { width: 300, height: 170, label: 'Main office' });
  put(f, 'classroom-building', 780, 140, 'Building A', { width: 340, height: 210, label: 'Building A' });
  put(f, 'classroom-building', 780, 430, 'Building B', { width: 340, height: 210, label: 'Building B' });
  put(f, 'library-building', 380, 400, 'Library', { width: 260, height: 160, label: 'Library' });
  put(f, 'cafeteria', 380, 610, 'Cafeteria', { width: 260, height: 150, label: 'Cafeteria' });
  put(f, 'gymnasium', 1200, 300, 'Gymnasium', { width: 280, height: 260, label: 'Gymnasium' });
  put(f, 'football-field', 1380, 760, 'Stadium field', { width: 480, height: 260 });
  put(f, 'visitor-entrance', 380, 225, 'Visitor entrance');
  put(f, 'student-entrance', 600, 560, 'Student entrance');
  // Parking by who parks there.
  zone(f, 'reserved-zone', -40, 40, 180, 280, 'Visitor', false);
  row(f, 'V', 5, 0, 60 + W / 2, { rotation: 90 }).forEach((s, i) => i < 1 && (s.variant = 'accessible'));
  zone(f, 'employee-zone', -40, 360, 180, 330, 'Faculty', false);
  row(f, 'F', 7, 0, 380 + W / 2, { rotation: 90 });
  row(f, 'F', 7, D, 380 + W / 2, { rotation: 90, start: 8 }).forEach(() => undefined);
  zone(f, 'parking-zone', 560, 700, 520, 220, 'Student parking', false);
  row(f, 'S', 11, 580 + W / 2, 715 + D / 2);
  row(f, 'S', 11, 580 + W / 2, 715 + D + D / 2, { start: 12 });
  put(f, 'student-dropoff', 160, 900, 'Student drop-off', { width: 300, height: 90, label: 'Drop-off' });
  put(f, 'bus-loading', 160, 1080, 'Bus loading', { width: 300, height: 90, label: 'Bus loading' });
  text(f, 50, 25, 'VISITOR', 18);
  text(f, 50, 345, 'FACULTY', 18);
  text(f, 820, 685, 'STUDENT PARKING', 18);
  put(f, 'school-bus', 520, 1080, 'Bus 1', { rotation: 90 });
  put(f, 'aed', 960, 300, 'AED');
  put(f, 'emergency-access-point', 1450, 520, 'Emergency access');
  return d;
}

/* ---------------------------------------------------------------- valet garage */
export function valet(): MapDocument {
  const d = doc('Sample Garage', ['Floor 1', 'Floor 2', 'Floor 3']);
  const W = 45;
  d.floors.forEach((f, i) => {
    const n = i + 1;
    const others = d.floors.filter((g) => g !== f).map((g) => g.id);
    road(f, -55, 60, -55, 700, 'Main drive lane');
    road(f, 0, 205, 810, 205, 'Drive lane 1');
    road(f, 0, 495, 810, 495, 'Drive lane 2');
    row(f, `${n}A`, 18, W / 2, 105);
    row(f, `${n}B`, 18, W / 2, 305);
    row(f, `${n}C`, 18, W / 2, 395);
    row(f, `${n}D`, 18, W / 2, 595);
    put(f, 'ramp', 900, 205, `Ramp ${n}`, { connectsTo: others });
    put(f, 'stairs', -170, 140, 'Stairway 1', { connectsTo: others });
    put(f, 'elevator', -170, 260, 'Elevator 1', { connectsTo: others });
    if (i === 0) {
      put(f, 'entrance', -55, 740, 'Entrance', { rotation: 180 });
      put(f, 'valet-booth', 120, 770, 'Valet booth', { label: 'Valet booth' });
      put(f, 'key-box', 260, 770, 'Key box', { label: 'Key box' });
      put(f, 'valet-pickup', 640, 770, 'Guest pickup', { width: 260, height: 90, label: 'Guest pickup' });
    }
  });
  return d;
}

/* ---------------------------------------------------------------- office (other industries) */
export function office(): MapDocument {
  const d = doc('Sample Office Building', ['Floor 2']);
  const f = d.floors[0];
  put(f, 'outer-walls', 600, 340, 'Building', { width: 1300, height: 760 });
  ['201', '202', '203', '204'].forEach((n, i) => put(f, 'private-office', 80 + i * 180, 90, 'Office ' + n, { width: 170, height: 170, label: n }));
  put(f, 'conference-room', 860, 100, 'Conference room', { width: 300, height: 190, label: 'Conference room' });
  put(f, 'copy-room', 1130, 100, 'Copy room', { width: 200, height: 190, label: 'Copy room' });
  put(f, 'open-office', 360, 460, 'Sales', { width: 640, height: 300, label: 'Sales' });
  put(f, 'training-room', 880, 460, 'Training room', { width: 280, height: 220, label: 'Training room' });
  put(f, 'restroom-men', 1130, 400, "Men's restroom", { width: 160, height: 120, label: "Men's" });
  put(f, 'restroom-women', 1130, 540, "Women's restroom", { width: 160, height: 120, label: "Women's" });
  put(f, 'reception-desk', 900, 660, 'Reception', { label: 'Reception' });
  put(f, 'elevator', 1130, 660, 'Elevator', { label: 'Elevator' });
  return d;
}

export const SCENES = { dealership, warehouse, school, valet, office };
