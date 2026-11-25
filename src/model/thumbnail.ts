import type { MapDocument, MapObject } from './types';

/**
 * A map's small picture for its card on the Maps page: the shapes on its
 * first site floor as plain boxes in their own colours. It's drawn without
 * the symbol library (which belongs to the editor and is large), so it reads
 * as the layout of the lot at a glance rather than a full rendering.
 */
/** A shape's centre (x, y), size and turn in degrees, as the map stores it. */
export interface ThumbShape { x: number; y: number; width: number; height: number; rotation: number; fill: string; opacity: number;
  /** Parking spaces get a thin edge, so a row of white spaces still reads as a row. */
  outline?: boolean }
export interface Thumbnail { viewBox: [number, number, number, number]; shapes: ThumbShape[] }

/** Most cards show a few hundred spaces at most; past this the picture looks the same and costs more to draw. */
const MAX_SHAPES = 1500;
const ROAD = /road|lane|drive|aisle|ramp|street/;

function paint(o: MapObject): Pick<ThumbShape, 'fill' | 'opacity' | 'outline'> | null {
  if (o.hidden) return null;
  if (o.kind === 'text') return null;
  if (o.kind === 'space') return { fill: o.fill || '#ffffff', opacity: 1, outline: true };
  if (ROAD.test(o.assetKey)) return { fill: o.fill ?? '#64748b', opacity: 0.55 };
  if (o.fill && (o.fillOpacity ?? 1) > 0.05) return { fill: o.fill, opacity: Math.max(0.35, o.fillOpacity ?? 1) };
  if (o.stroke) return { fill: o.stroke, opacity: 0.25 };
  return { fill: '#94a3b8', opacity: 0.4 };
}

/** The picture for a map, or null when its first site floor has nothing on it. */
export function mapThumbnail(doc: MapDocument): Thumbnail | null {
  const floor = doc.floors.find((f) => !f.interiorOf) ?? doc.floors[0];
  if (!floor) return null;
  const shapes: ThumbShape[] = [];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const o of floor.objects) {
    if (shapes.length >= MAX_SHAPES) break;
    const p = paint(o);
    if (!p || !(o.width > 0) || !(o.height > 0)) continue;
    shapes.push({ x: o.x, y: o.y, width: o.width, height: o.height, rotation: o.rotation || 0, ...p });
    // Objects sit on their centre (x, y) and turn around it; frame the box the turned shape fills.
    const t = ((o.rotation || 0) * Math.PI) / 180;
    const hw = (Math.abs(Math.cos(t)) * o.width + Math.abs(Math.sin(t)) * o.height) / 2;
    const hh = (Math.abs(Math.sin(t)) * o.width + Math.abs(Math.cos(t)) * o.height) / 2;
    minX = Math.min(minX, o.x - hw);
    minY = Math.min(minY, o.y - hh);
    maxX = Math.max(maxX, o.x + hw);
    maxY = Math.max(maxY, o.y + hh);
  }
  if (!shapes.length) return null;
  const pad = Math.max(maxX - minX, maxY - minY) * 0.04;
  return { viewBox: [minX - pad, minY - pad, maxX - minX + pad * 2, maxY - minY + pad * 2], shapes };
}
