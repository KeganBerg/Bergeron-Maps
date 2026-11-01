import type { Box, MapObject } from './types';

const RAD = Math.PI / 180;

export function rotatePoint(px: number, py: number, deg: number): { x: number; y: number } {
  const c = Math.cos(deg * RAD);
  const s = Math.sin(deg * RAD);
  return { x: px * c - py * s, y: px * s + py * c };
}

/** Axis-aligned bounding box of a center-based rotated rectangle. */
export function objectBox(o: Pick<MapObject, 'x' | 'y' | 'width' | 'height' | 'rotation'>): Box {
  const c = Math.abs(Math.cos(o.rotation * RAD));
  const s = Math.abs(Math.sin(o.rotation * RAD));
  const w = o.width * c + o.height * s;
  const h = o.width * s + o.height * c;
  return { x: o.x - w / 2, y: o.y - h / 2, width: w, height: h };
}

export function unionBoxes(boxes: Box[]): Box | null {
  if (boxes.length === 0) return null;
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const b of boxes) {
    x1 = Math.min(x1, b.x);
    y1 = Math.min(y1, b.y);
    x2 = Math.max(x2, b.x + b.width);
    y2 = Math.max(y2, b.y + b.height);
  }
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

export function boxesIntersect(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

export function boxContains(outer: Box, inner: Box): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}

export function normalizeRotation(deg: number): number {
  const r = ((deg % 360) + 360) % 360;
  return Math.round(r * 1000) / 1000;
}
