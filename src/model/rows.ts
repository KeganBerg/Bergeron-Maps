import { newId } from './ids';
import { rotatePoint } from './geometry';
import { rowLabels } from './numbering';
import type { Floor, RowSpec, SpaceObject } from './types';

export const DEFAULT_ROW: Omit<RowSpec, 'id'> = {
  count: 10,
  start: 1,
  prefix: '',
  suffix: '',
  digits: 1,
  spaceWidth: 45,
  spaceDepth: 90,
  gap: 0,
  reverse: false,
  labelPlacement: 'center',
};

export const SPACE_FILL = '#ffffff';

/** Straight rows have square stalls; anything under this many degrees is drawn angled. */
const STRAIGHT = 89.5;

/** The row's stall angle in degrees, kept to a sensible range (90 = straight). */
export const rowAngle = (spec: Pick<RowSpec, 'angle'>) => {
  const a = Number(spec.angle);
  return Number.isFinite(a) && a > 0 && a < STRAIGHT ? Math.max(20, a) : 90;
};

/**
 * Shape of each space in a row. `spaceWidth` is the stall width measured
 * square to the painted lines, so angled stalls take more room along the row
 * (`along`), and lean sideways by `skew` over their depth.
 */
export function rowGeometry(spec: Pick<RowSpec, 'spaceWidth' | 'spaceDepth' | 'gap' | 'angle' | 'lean'>) {
  const a = rowAngle(spec);
  if (a === 90) return { angled: false, along: spec.spaceWidth, skew: 0, width: spec.spaceWidth, pitch: spec.spaceWidth + spec.gap };
  const r = (a * Math.PI) / 180;
  const along = spec.spaceWidth / Math.sin(r);
  const k = spec.spaceDepth / Math.tan(r);
  const skew = spec.lean === 'left' ? -k : k;
  const round = (n: number) => Math.round(n * 100) / 100;
  return { angled: true, along: round(along), skew: round(skew), width: round(along + k), pitch: round(along) + spec.gap };
}

/**
 * Reads a row's settings back from a drawn angled space (after it was resized):
 * stall width, depth and angle.
 */
export function angledSpecFrom(width: number, height: number, skew: number) {
  const k = Math.abs(skew);
  const along = Math.max(1, width - k);
  const angle = k < 0.01 ? 90 : (Math.atan2(height, k) * 180) / Math.PI;
  const r = (angle * Math.PI) / 180;
  return { spaceWidth: Math.round(along * Math.sin(r) * 10) / 10, spaceDepth: Math.round(height * 10) / 10, angle: Math.round(angle * 10) / 10, along };
}

/** Anchor of a row = center of its first space + the row's rotation. */
export interface RowAnchor {
  x: number;
  y: number;
  rotation: number;
}

/**
 * Builds the spaces of a row. Spaces run along the row's local x-axis
 * (rotated by `anchor.rotation`), starting with the space centered on the anchor.
 */
export function buildRowSpaces(spec: RowSpec, anchor: RowAnchor, layerId: string, fill = SPACE_FILL): SpaceObject[] {
  const labels = rowLabels(spec);
  const g = rowGeometry(spec);
  return labels.map((label, i) => {
    const off = rotatePoint(i * g.pitch, 0, anchor.rotation);
    const s: SpaceObject = {
      id: newId('sp'),
      kind: 'space',
      layerId,
      x: anchor.x + off.x,
      y: anchor.y + off.y,
      width: g.width,
      height: spec.spaceDepth,
      rotation: anchor.rotation,
      label,
      rowId: spec.id,
      rowIndex: i,
      labelPlacement: spec.labelPlacement,
      fill,
    };
    if (g.angled) {
      s.variant = 'angled';
      s.skew = g.skew;
    }
    return s;
  });
}

export function rowSpaces(floor: Floor, rowId: string): SpaceObject[] {
  return floor.objects
    .filter((o): o is SpaceObject => o.kind === 'space' && o.rowId === rowId)
    .sort((a, b) => (a.rowIndex ?? 0) - (b.rowIndex ?? 0));
}

/**
 * Rebuilds a row in place after its settings change (count, numbering,
 * spacing, size, direction). The first space stays where it is, so a row that
 * was moved or rotated keeps its position. Existing space ids, layer and fill
 * are reused where possible so selection and styling survive. Mutates `floor`
 * (call inside an immer recipe). Returns the ids of the row's spaces.
 */
export function regenerateRow(floor: Floor, rowId: string, patch: Partial<Omit<RowSpec, 'id'>>): string[] {
  const spec = floor.rows[rowId];
  if (!spec) return [];
  const existing = rowSpaces(floor, rowId);
  const first = existing[0];
  const next: RowSpec = { ...spec, ...patch, count: Math.max(1, Math.min(500, Math.round(patch.count ?? spec.count))) };
  floor.rows[rowId] = next;
  if (!first) return [];
  const anchor = { x: first.x, y: first.y, rotation: first.rotation };
  const built = buildRowSpaces(next, anchor, first.layerId, first.fill);
  // Settings people make on spaces (type, look, number size) carry over,
  // including to spaces added at the end of the row.
  built.forEach((s, i) => {
    const prev = existing[i];
    const like = prev ?? existing[existing.length - 1];
    if (prev) {
      s.id = prev.id;
      s.fill = prev.fill;
      s.accessible = prev.accessible;
      s.layerId = prev.layerId;
      if (!s.skew && prev.variant && prev.variant !== 'angled') s.variant = prev.variant;
      for (const k of ['hidden', 'locked', 'name'] as const) if (prev[k] !== undefined) (s as unknown as Record<string, unknown>)[k] = prev[k];
    }
    for (const k of ['stroke', 'strokeWidth', 'fillOpacity', 'labelScale'] as const) if (like[k] !== undefined) (s as unknown as Record<string, unknown>)[k] = like[k];
  });
  // Replace the old spaces at the position of the first one in z-order.
  const firstIdx = floor.objects.findIndex((o) => o.id === first.id);
  const kept = floor.objects.filter((o) => !(o.kind === 'space' && o.rowId === rowId));
  const insertAt = Math.min(firstIdx, kept.length);
  kept.splice(insertAt, 0, ...built);
  floor.objects = kept;
  return built.map((s) => s.id);
}

/**
 * Keeps row bookkeeping consistent after spaces are deleted or pasted:
 * drops rows with no spaces left, re-indexes the remaining spaces in order,
 * and updates each row's count. Labels are left untouched. Mutates `floor`.
 */
export function normalizeRows(floor: Floor): void {
  const byRow = new Map<string, SpaceObject[]>();
  for (const o of floor.objects) {
    if (o.kind !== 'space' || !o.rowId) continue;
    if (!floor.rows[o.rowId]) {
      delete o.rowId;
      delete o.rowIndex;
      continue;
    }
    const list = byRow.get(o.rowId) ?? [];
    list.push(o);
    byRow.set(o.rowId, list);
  }
  for (const id of Object.keys(floor.rows)) {
    const list = byRow.get(id);
    if (!list) {
      delete floor.rows[id];
      continue;
    }
    list.sort((a, b) => (a.rowIndex ?? 0) - (b.rowIndex ?? 0)).forEach((s, i) => (s.rowIndex = i));
    floor.rows[id].count = list.length;
  }
}
