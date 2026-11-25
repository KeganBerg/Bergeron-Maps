import { ASSET_BY_KEY } from '../assets/library';
import { startPlaces } from './route';
import type { Floor, MapDocument, MapObject } from './types';
import { ENGLISH, type MapWords, symbolName } from './words';

export interface ListingGroup {
  title: string;
  items: { object: MapObject; title: string; detail?: string }[];
}

const byLabel = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });
const label = (o: MapObject) => (o.kind === 'space' ? o.label : '');

/**
 * Everything on a floor that someone might look for, as a text list: the floor's
 * places (entrances, elevators, stairs, anything with a name) and then its spaces,
 * one group per row. It is the map for someone who can't see the drawing.
 */
export function floorListing(doc: MapDocument, floor: Floor, words: MapWords = ENGLISH): ListingGroup[] {
  const hidden = new Set(floor.layers.filter((l) => !l.visible).map((l) => l.id));
  const shown = (o: MapObject) => !o.hidden && !hidden.has(o.layerId);

  const useful = new Set(startPlaces(doc, words).filter((p) => p.floor.id === floor.id).map((p) => p.obj.id));
  const places: ListingGroup['items'] = [];
  for (const o of floor.objects) {
    if (o.kind !== 'asset' || !shown(o)) continue;
    const def = ASSET_BY_KEY[o.assetKey];
    const named = (o.name ?? '').trim() || (o.label ?? '').trim();
    // Driving lanes, roads and paint are part of the drawing, not somewhere to go.
    if (!useful.has(o.id) && (!named || /road|lane|drive|line|stripe|curb|grass|hedge|zone|area|arrow|crosswalk/.test(o.assetKey))) continue;
    const kind = symbolName(o.assetKey, words);
    const title = named || kind || words.place;
    const to = (o.connectsTo ?? []).map((id) => doc.floors.find((f) => f.id === id)?.name).filter(Boolean);
    const detail = words.parts([def && kind !== title && kind, to.length > 0 && words.goesTo(words.list(to))]);
    places.push({ object: o, title, detail: detail || undefined });
  }
  places.sort((a, b) => byLabel(a.title, b.title));

  // Spaces, grouped by the row they were drawn in. Loose spaces share one group.
  const rows = new Map<string, ListingGroup['items']>();
  for (const o of floor.objects) {
    if (o.kind !== 'space' || !shown(o) || !o.label.trim()) continue;
    const key = o.rowId ?? '';
    if (!rows.has(key)) rows.set(key, []);
    rows.get(key)!.push({ object: o, title: words.space(o.label), detail: o.accessible ? words.accessible : undefined });
  }
  const spaceGroups: ListingGroup[] = [...rows.entries()].map(([key, items]) => {
    items.sort((a, b) => byLabel(label(a.object), label(b.object)));
    const first = label(items[0].object);
    const last = label(items[items.length - 1].object);
    return { title: key ? words.row(first, last) : words.otherSpaces(first, last), items };
  });
  spaceGroups.sort((a, b) => byLabel(label(a.items[0].object), label(b.items[0].object)));

  return [...(places.length ? [{ title: words.places, items: places }] : []), ...spaceGroups];
}
