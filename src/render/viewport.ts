import { objectBox, unionBoxes } from '../model/geometry';
import type { Box, Floor } from '../model/types';

export const MIN_SCALE = 0.05;
export const MAX_SCALE = 8;

export const clampScale = (s: number) => Math.max(MIN_SCALE, Math.min(MAX_SCALE, s));

export function floorBounds(floor: Floor, includeBackground = true): Box | null {
  const boxes = floor.objects.map(objectBox);
  if (includeBackground && floor.background) boxes.push(floor.background);
  return unionBoxes(boxes);
}

/** Viewport that fits `box` into a screen of the given size with padding. */
export function fitViewport(box: Box | null, size: { width: number; height: number }, padding = 40) {
  if (!box || box.width === 0 || box.height === 0) return { x: size.width / 2 - 300, y: size.height / 2 - 200, scale: 1 };
  const scale = clampScale(
    Math.min((size.width - padding * 2) / box.width, (size.height - padding * 2) / box.height, 2),
  );
  return {
    scale,
    x: size.width / 2 - (box.x + box.width / 2) * scale,
    y: size.height / 2 - (box.y + box.height / 2) * scale,
  };
}

/** Zooms around a fixed screen point (e.g. the mouse pointer). */
export function zoomAt(v: { x: number; y: number; scale: number }, point: { x: number; y: number }, nextScale: number) {
  const scale = clampScale(nextScale);
  const wx = (point.x - v.x) / v.scale;
  const wy = (point.y - v.y) / v.scale;
  return { scale, x: point.x - wx * scale, y: point.y - wy * scale };
}
