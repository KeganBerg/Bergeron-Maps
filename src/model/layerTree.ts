import type { Floor, MapObject, SpaceObject } from './types';

export type TreeItem =
  | { kind: 'obj'; key: string; o: MapObject; depth: 0 | 1; rowId?: string }
  | { kind: 'row'; key: string; rowId: string; ids: string[]; title: string; top: string; bottom: string; depth: 0 };

export type DropSpot = { key: string; side: 'above' | 'below' | 'into' };

/**
 * The rows of a layer's object list, top of the drawing first (like Figma or
 * Photoshop). Spaces made as a row are grouped under one "Row A1–A20" entry
 * so a layer with thousands of spaces stays short until a row is opened.
 */
export function layerItems(floor: Floor, layerId: string, openRows: ReadonlySet<string>): TreeItem[] {
  const objs = floor.objects.filter((o) => o.layerId === layerId).reverse();
  const members = new Map<string, SpaceObject[]>();
  for (const o of objs) {
    if (o.kind !== 'space' || !o.rowId || !floor.rows[o.rowId]) continue;
    const list = members.get(o.rowId);
    if (list) list.push(o);
    else members.set(o.rowId, [o]);
  }
  const items: TreeItem[] = [];
  const done = new Set<string>();
  for (const o of objs) {
    const rowId = o.kind === 'space' ? o.rowId : undefined;
    const group = rowId ? members.get(rowId) : undefined;
    // A single space left in a row isn't worth a group.
    if (!rowId || !group || group.length < 2) {
      items.push({ kind: 'obj', key: o.id, o, depth: 0 });
      continue;
    }
    if (done.has(rowId)) continue;
    done.add(rowId);
    const byNumber = [...group].sort((a, b) => (a.rowIndex ?? 0) - (b.rowIndex ?? 0));
    const first = byNumber[0].label || '?';
    const last = byNumber[byNumber.length - 1].label || '?';
    items.push({
      kind: 'row',
      key: `row:${rowId}`,
      rowId,
      ids: byNumber.map((s) => s.id),
      title: `Row ${first}–${last}`,
      top: group[0].id,
      bottom: group[group.length - 1].id,
      depth: 0,
    });
    if (openRows.has(rowId)) for (const s of byNumber) items.push({ kind: 'obj', key: s.id, o: s, depth: 1, rowId });
  }
  return items;
}

export const itemIds = (it: TreeItem): string[] => (it.kind === 'row' ? it.ids : [it.o.id]);

