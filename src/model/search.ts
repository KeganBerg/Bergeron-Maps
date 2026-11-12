import { ASSET_BY_KEY } from '../assets/library';
import { floorTitle } from './interiors';
import type { MapDocument, MapObject } from './types';

export interface SearchHit {
  floorId: string;
  floorName: string;
  object: MapObject;
  title: string;
  exact: boolean;
}

/** "b-16", "B 16" and "B16" all match space B16. */
export const normalizeQuery = (s: string) => s.toUpperCase().replace(/[\s\-_.]/g, '');

const MAX_HITS = 30;

/**
 * Finds parking spaces by identifier (exact matches first, then identifiers that
 * start with the query) and landmarks by name or label, across every floor.
 * Hidden layers are skipped so viewers never land on something they can't see.
 */
export function searchMap(doc: MapDocument, query: string): SearchHit[] {
  const q = normalizeQuery(query);
  if (!q) return [];
  const words = query.toLowerCase().trim().split(/\s+/);
  const exact: SearchHit[] = [];
  const partial: SearchHit[] = [];
  for (const f of doc.floors) {
    const floorName = floorTitle(doc, f);
    const hidden = new Set(f.layers.filter((l) => !l.visible).map((l) => l.id));
    for (const o of f.objects) {
      if (hidden.has(o.layerId)) continue;
      if (o.kind === 'space') {
        const id = normalizeQuery(o.label);
        if (!id) continue;
        const hit = { floorId: f.id, floorName, object: o, title: `Space ${o.label}` };
        if (id === q) exact.push({ ...hit, exact: true });
        else if (id.startsWith(q)) partial.push({ ...hit, exact: false });
      } else {
        const name = o.kind === 'text' ? o.text : [o.name, o.label, ASSET_BY_KEY[o.assetKey]?.name].filter(Boolean).join(' ');
        const hay = name.toLowerCase();
        if (words.every((w) => hay.includes(w))) {
          const title = o.kind === 'text' ? o.text : o.name || o.label || ASSET_BY_KEY[o.assetKey]?.name || 'Object';
          const isExact = title.toLowerCase() === query.toLowerCase().trim();
          (isExact ? exact : partial).push({ floorId: f.id, floorName, object: o, title, exact: isExact });
        }
      }
    }
  }
  const byLabel = (a: SearchHit, b: SearchHit) => a.title.localeCompare(b.title, undefined, { numeric: true });
  return [...exact.sort(byLabel), ...partial.sort(byLabel)].slice(0, MAX_HITS);
}
