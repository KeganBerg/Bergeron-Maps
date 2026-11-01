import { newId } from './ids';
import type { Floor, MapDocument } from './types';

/**
 * Deep copy of a floor with all-new ids (floor, layers, objects, rows) so later
 * edits to the copy can never affect the original.
 */
export function duplicateFloor(floor: Floor, name: string): Floor {
  const copy: Floor = structuredClone(floor);
  copy.id = newId('fl');
  copy.name = name;
  const layerMap = new Map<string, string>();
  copy.layers = copy.layers.map((l) => {
    const id = newId('ly');
    layerMap.set(l.id, id);
    return { ...l, id };
  });
  const rowMap = new Map<string, string>();
  const rows: Floor['rows'] = {};
  for (const [oldId, spec] of Object.entries(copy.rows)) {
    const id = newId('row');
    rowMap.set(oldId, id);
    rows[id] = { ...spec, id };
  }
  copy.rows = rows;
  copy.objects = copy.objects.map((o) => {
    const n = { ...o, id: newId(o.kind === 'space' ? 'sp' : o.kind === 'asset' ? 'as' : 'tx'), layerId: layerMap.get(o.layerId) ?? o.layerId };
    if (n.kind === 'space' && n.rowId) n.rowId = rowMap.get(n.rowId);
    return n;
  });
  if (copy.background) copy.background.layerId = layerMap.get(copy.background.layerId) ?? copy.background.layerId;
  return copy;
}

/** "Floor 2 (copy)", "Floor 2 (copy 2)", ... */
export function copyName(doc: MapDocument, base: string): string {
  const names = new Set(doc.floors.map((f) => f.name));
  let name = `${base} (copy)`;
  for (let i = 2; names.has(name); i++) name = `${base} (copy ${i})`;
  return name;
}

/** Removes references to a deleted floor from floor connections. Mutates `doc`. */
export function removeFloorReferences(doc: MapDocument, floorId: string): void {
  for (const f of doc.floors)
    for (const o of f.objects)
      if (o.kind === 'asset' && o.connectsTo) o.connectsTo = o.connectsTo.filter((id) => id !== floorId);
}
