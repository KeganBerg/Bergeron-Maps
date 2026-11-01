import type { Floor, MapDocument } from './types';

/** Normalized key so "b16", "B16 " and "B16" count as the same identifier. */
export const labelKey = (label: string) => label.trim().toUpperCase();

/** Ids of spaces on this floor whose identifier is shared with another space on the floor. */
export function duplicateSpaceIds(floor: Floor): Set<string> {
  const groups = new Map<string, string[]>();
  for (const o of floor.objects) {
    if (o.kind !== 'space') continue;
    const k = labelKey(o.label);
    if (!k) continue;
    const g = groups.get(k) ?? [];
    g.push(o.id);
    groups.set(k, g);
  }
  const out = new Set<string>();
  for (const ids of groups.values()) if (ids.length > 1) ids.forEach((id) => out.add(id));
  return out;
}

export interface DuplicateGroup {
  label: string;
  /** floor id -> number of spaces with this identifier on that floor */
  floors: { floorId: string; floorName: string; count: number }[];
}

/** Identifiers used more than once anywhere in the facility (across floors too). */
export function facilityDuplicates(doc: MapDocument): DuplicateGroup[] {
  const map = new Map<string, DuplicateGroup>();
  for (const f of doc.floors) {
    for (const o of f.objects) {
      if (o.kind !== 'space') continue;
      const k = labelKey(o.label);
      if (!k) continue;
      const g = map.get(k) ?? { label: o.label.trim(), floors: [] };
      const entry = g.floors.find((e) => e.floorId === f.id);
      if (entry) entry.count++;
      else g.floors.push({ floorId: f.id, floorName: f.name, count: 1 });
      map.set(k, g);
    }
  }
  return [...map.values()].filter((g) => g.floors.reduce((n, e) => n + e.count, 0) > 1);
}
