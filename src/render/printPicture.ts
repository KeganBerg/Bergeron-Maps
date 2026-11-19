import type Konva from 'konva';

type Box = { x: number; y: number; width: number; height: number };
type View = { x: number; y: number; scale: number };

/**
 * Draws a part of the map (in map units) from a layer as a canvas, at about `longest`
 * pixels on its longest side, on `background`. Whatever is drawn on the layer comes
 * along (a route, a "You are here" marker), wherever the screen is scrolled to.
 */
export function layerPicture(layer: Konva.Layer, box: Box, view: View, background: string, longest = 2400): HTMLCanvasElement {
  const pad = Math.max(box.width, box.height) * 0.03;
  const b = { x: box.x - pad, y: box.y - pad, width: box.width + pad * 2, height: box.height + pad * 2 };
  const rect = { x: b.x * view.scale + view.x, y: b.y * view.scale + view.y, width: b.width * view.scale, height: b.height * view.scale };
  const ratio = Math.min(longest, 8000) / Math.max(rect.width, rect.height);
  const drawn = layer.toCanvas({ ...rect, pixelRatio: ratio });
  const out = document.createElement('canvas');
  out.width = drawn.width;
  out.height = drawn.height;
  const ctx = out.getContext('2d')!;
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(drawn, 0, 0);
  return out;
}
