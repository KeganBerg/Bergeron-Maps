/**
 * Built-in asset library. Every symbol here is original artwork drawn for this
 * project in code (see docs/ASSET_LICENSES.md and docs/ASSET_STYLE.md), so it
 * can be used commercially and white-labeled without third-party attribution.
 *
 * Each asset is a draw function that returns SVG for the object's real size and
 * paint, so roads, walls and zones stay crisp at any length and every object's
 * fill, fill opacity, border color and border thickness can be changed.
 */
import { BACKGROUNDS, CUSTOM, DRAWING, MARKERS, TEXTS, ZONES } from './catalog/misc';
import { OUTDOOR, SIGNS } from './catalog/outdoor-signs';
import { BUILDINGS, GARAGE, PEDESTRIAN, SERVICE } from './catalog/places';
import { SPACES } from './catalog/spaces';
import { ARROWS, ROADS, STRUCTURE } from './catalog/structure-roads';
import { VALET, VEHICLES } from './catalog/valet-vehicles';
import { ASSET_CATEGORIES, type AssetCategory, type AssetDef } from './defs';
import { svgDataUrl, svgDoc, type DrawCtx } from './style';

export { ASSET_CATEGORIES, svgDataUrl };
export type { AssetCategory, AssetDef };

export const ASSETS: AssetDef[] = [
  ...SPACES,
  ...VALET,
  ...VEHICLES,
  ...STRUCTURE,
  ...ROADS,
  ...ARROWS,
  ...PEDESTRIAN,
  ...GARAGE,
  ...BUILDINGS,
  ...SERVICE,
  ...OUTDOOR,
  ...SIGNS,
  ...ZONES,
  ...TEXTS,
  ...MARKERS,
  ...BACKGROUNDS,
  ...DRAWING,
  ...CUSTOM,
];

/** Keys used by earlier versions whose asset now lives under another key. */
const ALIASES: Record<string, string> = {
  office: 'lobby-entrance',
};

export const ASSET_BY_KEY: Record<string, AssetDef> = Object.fromEntries(ASSETS.map((a) => [a.key, a]));
for (const [old, now] of Object.entries(ALIASES)) ASSET_BY_KEY[old] ??= ASSET_BY_KEY[now];

/** Assets listed under a category, including ones that also appear there. */
export function assetsIn(cat: AssetCategory, assets: AssetDef[] = ASSETS): AssetDef[] {
  return assets.filter((a) => a.category === cat || a.also?.includes(cat));
}

/** Case-insensitive search across names, keywords and categories. */
export function searchAssets(query: string, assets: AssetDef[] = ASSETS): AssetDef[] {
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return assets;
  return assets.filter((a) => {
    const hay = [a.name, a.category, ...(a.also ?? []), ...a.keywords].join(' ').toLowerCase();
    return terms.every((t) => hay.includes(t));
  });
}

/** Can this tile be placed on the map as a drawn asset object? */
export const isDrawn = (def: AssetDef) => (def.creates ?? 'asset') === 'asset' && !!def.draw;

export interface PaintSource {
  width: number;
  height: number;
  fill?: string;
  fillOpacity?: number;
  stroke?: string;
  strokeWidth?: number;
  label?: string;
}

/** The asset's paint with the object's own overrides applied. */
export function resolvePaint(def: AssetDef, o: Partial<PaintSource> = {}) {
  return {
    fill: o.fill ?? def.fill,
    fo: o.fillOpacity ?? def.fillOpacity ?? 1,
    stroke: o.stroke ?? def.stroke,
    sw: o.strokeWidth ?? def.strokeWidth,
  };
}

/** Full SVG document for an asset at the object's size and paint. */
export function renderAssetSvg(def: AssetDef, o: PaintSource): string {
  if (!def.draw) return svgDoc(o.width, o.height, '');
  const p = resolvePaint(def, o);
  const ctx: DrawCtx = { w: o.width, h: o.height, ...p, label: o.label ?? def.label ?? '' };
  return svgDoc(o.width, o.height, def.draw(ctx));
}

/** Library tile preview at the asset's default size and paint. */
const previewCache = new Map<string, string>();
export function assetPreviewUrl(def: AssetDef): string | undefined {
  if (!def.draw) return undefined;
  let url = previewCache.get(def.key);
  if (!url) {
    url = svgDataUrl(renderAssetSvg(def, { width: def.width, height: def.height }));
    previewCache.set(def.key, url);
  }
  return url;
}
