import { ASSET_BY_KEY } from '../assets/library';
import { startPlaces } from './route';
import type { Floor, MapDocument, MapObject } from './types';

export interface ListingGroup {
  title: string;
  items: { object: MapObject; title: string; detail?: string }[];
}

const byLabel = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });

/**
 * Everything on a floor that someone might look for, as a text list: the floor's
 * places (entrances, elevators, stairs, anything with a name) and then its spaces,
 * one group per row. It is the map for someone who can't see the drawing.
 */
export function floorListing(doc: MapDocument, floor: Floor): ListingGroup[] {
  const hidden = new Set(floor.layers.filter((l) => !l.visible).map((l) => l.id));
  const shown = (o: MapObject) => !o.hidden && !hidden.has(o.layerId);

  const useful = new Set(startPlaces(doc).filter((p) => p.floor.id === floor.id).map((p) => p.obj.id));
  const places: ListingGroup['items'] = [];
  for (const o of floor.objects) {
    if (o.kind !== 'asset' || !shown(o)) continue;
    const def = ASSET_BY_KEY[o.assetKey];
    const named = (o.name ?? '').trim() || (o.label ?? '').trim();
    // Driving lanes, roads and paint are part of the drawing, not somewhere to go.
    if (!useful.has(o.id) && (!named || /road|lane|drive|line|stripe|curb|grass|hedge|zone|area|arrow|crosswalk/.test(o.assetKey))) continue;
    const title = named || def?.name || 'Place';
    const to = (o.connectsTo ?? []).map((id) => doc.floors.find((f) => f.id === id)?.name).filter(Boolean);
    const detail = [def && def.name !== title ? def.name : null, to.length ? `Goes to ${to.join(', ')}` : null].filter(Boolean).join(', ');
    places.push({ object: o, title, detail: detail || undefined });
  }
  places.sort((a, b) => byLabel(a.title, b.title));

  // Spaces, grouped by the row they were drawn in. Loose spaces share one group.
  const rows = new Map<string, ListingGroup['items']>();
  for (const o of floor.objects) {
    if (o.kind !== 'space' || !shown(o) || !o.label.trim()) continue;
    const key = o.rowId ?? '';
    if (!rows.has(key)) rows.set(key, []);
    rows.get(key)!.push({ object: o, title: `Space ${o.label}`, detail: o.accessible ? 'Accessible' : undefined });
  }
  const spaceGroups: ListingGroup[] = [...rows.entries()].map(([key, items]) => {
    items.sort((a, b) => byLabel(a.title, b.title));
    const first = items[0].title.slice(6);
    const last = items[items.length - 1].title.slice(6);
    const span = items.length === 1 ? first : `${first} to ${last}`;
    return { title: key ? `Row: spaces ${span}` : `Other spaces: ${span}`, items };
  });
  spaceGroups.sort((a, b) => byLabel(a.items[0].title, b.items[0].title));

  return [...(places.length ? [{ title: 'Places', items: places }] : []), ...spaceGroups];
}
