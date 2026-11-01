import type { LayerRole, SpaceVariant } from '../model/types';
import type { DrawFn } from './style';

export const ASSET_CATEGORIES = [
  'Parking spaces',
  'Valet operations',
  'Vehicles',
  'Structural objects',
  'Roads and traffic',
  'Directional arrows',
  'Pedestrian areas',
  'Garage access',
  'Buildings and departments',
  'Service and preparation',
  'Outdoor environment',
  'Signs and safety',
  'Zones and boundaries',
  'Text and labels',
  'Location markers',
  'Background and reference',
  'Drawing elements',
  'Custom and reusable',
] as const;

export type AssetCategory = (typeof ASSET_CATEGORIES)[number];

export interface TextPreset {
  text: string;
  fontSize: number;
  color: string;
  fill?: string;
  fillOpacity?: number;
  stroke?: string;
  strokeWidth?: number;
}

export interface AssetDef {
  key: string;
  name: string;
  category: AssetCategory;
  /** Also listed under these categories (the spec names some items twice). */
  also?: AssetCategory[];
  keywords: string[];
  /** Default size in map pixels (5 px = 1 ft). */
  width: number;
  height: number;
  layer: LayerRole;
  /** Prefix for automatic names: placing three stairways yields "Staircase 1..3". */
  namePrefix: string;
  /** Ramps, stairs, elevators, walkways can record which floors they reach. */
  connector?: boolean;
  /**
   * What clicking the tile creates. 'asset' (default) is a drawn object;
   * 'space' a numbered parking space; 'text' a text box; 'background' and
   * 'image' open a file picker; 'soon' is listed but not built yet.
   */
  creates?: 'asset' | 'space' | 'text' | 'row' | 'background' | 'image' | 'soon';
  draw?: DrawFn;
  /** Default paint. Users can change all of it per object. */
  fill: string;
  fillOpacity?: number;
  stroke: string;
  strokeWidth: number;
  /** false for line-only objects, which have a color and thickness but no fill. */
  fillable?: boolean;
  /** Label placed on new objects, e.g. the department name on a room. */
  label?: string;
  /** Where the on-map label sits. 'inside' = the drawing prints it itself. */
  labelPos?: 'below' | 'center' | 'badge' | 'inside';
  labelColor?: string;
  variant?: SpaceVariant;
  text?: TextPreset;
  /** Shown on 'soon' tiles and as extra help. */
  note?: string;
}

type Opts = Omit<AssetDef, 'key' | 'name' | 'category' | 'keywords' | 'namePrefix'> & {
  keywords?: string[];
  namePrefix?: string;
};

/** Builds asset definitions for one category with consistent defaults. */
export function category(cat: AssetCategory) {
  return (key: string, name: string, o: Opts): AssetDef => ({
    key,
    name,
    category: cat,
    namePrefix: o.namePrefix ?? name.replace(/\s*\(.*\)$/, ''),
    ...o,
    keywords: [...(o.keywords ?? []), ...name.toLowerCase().split(/[\s\-/]+/)],
  });
}
