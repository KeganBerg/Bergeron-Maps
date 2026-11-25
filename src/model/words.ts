import { ASSET_BY_KEY } from '../assets/library';

/**
 * The words that map logic puts into what people read: "Space B4", "Walk to
 * Elevator 1", "Row: spaces A1 to A9". The functions that build those
 * (route.ts, listing.ts, search.ts) take a MapWords, English by default, so
 * the viewer can pass the reader's language (src/i18n). Names a manager typed
 * on the map are never translated: only the words around them.
 */
export type Way = 'up' | 'down' | 'across';

export interface MapWords {
  /** "Space B4". */
  space: (label: string) => string;
  /** A space with no number yet. */
  noNumber: string;
  /** Where a route starts when someone tapped open ground. */
  spot: string;
  /** A symbol's name in this language, or undefined to use the catalog's English name. */
  symbol: (assetKey: string) => string | undefined;
  /** A place with no name and no known kind. */
  place: string;
  accessible: string;
  /** "Goes to Floor 2, Floor 3" (the floor names are already joined with commas). */
  goesTo: (floors: string) => string;
  walkTo: (place: string) => string;
  goInside: (building: string) => string;
  leave: (building: string) => string;
  /** "Take Up ramp to F3", when the name already says where it goes. */
  take: (name: string) => string;
  takeTo: (name: string, way: Way, floor: string) => string;
  /** The tag on the map where the route changes floor: "Up to Floor 3". */
  wayTo: (way: Way, floor: string) => string;
  /** The floor list's group headings. */
  places: string;
  row: (first: string, last: string) => string;
  otherSpaces: (first: string, last: string) => string;
}

const span = (first: string, last: string) => (first === last ? first : `${first} to ${last}`);
const WAY: Record<Way, string> = { up: 'up', down: 'down', across: 'across' };

export const ENGLISH: MapWords = {
  space: (label) => `Space ${label}`,
  noNumber: '(no number)',
  spot: 'the spot you picked',
  symbol: () => undefined,
  place: 'Place',
  accessible: 'Accessible',
  goesTo: (floors) => `Goes to ${floors}`,
  walkTo: (place) => `Walk to ${place}`,
  goInside: (building) => `Go inside ${building}`,
  leave: (building) => `Leave ${building}`,
  take: (name) => `Take ${name}`,
  takeTo: (name, way, floor) => `Take ${name} ${WAY[way]} to ${floor}`,
  wayTo: (way, floor) => `${WAY[way][0].toUpperCase()}${WAY[way].slice(1)} to ${floor}`,
  places: 'Places',
  row: (first, last) => `Row: spaces ${span(first, last)}`,
  otherSpaces: (first, last) => `Other spaces: ${span(first, last)}`,
};

/** A symbol's name in the reader's language, falling back to the catalog's English. */
export const symbolName = (assetKey: string, words: MapWords): string | undefined =>
  words.symbol(assetKey) ?? ASSET_BY_KEY[assetKey]?.name;
