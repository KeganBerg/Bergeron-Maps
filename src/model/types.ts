/**
 * Map document model. One MapDocument is one facility map with any number of
 * floors. The same document drives the desktop editor and the viewer.
 *
 * Coordinates are world units (1 unit = 1 screen pixel at 100% zoom). Every
 * object's (x, y) is its CENTER, and rotation is in degrees around that center.
 */

export const SCHEMA_VERSION = 1;

export type LabelPlacement = 'center' | 'top' | 'bottom';

export type LayerRole = 'background' | 'structure' | 'spaces' | 'landmarks' | 'labels';

export interface Layer {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  /** Default layers carry a role so new objects can be routed automatically. */
  role?: LayerRole;
}

/**
 * Paint settings shared by every object that has a fill. All optional: when a
 * field is missing the object uses its library default (see docs/ASSET_STYLE.md).
 */
export interface ObjectStyle {
  /** Fill color as #rrggbb. */
  fill?: string;
  /** Fill opacity, 0 (clear) to 1 (solid). Applies to the fill only, not the border or text. */
  fillOpacity?: number;
  /** Border color as #rrggbb. */
  stroke?: string;
  /** Border thickness in map pixels. 0 hides the border. */
  strokeWidth?: number;
}

interface BaseObject extends ObjectStyle {
  id: string;
  layerId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  /** Human-readable identifier shown on click/tap, e.g. "Stairway 3". */
  name?: string;
  /** Corner curvature in map pixels (0 = square). Capped so thin pieces never vanish. */
  corner?: number;
  /** Cut the corners straight (a bevel) instead of rounding them. */
  bevel?: boolean;
  /** Cut-outs, each a flat [x0, y0, x1, y1, ...] ring in fractions (0..1) of width and height. */
  cuts?: number[][];
  /** Hidden from the editor canvas and the viewer (set from the Layers panel). */
  hidden?: boolean;
  /** Can't be selected or moved on the canvas until unlocked. */
  locked?: boolean;
}

/** Painted markings that tell drivers what a space is for. */
export type SpaceVariant =
  | 'standard'
  | 'compact'
  | 'oversized'
  | 'accessible'
  | 'reserved'
  | 'vip'
  | 'ev'
  | 'motorcycle'
  | 'loading'
  | 'no-parking'
  | 'angled'
  | 'parallel'
  | 'double';

export interface SpaceObject extends BaseObject {
  kind: 'space';
  /** Missing means 'standard' (or 'accessible' when `accessible` is set, for older maps). */
  variant?: SpaceVariant;
  /** The parking-space identifier, e.g. "B16". */
  label: string;
  rowId?: string;
  rowIndex?: number;
  labelPlacement: LabelPlacement;
  fill: string;
  accessible?: boolean;
}

export interface AssetObject extends BaseObject {
  kind: 'asset';
  assetKey: string;
  label?: string;
  /** Imported image assets keep their picture here as a data URL. */
  imageSrc?: string;
  /** For ramps, stairs, elevators and walkways: the floors this connects to. */
  connectsTo?: string[];
  /** A Material symbol chosen for this object, shown instead of its built-in one. */
  symbol?: { name: string; path: string };
  /** true = show no symbol at all (the label then centers). */
  symbolHidden?: boolean;
  /** Thickness of curved bands and L-shaped corner pieces. */
  band?: number;
  /** Landscape pieces merge with neighbours automatically; false keeps this one separate. */
  merge?: boolean;
  /** How close (map px) neighbours must be to flow together into one shape. */
  blend?: number;
}

export interface TextObject extends BaseObject {
  kind: 'text';
  text: string;
  fontSize: number;
  color: string;
}

export type MapObject = SpaceObject | AssetObject | TextObject;

/** Numbering and layout settings for a generated row of spaces. */
export interface RowSpec {
  id: string;
  count: number;
  start: number;
  prefix: string;
  suffix: string;
  /** Zero-pad numbers to this many digits (1 = no padding). */
  digits: number;
  spaceWidth: number;
  spaceDepth: number;
  gap: number;
  /** Number from the far end of the row instead of the near end. */
  reverse: boolean;
  labelPlacement: LabelPlacement;
}

export interface BackgroundImage {
  layerId: string;
  src: string;
  x: number;
  y: number;
  width: number;
  height: number;
  opacity: number;
  fileName?: string;
}

export interface Floor {
  id: string;
  name: string;
  /** Bottom-to-top drawing order. */
  layers: Layer[];
  objects: MapObject[];
  rows: Record<string, RowSpec>;
  background?: BackgroundImage;
  /**
   * Set on a building's interior floors: the id of the building or room
   * object (on a site floor) this floor plan is inside. See model/interiors.ts.
   */
  interiorOf?: string;
}

export interface MapSettings {
  gridSize: number;
}

export interface MapDocument {
  id: string;
  schemaVersion: number;
  name: string;
  createdAt: string;
  updatedAt: string;
  /** Incremented by storage on every successful save; used to detect conflicting edits. */
  revision: number;
  floors: Floor[];
  settings: MapSettings;
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}
