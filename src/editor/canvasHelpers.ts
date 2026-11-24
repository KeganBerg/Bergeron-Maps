/** Small pure helpers for the editor's map (CanvasStage and its pointer handlers). */
import { angledSpecFrom, DEFAULT_ROW } from '../model/rows';
import type { Floor, MapObject } from '../model/types';

export function rowPreview(d: { a: { x: number; y: number }; b: { x: number; y: number } }) {
  const len = Math.hypot(d.b.x - d.a.x, d.b.y - d.a.y);
  return { count: Math.max(1, Math.round(len / (DEFAULT_ROW.spaceWidth + DEFAULT_ROW.gap))) };
}

export function chipForMany(floor: Floor, objs: MapObject[]): string {
  const rowIds = new Set(objs.map((o) => (o.kind === 'space' ? o.rowId : undefined)));
  if (rowIds.size === 1 && !rowIds.has(undefined)) {
    const spaces = objs as Extract<MapObject, { kind: 'space' }>[];
    const sorted = [...spaces].sort((a, b) => (a.rowIndex ?? 0) - (b.rowIndex ?? 0));
    const spec = floor.rows[sorted[0].rowId!];
    if (spec && spaces.length === spec.count) return `Row ${sorted[0].label} to ${sorted[sorted.length - 1].label} (${spaces.length} spaces)`;
  }
  return `${objs.length} selected`;
}

/** After resizing/rotating a whole row, keep its saved settings in step with what is drawn. */
export function syncRowSpecs(f: Floor, updates: Map<string, { width: number; height: number; x: number; y: number }>) {
  for (const spec of Object.values(f.rows)) {
    const spaces = f.objects
      .filter((o): o is Extract<MapObject, { kind: 'space' }> => o.kind === 'space' && o.rowId === spec.id)
      .sort((a, b) => (a.rowIndex ?? 0) - (b.rowIndex ?? 0));
    if (!spaces.length || !spaces.every((s) => updates.has(s.id))) continue;
    let along = spaces[0].width;
    if (spaces[0].variant === 'angled' && spaces[0].skew !== undefined) {
      const back = angledSpecFrom(spaces[0].width, spaces[0].height, spaces[0].skew);
      Object.assign(spec, { spaceWidth: back.spaceWidth, spaceDepth: back.spaceDepth, angle: back.angle });
      along = back.along;
    } else {
      spec.spaceWidth = Math.round(spaces[0].width * 10) / 10;
      spec.spaceDepth = Math.round(spaces[0].height * 10) / 10;
    }
    if (spaces.length > 1) {
      const d = Math.hypot(spaces[1].x - spaces[0].x, spaces[1].y - spaces[0].y);
      spec.gap = Math.max(0, Math.round((d - along) * 10) / 10);
    }
  }
}
