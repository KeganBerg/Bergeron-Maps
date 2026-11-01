/**
 * Built-in asset library. Every symbol here is original artwork drawn for this
 * project (see docs/ASSET_LICENSES.md), so it can be used commercially and
 * white-labeled without third-party attribution.
 *
 * Two render styles:
 *  - 'icon': an SVG symbol scaled into the object's box (columns, trees, booths).
 *  - 'area': a stretchable rectangle with an optional repeating pattern
 *    (walls, roads, walkways, fire lanes) so it stays crisp at any length.
 */
import type { LayerRole } from '../model/types';

export type AssetCategory =
  | 'Structure'
  | 'Floor connections'
  | 'Entrances & access'
  | 'Valet & services'
  | 'Signs & markings'
  | 'Vehicles'
  | 'Landscaping'
  | 'Buildings & site';

export interface AssetDef {
  key: string;
  name: string;
  category: AssetCategory;
  keywords: string[];
  width: number;
  height: number;
  layer: LayerRole;
  render: 'icon' | 'area';
  /** SVG markup (viewBox 0 0 64 64) for icons, or a pattern tile for areas. */
  svg?: string;
  fill?: string;
  stroke?: string;
  /** Prefix for automatic names: placing three stairways yields "Stairway 1..3". */
  namePrefix: string;
  /** Ramps, stairs, elevators, walkways can record which floors they reach. */
  connector?: boolean;
}

const svg = (body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${body}</svg>`;

const tile = (size: number, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${body}</svg>`;

export const ASSETS: AssetDef[] = [
  // Structure
  {
    key: 'wall', name: 'Wall', category: 'Structure', keywords: ['wall', 'barrier', 'structure', 'partition'],
    width: 240, height: 10, layer: 'structure', render: 'area', fill: '#4b5563', stroke: '#374151', namePrefix: 'Wall',
  },
  {
    key: 'column', name: 'Support column', category: 'Structure', keywords: ['column', 'pillar', 'post', 'support', 'pier'],
    width: 24, height: 24, layer: 'structure', render: 'icon', namePrefix: 'Column',
    svg: svg('<rect x="6" y="6" width="52" height="52" rx="4" fill="#6b7280" stroke="#1f2937" stroke-width="4"/><path d="M6 6 58 58M58 6 6 58" stroke="#9ca3af" stroke-width="3"/>'),
  },
  {
    key: 'road', name: 'Drive lane', category: 'Structure', keywords: ['road', 'lane', 'drive', 'aisle', 'street', 'driveway'],
    width: 320, height: 60, layer: 'structure', render: 'area', fill: '#d1d5db', stroke: '#9ca3af', namePrefix: 'Drive lane',
    svg: tile(40, '<rect width="40" height="40" fill="#d1d5db"/><rect x="2" y="18.5" width="20" height="3" fill="#ffffff"/>'),
  },
  {
    key: 'curb', name: 'Curb / island', category: 'Structure', keywords: ['curb', 'island', 'median', 'divider'],
    width: 160, height: 20, layer: 'structure', render: 'area', fill: '#e5e7eb', stroke: '#6b7280', namePrefix: 'Island',
  },

  // Floor connections
  {
    key: 'ramp', name: 'Ramp', category: 'Floor connections', keywords: ['ramp', 'incline', 'up', 'down', 'level', 'connection'],
    width: 120, height: 60, layer: 'structure', render: 'icon', namePrefix: 'Ramp', connector: true,
    svg: svg('<rect x="2" y="14" width="60" height="36" rx="3" fill="#fde68a" stroke="#92400e" stroke-width="3"/><path d="M12 22 22 32 12 42M27 22 37 32 27 42M42 22 52 32 42 42" fill="none" stroke="#92400e" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/>'),
  },
  {
    key: 'stairs', name: 'Stairway', category: 'Floor connections', keywords: ['stairs', 'stairway', 'staircase', 'steps', 'stairwell'],
    width: 48, height: 48, layer: 'landmarks', render: 'icon', namePrefix: 'Stairway', connector: true,
    svg: svg('<rect x="3" y="3" width="58" height="58" rx="6" fill="#dbeafe" stroke="#1e40af" stroke-width="4"/><path d="M12 50h10V40h10V30h10V20h10" fill="none" stroke="#1e40af" stroke-width="5" stroke-linejoin="round"/>'),
  },
  {
    key: 'elevator', name: 'Elevator', category: 'Floor connections', keywords: ['elevator', 'lift'],
    width: 48, height: 48, layer: 'landmarks', render: 'icon', namePrefix: 'Elevator', connector: true,
    svg: svg('<rect x="3" y="3" width="58" height="58" rx="6" fill="#ede9fe" stroke="#5b21b6" stroke-width="4"/><path d="M20 26 28 16 36 26ZM20 38 28 48 36 38Z" fill="#5b21b6"/><rect x="40" y="14" width="12" height="36" rx="2" fill="none" stroke="#5b21b6" stroke-width="3"/>'),
  },
  {
    key: 'walkway', name: 'Pedestrian walkway', category: 'Floor connections', keywords: ['walkway', 'pedestrian', 'crosswalk', 'path', 'sidewalk', 'walk'],
    width: 200, height: 40, layer: 'structure', render: 'area', fill: '#f3f4f6', stroke: '#9ca3af', namePrefix: 'Walkway', connector: true,
    svg: tile(20, '<rect width="20" height="20" fill="#f3f4f6"/><rect x="2" width="8" height="20" fill="#fbbf24"/>'),
  },

  // Entrances & access
  {
    key: 'entrance', name: 'Entrance', category: 'Entrances & access', keywords: ['entrance', 'entry', 'in', 'enter'],
    width: 56, height: 56, layer: 'landmarks', render: 'icon', namePrefix: 'Entrance',
    svg: svg('<circle cx="32" cy="32" r="29" fill="#16a34a" stroke="#14532d" stroke-width="3"/><path d="M16 32h26M32 20l12 12-12 12" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>'),
  },
  {
    key: 'exit', name: 'Exit', category: 'Entrances & access', keywords: ['exit', 'out', 'leave', 'egress'],
    width: 56, height: 56, layer: 'landmarks', render: 'icon', namePrefix: 'Exit',
    svg: svg('<circle cx="32" cy="32" r="29" fill="#dc2626" stroke="#7f1d1d" stroke-width="3"/><path d="M20 32h26M34 20l12 12-12 12" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/><rect x="12" y="18" width="5" height="28" fill="#fff"/>'),
  },
  {
    key: 'gate', name: 'Gate', category: 'Entrances & access', keywords: ['gate', 'fence', 'barrier', 'door'],
    width: 100, height: 20, layer: 'structure', render: 'icon', namePrefix: 'Gate',
    svg: svg('<rect x="2" y="22" width="8" height="20" fill="#374151"/><rect x="54" y="22" width="8" height="20" fill="#374151"/><path d="M10 26h44M10 38h44M18 26v12M28 26v12M38 26v12M48 26v12" stroke="#6b7280" stroke-width="3"/>'),
  },
  {
    key: 'barrier-arm', name: 'Barrier arm', category: 'Entrances & access', keywords: ['barrier', 'arm', 'boom', 'gate', 'ticket'],
    width: 100, height: 20, layer: 'structure', render: 'icon', namePrefix: 'Barrier arm',
    svg: svg('<rect x="2" y="22" width="12" height="20" rx="2" fill="#1f2937"/><rect x="14" y="29" width="48" height="6" fill="#fff" stroke="#1f2937" stroke-width="1.5"/><path d="M22 29v6M34 29v6M46 29v6" stroke="#dc2626" stroke-width="6"/>'),
  },

  // Valet & services
  {
    key: 'valet-booth', name: 'Valet booth', category: 'Valet & services', keywords: ['valet', 'booth', 'stand', 'podium', 'attendant'],
    width: 60, height: 48, layer: 'landmarks', render: 'icon', namePrefix: 'Valet booth',
    svg: svg('<rect x="4" y="10" width="56" height="44" rx="4" fill="#0f766e" stroke="#134e4a" stroke-width="3"/><text x="32" y="38" font-family="Arial,Helvetica,sans-serif" font-size="14" font-weight="700" fill="#fff" text-anchor="middle">VALET</text>'),
  },
  {
    key: 'key-box', name: 'Key box', category: 'Valet & services', keywords: ['key', 'keys', 'box', 'lockbox', 'cabinet'],
    width: 36, height: 36, layer: 'landmarks', render: 'icon', namePrefix: 'Key box',
    svg: svg('<rect x="6" y="6" width="52" height="52" rx="6" fill="#fef3c7" stroke="#92400e" stroke-width="4"/><circle cx="24" cy="32" r="9" fill="none" stroke="#92400e" stroke-width="5"/><path d="M33 32h18M45 32v8M51 32v6" stroke="#92400e" stroke-width="5" stroke-linecap="round"/>'),
  },
  {
    key: 'pay-station', name: 'Payment booth', category: 'Valet & services', keywords: ['pay', 'payment', 'booth', 'kiosk', 'cashier', 'ticket'],
    width: 48, height: 48, layer: 'landmarks', render: 'icon', namePrefix: 'Payment booth',
    svg: svg('<rect x="6" y="4" width="52" height="56" rx="5" fill="#e0f2fe" stroke="#075985" stroke-width="4"/><text x="32" y="44" font-family="Arial,Helvetica,sans-serif" font-size="32" font-weight="700" fill="#075985" text-anchor="middle">$</text>'),
  },
  {
    key: 'ev-charger', name: 'EV charger', category: 'Valet & services', keywords: ['ev', 'electric', 'charger', 'charging', 'plug'],
    width: 32, height: 32, layer: 'landmarks', render: 'icon', namePrefix: 'EV charger',
    svg: svg('<rect x="6" y="6" width="52" height="52" rx="8" fill="#dcfce7" stroke="#166534" stroke-width="4"/><path d="M36 12 20 36h12l-4 16 16-24H32Z" fill="#166534"/>'),
  },
  {
    key: 'office', name: 'Office / lobby door', category: 'Valet & services', keywords: ['office', 'lobby', 'door', 'hotel', 'front desk'],
    width: 48, height: 48, layer: 'landmarks', render: 'icon', namePrefix: 'Door',
    svg: svg('<rect x="14" y="4" width="36" height="56" rx="2" fill="#fef9c3" stroke="#713f12" stroke-width="4"/><circle cx="41" cy="34" r="3.5" fill="#713f12"/>'),
  },

  // Signs & markings
  {
    key: 'arrow', name: 'Direction arrow', category: 'Signs & markings', keywords: ['arrow', 'direction', 'one way', 'traffic', 'flow'],
    width: 60, height: 30, layer: 'labels', render: 'icon', namePrefix: 'Arrow',
    svg: svg('<path d="M4 26h36V14l20 18-20 18V38H4Z" fill="#ffffff" stroke="#111827" stroke-width="3" stroke-linejoin="round"/>'),
  },
  {
    key: 'accessible', name: 'Accessible parking', category: 'Signs & markings', keywords: ['accessible', 'ada', 'handicap', 'disabled', 'wheelchair'],
    width: 32, height: 32, layer: 'labels', render: 'icon', namePrefix: 'Accessible',
    svg: svg('<rect x="2" y="2" width="60" height="60" rx="6" fill="#1d4ed8"/><circle cx="30" cy="13" r="5" fill="#fff"/><path d="M28 20v16h14l6 14" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><path d="M22 29a13 13 0 1 0 18 18" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round"/>'),
  },
  {
    key: 'fire-lane', name: 'Fire lane', category: 'Signs & markings', keywords: ['fire', 'lane', 'no parking', 'emergency', 'red'],
    width: 240, height: 40, layer: 'structure', render: 'area', fill: '#fee2e2', stroke: '#dc2626', namePrefix: 'Fire lane',
    svg: tile(20, '<rect width="20" height="20" fill="#fee2e2"/><path d="M-5 5 5 -5M0 20 20 0M15 25 25 15" stroke="#dc2626" stroke-width="4"/>'),
  },
  {
    key: 'stop-sign', name: 'Stop sign', category: 'Signs & markings', keywords: ['stop', 'sign', 'traffic'],
    width: 36, height: 36, layer: 'labels', render: 'icon', namePrefix: 'Stop sign',
    svg: svg('<path d="M21 3h22l18 18v22L43 61H21L3 43V21Z" fill="#dc2626" stroke="#fff" stroke-width="3"/><text x="32" y="39" font-family="Arial,Helvetica,sans-serif" font-size="17" font-weight="700" fill="#fff" text-anchor="middle">STOP</text>'),
  },
  {
    key: 'no-parking', name: 'No parking', category: 'Signs & markings', keywords: ['no parking', 'sign', 'restricted', 'tow'],
    width: 36, height: 36, layer: 'labels', render: 'icon', namePrefix: 'No parking',
    svg: svg('<circle cx="32" cy="32" r="28" fill="#fff" stroke="#dc2626" stroke-width="6"/><text x="32" y="44" font-family="Arial,Helvetica,sans-serif" font-size="32" font-weight="700" fill="#1d4ed8" text-anchor="middle">P</text><path d="M13 13 51 51" stroke="#dc2626" stroke-width="6"/>'),
  },
  {
    key: 'sign', name: 'Sign', category: 'Signs & markings', keywords: ['sign', 'notice', 'information', 'post'],
    width: 40, height: 40, layer: 'labels', render: 'icon', namePrefix: 'Sign',
    svg: svg('<rect x="6" y="6" width="52" height="38" rx="4" fill="#fff" stroke="#111827" stroke-width="4"/><path d="M32 44v16" stroke="#111827" stroke-width="5"/><path d="M16 20h32M16 30h22" stroke="#111827" stroke-width="4"/>'),
  },
  {
    key: 'hydrant', name: 'Fire hydrant', category: 'Signs & markings', keywords: ['hydrant', 'fire', 'water'],
    width: 28, height: 28, layer: 'landmarks', render: 'icon', namePrefix: 'Hydrant',
    svg: svg('<path d="M22 24a10 10 0 0 1 20 0v30H22Z" fill="#dc2626" stroke="#7f1d1d" stroke-width="3"/><rect x="14" y="30" width="36" height="8" rx="3" fill="#dc2626" stroke="#7f1d1d" stroke-width="3"/><rect x="18" y="54" width="28" height="6" fill="#7f1d1d"/>'),
  },

  // Vehicles
  {
    key: 'car', name: 'Car', category: 'Vehicles', keywords: ['car', 'vehicle', 'auto', 'sedan'],
    width: 36, height: 72, layer: 'landmarks', render: 'icon', namePrefix: 'Car',
    svg: svg('<rect x="16" y="2" width="32" height="60" rx="10" fill="#60a5fa" stroke="#1e3a8a" stroke-width="3"/><rect x="20" y="14" width="24" height="10" rx="3" fill="#1e3a8a"/><rect x="20" y="42" width="24" height="8" rx="3" fill="#1e3a8a"/>'),
  },
  {
    key: 'truck', name: 'Truck / SUV', category: 'Vehicles', keywords: ['truck', 'suv', 'van', 'vehicle'],
    width: 40, height: 80, layer: 'landmarks', render: 'icon', namePrefix: 'Truck',
    svg: svg('<rect x="14" y="2" width="36" height="60" rx="6" fill="#a3a3a3" stroke="#262626" stroke-width="3"/><rect x="18" y="10" width="28" height="10" rx="2" fill="#262626"/><rect x="18" y="28" width="28" height="30" rx="2" fill="#d4d4d4" stroke="#262626" stroke-width="2"/>'),
  },

  // Landscaping
  {
    key: 'tree', name: 'Tree', category: 'Landscaping', keywords: ['tree', 'landscaping', 'green', 'plant'],
    width: 48, height: 48, layer: 'landmarks', render: 'icon', namePrefix: 'Tree',
    svg: svg('<circle cx="32" cy="32" r="28" fill="#4ade80" stroke="#166534" stroke-width="3"/><circle cx="22" cy="26" r="9" fill="#22c55e"/><circle cx="40" cy="36" r="10" fill="#22c55e"/><circle cx="32" cy="32" r="3" fill="#78350f"/>'),
  },
  {
    key: 'shrub', name: 'Shrub', category: 'Landscaping', keywords: ['shrub', 'bush', 'hedge', 'landscaping'],
    width: 28, height: 28, layer: 'landmarks', render: 'icon', namePrefix: 'Shrub',
    svg: svg('<path d="M32 6c8 0 10 6 14 8s12 4 12 14-6 12-8 16-6 14-18 14S18 50 14 46 6 40 6 30s8-12 12-16 6-8 14-8Z" fill="#86efac" stroke="#166534" stroke-width="3"/>'),
  },
  {
    key: 'planter', name: 'Planter / grass', category: 'Landscaping', keywords: ['planter', 'grass', 'lawn', 'landscaping', 'island'],
    width: 160, height: 40, layer: 'structure', render: 'area', fill: '#bbf7d0', stroke: '#16a34a', namePrefix: 'Planter',
  },

  // Buildings & site
  {
    key: 'building', name: 'Building', category: 'Buildings & site', keywords: ['building', 'hotel', 'store', 'structure', 'lobby'],
    width: 240, height: 160, layer: 'structure', render: 'area', fill: '#f5f0e6', stroke: '#78716c', namePrefix: 'Building',
  },
  {
    key: 'light-pole', name: 'Light pole', category: 'Buildings & site', keywords: ['light', 'lamp', 'pole', 'lighting'],
    width: 24, height: 24, layer: 'landmarks', render: 'icon', namePrefix: 'Light pole',
    svg: svg('<circle cx="32" cy="32" r="26" fill="#fef9c3" stroke="#a16207" stroke-width="3"/><circle cx="32" cy="32" r="10" fill="#facc15" stroke="#a16207" stroke-width="3"/>'),
  },
  {
    key: 'trash', name: 'Trash can', category: 'Buildings & site', keywords: ['trash', 'garbage', 'bin', 'dumpster', 'waste'],
    width: 28, height: 28, layer: 'landmarks', render: 'icon', namePrefix: 'Trash can',
    svg: svg('<rect x="14" y="16" width="36" height="44" rx="4" fill="#9ca3af" stroke="#374151" stroke-width="3"/><rect x="10" y="8" width="44" height="8" rx="2" fill="#6b7280"/><path d="M24 24v28M32 24v28M40 24v28" stroke="#374151" stroke-width="3"/>'),
  },
];

export const ASSET_BY_KEY: Record<string, AssetDef> = Object.fromEntries(ASSETS.map((a) => [a.key, a]));

export const ASSET_CATEGORIES: AssetCategory[] = [
  'Structure',
  'Floor connections',
  'Entrances & access',
  'Valet & services',
  'Signs & markings',
  'Vehicles',
  'Landscaping',
  'Buildings & site',
];

/** Case-insensitive search across names, keywords and categories. */
export function searchAssets(query: string, assets: AssetDef[] = ASSETS): AssetDef[] {
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return assets;
  return assets.filter((a) => {
    const hay = [a.name, a.category, ...a.keywords].join(' ').toLowerCase();
    return terms.every((t) => hay.includes(t));
  });
}

export function svgDataUrl(markup: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
}
