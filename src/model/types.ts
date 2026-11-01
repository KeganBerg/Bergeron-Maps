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

interface BaseObject {
  id: string;
  layerId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  /** Human-readable identifier shown on click/tap, e.g. "Stairway 3". */
  name?: string;
}

export interface SpaceObject extends BaseObject {
  kind: 'space';
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
  fill?: string;
  /** For ramps, stairs, elevators and walkways: the floors this connects to. */
  connectsTo?: string[];
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
