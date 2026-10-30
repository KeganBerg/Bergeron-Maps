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
  const pitch = spec.spaceWidth + spec.gap;
  return labels.map((label, i) => {
    const off = rotatePoint(i * pitch, 0, anchor.rotation);
    return {
      id: newId('sp'),
      kind: 'space',
      layerId,
      x: anchor.x + off.x,
      y: anchor.y + off.y,
      width: spec.spaceWidth,
      height: spec.spaceDepth,
      rotation: anchor.rotation,
      label,
      rowId: spec.id,
      rowIndex: i,
      labelPlacement: spec.labelPlacement,
      fill,
    };
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
  built.forEach((s, i) => {
    const prev = existing[i];
    if (prev) {
      s.id = prev.id;
      s.fill = prev.fill;
      s.accessible = prev.accessible;
      s.layerId = prev.layerId;
    }
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
