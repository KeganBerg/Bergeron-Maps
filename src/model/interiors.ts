import { createFloor } from './factory';
import { newId } from './ids';
import type { AssetObject, Floor, MapDocument } from './types';

/**
 * Building interiors. A building or room on the site map can have its own
 * floor plan: one or more floors stored in the same map document, each marked
 * with `interiorOf` = the building object's id. Keeping them in the same
 * document means an interior is saved, versioned, published and counted in the
 * site's map slots together with its parent map.
 *
 * Only site floors (floors that are not themselves interiors) have enterable
 * buildings, so interiors are one level deep.
 */

/** The site map's own floors, in order. */
export const siteFloors = (doc: MapDocument): Floor[] => doc.floors.filter((f) => !f.interiorOf);

/** The floors inside one building, in order. */
export const interiorFloors = (doc: MapDocument, buildingId: string): Floor[] => doc.floors.filter((f) => f.interiorOf === buildingId);

export const hasInterior = (doc: MapDocument, buildingId: string) => doc.floors.some((f) => f.interiorOf === buildingId);

/** The floors shown side by side with `floor`: its building's floors, or the site floors. */
export const floorGroup = (doc: MapDocument, floor: Floor): Floor[] =>
  floor.interiorOf ? interiorFloors(doc, floor.interiorOf) : siteFloors(doc);

/** For an interior floor: the building it belongs to and the site floor that building sits on. */
export function buildingOf(doc: MapDocument, floor: Floor): { building: AssetObject; floor: Floor } | null {
  if (!floor.interiorOf) return null;
  for (const f of doc.floors) {
    if (f.interiorOf) continue;
    const o = f.objects.find((x) => x.id === floor.interiorOf);
    if (o?.kind === 'asset') return { building: o, floor: f };
  }
  return null;
}

/** The name people know a building by. */
export const buildingName = (b: AssetObject, fallback = 'Building') => b.name?.trim() || b.label?.trim() || fallback;

/** "Service department · Floor 1" for interior floors, just the floor name otherwise. */
export function floorTitle(doc: MapDocument, floor: Floor): string {
  const b = buildingOf(doc, floor);
  if (!b) return floor.name;
  const n = interiorFloors(doc, b.building.id).length;
  return n > 1 ? `${buildingName(b.building)} · ${floor.name}` : buildingName(b.building);
}

/** Next free "Floor N" inside one building. */
export function nextInteriorFloorName(doc: MapDocument, buildingId: string): string {
  const floors = interiorFloors(doc, buildingId);
  const taken = new Set(floors.map((f) => f.name.trim().toLowerCase()));
  let n = floors.length + 1;
  while (taken.has(`floor ${n}`)) n++;
  return `Floor ${n}`;
}

/** The shortest side a new interior's outer walls get, so there is room to lay out offices. */
const MIN_SHELL = 500;

/**
 * A new interior floor for `building`, with outer walls in the building's
 * shape already placed so people start inside the right outline.
 */
export function createInteriorFloor(doc: MapDocument, building: AssetObject, name = nextInteriorFloorName(doc, building.id)): Floor {
  const floor = createFloor(name);
  floor.interiorOf = building.id;
  const k = Math.max(1, MIN_SHELL / Math.max(1, Math.min(building.width, building.height)));
  const w = Math.round((building.width * k) / 10) * 10;
  const h = Math.round((building.height * k) / 10) * 10;
  const structure = floor.layers.find((l) => l.role === 'structure')!;
  floor.objects.push({
    id: newId('as'),
    kind: 'asset',
    assetKey: 'outer-walls',
    layerId: structure.id,
    x: w / 2,
    y: h / 2,
    width: w,
    height: h,
    rotation: 0,
    name: 'Outer walls',
  });
  return floor;
}

/** Interior floors whose building no longer exists. */
export function orphanInteriors(doc: MapDocument): Floor[] {
  const ids = new Set<string>();
  for (const f of doc.floors) if (!f.interiorOf) for (const o of f.objects) ids.add(o.id);
  return doc.floors.filter((f) => f.interiorOf && !ids.has(f.interiorOf));
}

/**
 * Keeps a document's interiors consistent. Mutates `doc`.
 * - An interior whose building is gone becomes an ordinary floor (named after
 *   what it was), so nothing is ever lost.
 * - A map always keeps at least one site floor.
 */
export function repairInteriors(doc: MapDocument): void {
  for (const f of orphanInteriors(doc)) delete f.interiorOf;
  if (!doc.floors.some((f) => !f.interiorOf) && doc.floors[0]) delete doc.floors[0].interiorOf;
}

/** Interior floors to remove when the given objects are deleted from a site floor. */
export const interiorsOfObjects = (doc: MapDocument, ids: Iterable<string>): string[] => {
  const set = new Set(ids);
  return doc.floors.filter((f) => f.interiorOf && set.has(f.interiorOf)).map((f) => f.id);
};

/**
 * Copies every interior of the buildings in `idMap` (old object id -> new
 * object id) so duplicated buildings bring their floor plans with them.
 */
export function copyInteriors(doc: MapDocument, idMap: Map<string, string>, duplicate: (f: Floor, name: string) => Floor): Floor[] {
  const out: Floor[] = [];
  for (const f of doc.floors) {
    const to = f.interiorOf && idMap.get(f.interiorOf);
    if (!to) continue;
    const copy = duplicate(f, f.name);
    copy.interiorOf = to;
    out.push(copy);
  }
  return out;
}
