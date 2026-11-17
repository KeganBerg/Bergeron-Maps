import Konva from 'konva';
import type { Canvas } from 'konva/lib/Canvas';
import { useCallback, useMemo, useRef } from 'react';
import type { MapObject } from '../model/types';

/**
 * Draw only what can be seen. On a big floor zoomed in, most objects are off
 * screen, but Konva still drew every one of them each frame (and again for its
 * hidden hit map). A culled group skips children whose drawing can't reach the
 * area being drawn.
 *
 * The visible area comes from the canvas actually being drawn (its size and
 * current transform), not from the app's view state, so a picture exported at
 * any size or position still gets everything in it. An object's reach is its
 * real drawn extent (labels moved outside it included), measured once per
 * version of the object; its position is read live from the node, so objects
 * being dragged or resized are placed correctly too. Anything that isn't a
 * map object (merged surfaces, the background) is always drawn.
 */

/** Below this many children, drawing everything is cheap enough. */
const MIN_CHILDREN = 150;
/** Extra margin around the canvas, in device pixels. */
const PAD = 24;

type Rect = { x1: number; y1: number; x2: number; y2: number };
type Draw = (method: string, canvas: Canvas, top?: Konva.Node, buffer?: Canvas) => void;
const drawChildren = (Konva.Container.prototype as unknown as { _drawChildren: Draw })._drawChildren;
const reaches = new WeakMap<Konva.Node, { obj: MapObject; r: number }>();

/** The area of the canvas being drawn, in the container's own coordinates. */
export function visibleArea(container: Konva.Node, canvas: Canvas, top?: Konva.Node): Rect | null {
  const ctx = (canvas.getContext() as unknown as { _context?: CanvasRenderingContext2D })._context;
  const el = (canvas as unknown as { _canvas?: HTMLCanvasElement })._canvas;
  if (!ctx || !el || typeof ctx.getTransform !== 'function' || typeof DOMMatrix !== 'function') return null;
  const [a, b, c, d, e, f] = container.getAbsoluteTransform(top).getMatrix();
  const toLocal = ctx.getTransform().multiply(new DOMMatrix([a, b, c, d, e, f])).inverse();
  if (!Number.isFinite(toLocal.a + toLocal.b + toLocal.c + toLocal.d + toLocal.e + toLocal.f)) return null;
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const [px, py] of [[-PAD, -PAD], [el.width + PAD, -PAD], [-PAD, el.height + PAD], [el.width + PAD, el.height + PAD]]) {
    const p = toLocal.transformPoint(new DOMPoint(px, py));
    x1 = Math.min(x1, p.x); y1 = Math.min(y1, p.y);
    x2 = Math.max(x2, p.x); y2 = Math.max(y2, p.y);
  }
  return { x1, y1, x2, y2 };
}

/** How far the node's drawing reaches from its position, at scale 1, whatever its rotation. */
function reach(node: Konva.Node, obj: MapObject): number {
  const known = reaches.get(node);
  if (known && known.obj === obj) return known.r;
  const box = node.getClientRect({ skipTransform: true, skipShadow: false });
  const cx = box.x + box.width / 2 - node.offsetX();
  const cy = box.y + box.height / 2 - node.offsetY();
  const r = Math.hypot(cx, cy) + Math.hypot(box.width, box.height) / 2 + 1;
  reaches.set(node, { obj, r: Number.isFinite(r) ? r : Infinity });
  return reaches.get(node)!.r;
}

const near = (x: number, y: number, r: number, v: Rect) => x + r >= v.x1 && x - r <= v.x2 && y + r >= v.y1 && y - r <= v.y2;

export function onScreen(node: Konva.Node, byId: Map<string, MapObject>, v: Rect): boolean {
  const id = node.attrs.id as string | undefined;
  const obj = id ? byId.get(id) : undefined;
  if (!obj) return true;
  const x = node.x(), y = node.y();
  const s = Math.max(Math.abs(node.scaleX()), Math.abs(node.scaleY()), 1);
  // Quick yes: the object's own box touches the area.
  if (near(x, y, (Math.hypot(obj.width, obj.height) / 2) * s, v)) return true;
  // Otherwise check what it really draws (e.g. a name moved outside it).
  return near(x, y, reach(node, obj) * s, v);
}

/** Makes a group skip drawing its off-screen map objects. */
export function cullGroup(group: Konva.Group, objects: () => Map<string, MapObject>) {
  const g = group as unknown as { _drawChildren: Draw; children: Konva.Node[] };
  g._drawChildren = function (this: Konva.Group, method, canvas, top, buffer) {
    const all = this.children;
    const area = all && all.length >= MIN_CHILDREN && canvas ? visibleArea(this, canvas, top) : null;
    if (!area) return drawChildren.call(this, method, canvas, top, buffer);
    const byId = objects();
    const shown = all.filter((n) => onScreen(n, byId, area));
    if (shown.length === all.length) return drawChildren.call(this, method, canvas, top, buffer);
    (this as unknown as { children: Konva.Node[] }).children = shown;
    try {
      return drawChildren.call(this, method, canvas, top, buffer);
    } finally {
      (this as unknown as { children: Konva.Node[] }).children = all;
    }
  };
}

/** A ref for a group of map objects that should skip drawing the ones off screen. */
export function useCulledGroup(objects: MapObject[]) {
  const byId = useMemo(() => new Map(objects.map((o) => [o.id, o])), [objects]);
  const latest = useRef(byId);
  latest.current = byId;
  return useCallback((g: Konva.Group | null) => {
    if (g) cullGroup(g, () => latest.current);
  }, []);
}
