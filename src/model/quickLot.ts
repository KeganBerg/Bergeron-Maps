import { ASSET_BY_KEY } from '../assets/library';
import { createFloor, createMap } from './factory';
import { newId } from './ids';
import { buildRowSpaces, DEFAULT_ROW } from './rows';
import type { AssetObject, Floor, LayerRole, MapDocument, RowSpec } from './types';

/**
 * Quick lot builder: a manager answers four questions and gets a complete,
 * editable map (numbered rows, drive lanes, entrance/exit, ramps and stairs
 * between levels) instead of drawing every row by hand.
 */
export interface QuickLotSpec {
  floors: number;
  rows: number;
  spacesPerRow: number;
  /** Accessible spaces at the start of row A on the ground floor. */
  accessible: number;
}

export const QUICK_LOT_DEFAULTS: QuickLotSpec = { floors: 1, rows: 4, spacesPerRow: 12, accessible: 2 };

export const QUICK_LOT_LIMITS = {
  floors: { min: 1, max: 12 },
  rows: { min: 1, max: 26 },
  spacesPerRow: { min: 1, max: 80 },
  accessible: { min: 0, max: 20 },
} as const;

const LANE = 110;

export function clampQuickLot(spec: QuickLotSpec): QuickLotSpec {
  const c = (k: keyof QuickLotSpec) => {
    const { min, max } = QUICK_LOT_LIMITS[k];
    const v = Math.round(Number(spec[k]));
    return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : QUICK_LOT_DEFAULTS[k];
  };
  const s = { floors: c('floors'), rows: c('rows'), spacesPerRow: c('spacesPerRow'), accessible: c('accessible') };
  s.accessible = Math.min(s.accessible, s.spacesPerRow);
  return s;
}

export const quickLotTotal = (spec: QuickLotSpec) => {
  const s = clampQuickLot(spec);
  return s.floors * s.rows * s.spacesPerRow;
};

/** Row letters A..Z; on multi-level garages the level number leads: 2B14. */
export const rowPrefix = (floorIndex: number, row: number, floors: number) =>
  `${floors > 1 ? floorIndex + 1 : ''}${String.fromCharCode(65 + row)}`;

const layerFor = (floor: Floor, role: LayerRole) => floor.layers.find((l) => l.role === role)!.id;

function asset(floor: Floor, key: string, x: number, y: number, name: string, extra: Partial<AssetObject> = {}): AssetObject {
  const def = ASSET_BY_KEY[key];
  return {
    id: newId('as'), kind: 'asset', assetKey: key, layerId: layerFor(floor, def.layer),
    x, y, width: def.width, height: def.height, rotation: 0, name, ...extra,
  };
}

/**
 * Lays out one level: rows run left to right, every drive lane is shared by
 * the two rows facing it, and rows between lanes sit back to back. A
 * vertical lane on the left joins all aisles to the entrance.
 */
function buildLevel(floor: Floor, index: number, spec: QuickLotSpec): void {
  const w = DEFAULT_ROW.spaceWidth;
  const d = DEFAULT_ROW.spaceDepth;
  const rowLength = spec.spacesPerRow * w;
  const spacesLayer = layerFor(floor, 'spaces');
  let y = 0;
  let lane = 0;
  const lanes: AssetObject[] = [];
  for (let r = 0; r < spec.rows; r++) {
    const row: RowSpec = { ...DEFAULT_ROW, id: newId('row'), count: spec.spacesPerRow, prefix: rowPrefix(index, r, spec.floors) };
    floor.rows[row.id] = row;
    const spaces = buildRowSpaces(row, { x: w / 2, y: y + d / 2, rotation: 0 }, spacesLayer);
    if (index === 0 && r === 0) spaces.slice(0, spec.accessible).forEach((s) => (s.accessible = true));
    floor.objects.push(...spaces);
    y += d;
    // Rows A, C, E… face a lane below them; B, D, F… face the lane above.
    if (r % 2 === 0) {
      lanes.push(asset(floor, 'road', rowLength / 2, y + LANE / 2, `Drive lane ${++lane}`, { width: rowLength, height: LANE }));
      y += LANE;
    }
  }
  const top = 0;
  const bottom = y;
  const left = -LANE / 2;
  lanes.unshift(asset(floor, 'road', left, (top + bottom) / 2, 'Main drive lane', { width: bottom - top, height: LANE, rotation: 90 }));
  floor.objects.unshift(...lanes);

  const firstLaneY = lanes[1]?.y ?? (top + bottom) / 2;
  if (index === 0) {
    floor.objects.push(asset(floor, 'entrance', left, bottom + 40, 'Entrance'));
    floor.objects.push(asset(floor, 'exit', left, top - 40, 'Exit'));
  }
  if (spec.floors > 1) {
    const ramp = ASSET_BY_KEY.ramp;
    floor.objects.push(asset(floor, 'ramp', rowLength + ramp.width / 2 + 20, firstLaneY, `Ramp ${index + 1}`));
    floor.objects.push(asset(floor, 'stairs', left - LANE / 2 - 40, firstLaneY - 30, 'Stairway 1'));
    floor.objects.push(asset(floor, 'elevator', left - LANE / 2 - 40, firstLaneY + 30, 'Elevator 1'));
  }
}

export function createQuickLot(name: string, input: QuickLotSpec): MapDocument {
  const spec = clampQuickLot(input);
  const doc = createMap(name);
  doc.floors = Array.from({ length: spec.floors }, (_, i) => createFloor(`Floor ${i + 1}`));
  doc.floors.forEach((f, i) => buildLevel(f, i, spec));
  // Floor connectors know which levels they reach, so the viewer can say "Goes to Floor 2".
  doc.floors.forEach((f, i) => {
    const near = [doc.floors[i - 1]?.id, doc.floors[i + 1]?.id].filter((x): x is string => !!x);
    for (const o of f.objects) if (o.kind === 'asset' && ASSET_BY_KEY[o.assetKey]?.connector) o.connectsTo = near;
  });
  return doc;
}
