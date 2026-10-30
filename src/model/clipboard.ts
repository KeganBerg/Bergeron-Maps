import { newId } from './ids';
import { objectBox, unionBoxes } from './geometry';
import { labelKey } from './duplicates';
import { renumberSequential } from './numbering';
import type { Box, Floor, Layer, MapObject, RowSpec } from './types';

export interface ClipboardData {
  objects: MapObject[];
  rows: Record<string, RowSpec>;
  /** Layers the objects came from, so pasting onto another floor keeps organization. */
  layers: Layer[];
  box: Box;
}

const clone = <T>(v: T): T => structuredClone(v);

export function copySelection(floor: Floor, ids: Iterable<string>): ClipboardData | null {
  const set = new Set(ids);
  const objects = floor.objects.filter((o) => set.has(o.id)).map(clone);
  if (objects.length === 0) return null;
  const rows: Record<string, RowSpec> = {};
  for (const o of objects) if (o.kind === 'space' && o.rowId && floor.rows[o.rowId]) rows[o.rowId] = clone(floor.rows[o.rowId]);
  const layerIds = new Set(objects.map((o) => o.layerId));
  return {
    objects,
    rows,
    layers: floor.layers.filter((l) => layerIds.has(l.id)).map(clone),
    box: unionBoxes(objects.map(objectBox))!,
  };
}

export interface PasteResult {
  objects: MapObject[];
  rows: Record<string, RowSpec>;
  /** Ids of pasted spaces whose identifiers already exist on the target floor. */
  duplicateIds: string[];
}

/**
 * Creates fresh copies of clipboard contents for `floor`. Originals are never
 * touched. Rows are re-created with new row ids so the copy is an independent
 * row. Objects keep their relative positions, rotation, size and styling and
 * are shifted by (dx, dy).
 */
export function preparePaste(
  floor: Floor,
  clip: ClipboardData,
  dx: number,
  dy: number,
  fallbackLayerId: (o: MapObject) => string,
): PasteResult {
  const rowMap = new Map<string, string>();
  const rows: Record<string, RowSpec> = {};
  for (const [oldId, spec] of Object.entries(clip.rows)) {
    const id = newId('row');
    rowMap.set(oldId, id);
    rows[id] = { ...clone(spec), id };
  }
  const layerFor = (o: MapObject): string => {
    const usable = (l: Layer | undefined) => l && !l.locked && l.role !== 'background';
    const direct = floor.layers.find((l) => l.id === o.layerId);
    if (usable(direct)) return direct!.id;
    const src = clip.layers.find((l) => l.id === o.layerId);
    if (src) {
      const byName = floor.layers.find((l) => l.name === src.name && usable(l));
      if (byName) return byName.id;
      const byRole = src.role && floor.layers.find((l) => l.role === src.role && usable(l));
      if (byRole) return byRole.id;
    }
    return fallbackLayerId(o);
  };

  const existing = new Set(floor.objects.filter((o) => o.kind === 'space').map((o) => labelKey((o as { label: string }).label)));
  const duplicateIds: string[] = [];
  const objects = clip.objects.map((src) => {
    const o = clone(src);
    o.id = newId(o.kind === 'space' ? 'sp' : o.kind === 'asset' ? 'as' : 'tx');
    o.x += dx;
    o.y += dy;
    o.layerId = layerFor(src);
    if (o.kind === 'space') {
      if (o.rowId) o.rowId = rowMap.get(o.rowId);
      if (!o.rowId) delete o.rowIndex;
      if (existing.has(labelKey(o.label))) duplicateIds.push(o.id);
    }
    return o;
  });
  return { objects, rows, duplicateIds };
}

/**
 * Gives the given spaces new sequential identifiers that do not clash with any
 * other space on the floor (e.g. a pasted copy of A1–A10 becomes A11–A20).
 * Spaces in the same row keep row order. Mutates `floor`; also updates the row
 * numbering settings so later row edits continue the new sequence.
 */
export function renumberSpaces(floor: Floor, ids: string[]): void {
  const set = new Set(ids);
  const targets = floor.objects.filter((o) => set.has(o.id) && o.kind === 'space') as Extract<MapObject, { kind: 'space' }>[];
  const others = floor.objects
    .filter((o) => o.kind === 'space' && !set.has(o.id))
    .map((o) => (o as { label: string }).label.trim());
  // Group by row (in z-order of first appearance), then by visual numbering
  // order within each row (reverse rows count down).
  const groups = new Map<string, typeof targets>();
  for (const t of targets) {
    const key = t.rowId ?? `single:${t.id}`;
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }
  const ordered = [...groups.values()].flatMap((g) => {
    const spec = g[0].rowId ? floor.rows[g[0].rowId] : undefined;
    return [...g].sort((a, b) => ((a.rowIndex ?? 0) - (b.rowIndex ?? 0)) * (spec?.reverse ? -1 : 1));
  });
  const fresh = renumberSequential(ordered.map((s) => s.label.trim()), others);
  ordered.forEach((s, i) => (s.label = fresh[i]));
  // Keep row specs in sync where a whole row was renumbered.
  for (const rowId of new Set(ordered.map((s) => s.rowId).filter(Boolean) as string[])) {
    const spec = floor.rows[rowId];
    const inRow = ordered.filter((s) => s.rowId === rowId);
    if (!spec || inRow.length !== spec.count) continue;
    const firstVisual = inRow[0];
    const m = /^(.*?)(\d+)(\D*)$/.exec(firstVisual.label);
    if (m) Object.assign(spec, { prefix: m[1], start: parseInt(m[2], 10), digits: m[2].length, suffix: m[3] });
  }
}
