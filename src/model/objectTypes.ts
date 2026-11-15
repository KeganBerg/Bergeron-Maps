import { ASSET_BY_KEY } from '../assets/library';
import { SPACES } from '../assets/catalog/spaces';
import type { MapObject } from './types';

/**
 * What "the same type" means for Select all of this type: spaces by their marking
 * (every EV space), library objects by what they are (every column), text by being text.
 */
export function typeKey(o: MapObject): string {
  if (o.kind === 'space') return `space:${o.variant ?? (o.accessible ? 'accessible' : 'standard')}`;
  if (o.kind === 'text') return 'text';
  return o.imageSrc ? 'image' : `asset:${o.assetKey}`;
}

/** A plural name for the type, for menus: "EV charging spaces", "Columns", "Text labels". */
export function typePlural(o: MapObject): string {
  if (o.kind === 'space') {
    const v = o.variant ?? (o.accessible ? 'accessible' : 'standard');
    const name = SPACES.find((s) => s.variant === v)?.name ?? 'Parking space';
    return plural(name.replace(/ parking space$/, ' spaces').replace(/^Loading zone$/, 'Loading zones'));
  }
  if (o.kind === 'text') return 'Text labels';
  if (o.imageSrc) return 'Images';
  return plural(ASSET_BY_KEY[o.assetKey]?.name ?? 'Objects');
}

function plural(name: string): string {
  if (/s$/.test(name)) return name;
  if (/(ch|sh|x)$/.test(name)) return `${name}es`;
  if (/[^aeiou]y$/.test(name)) return `${name.slice(0, -1)}ies`;
  return `${name}s`;
}
