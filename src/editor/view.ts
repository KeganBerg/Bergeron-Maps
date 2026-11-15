import type Konva from 'konva';
import { fitViewport, floorBounds, zoomAt } from '../render/viewport';
import { currentFloor, selectionBox, useEditor } from './store';

/** Zoom controls shared by the top bar buttons, the keyboard shortcuts and the right-click menu. */
export function zoomBy(f: number) {
  const s = useEditor.getState();
  s.setViewport(zoomAt(s.viewport, { x: s.viewSize.width / 2, y: s.viewSize.height / 2 }, s.viewport.scale * f));
}
export const zoomTo100 = () => zoomBy(1 / useEditor.getState().viewport.scale);
export function fitFloor() {
  const s = useEditor.getState();
  const floor = currentFloor(s);
  if (floor) s.setViewport(fitViewport(floorBounds(floor), s.viewSize));
}
/** Fits the selection to the screen (Shift+2, as in Figma); the whole floor when nothing is selected. */
export function zoomToSelection() {
  const s = useEditor.getState();
  const floor = currentFloor(s);
  const box = floor && selectionBox(floor, s.selection);
  if (!box) return fitFloor();
  // Closer than a floor fit allows, so one small object fills a good part of the screen.
  s.setViewport(fitViewport(box, s.viewSize, 80, 6));
}

/** The map's object layer, registered by the canvas so the floor can be saved as a picture. */
let mapLayer: Konva.Layer | null = null;
export const registerMapLayer = (l: Konva.Layer | null) => {
  mapLayer = l;
};

/** Longest side of the exported picture, in pixels: sharp when printed on letter or A4 paper. */
const EXPORT_SIDE = 3200;
const MAX_CANVAS = 8000;

/**
 * Draws the whole floor (not just what is on screen) as a PNG, on the map's own
 * background colour, without selection handles, guides or the grid.
 */
export async function floorImage(): Promise<{ blob: Blob; url: string; width: number; height: number } | null> {
  const s = useEditor.getState();
  const floor = currentFloor(s);
  const box = floor && floorBounds(floor);
  const layer = mapLayer;
  if (!floor || !box || !layer || box.width <= 0 || box.height <= 0) return null;
  const pad = Math.max(box.width, box.height) * 0.03;
  const b = { x: box.x - pad, y: box.y - pad, width: box.width + pad * 2, height: box.height + pad * 2 };
  const v = s.viewport;
  // The region in screen pixels at the current zoom, then scaled up to the export size.
  const rect = { x: b.x * v.scale + v.x, y: b.y * v.scale + v.y, width: b.width * v.scale, height: b.height * v.scale };
  const longest = Math.max(rect.width, rect.height);
  const ratio = Math.min(EXPORT_SIDE / longest, MAX_CANVAS / longest);
  const grid = layer.find('.grid-lines');
  grid.forEach((n) => n.hide());
  let drawn: HTMLCanvasElement;
  try {
    drawn = layer.toCanvas({ ...rect, pixelRatio: ratio });
  } finally {
    grid.forEach((n) => n.show());
  }
  const out = document.createElement('canvas');
  out.width = drawn.width;
  out.height = drawn.height;
  const ctx = out.getContext('2d')!;
  const host = layer.getStage()?.container().closest('.canvas') as HTMLElement | null;
  ctx.fillStyle = (host && getComputedStyle(host).backgroundColor) || '#ffffff';
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(drawn, 0, 0);
  const blob = await new Promise<Blob | null>((res) => out.toBlob(res, 'image/png'));
  if (!blob) return null;
  return { blob, url: out.toDataURL('image/png'), width: out.width, height: out.height };
}

const fileSafe = (n: string) => n.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'map';

export async function downloadFloorImage() {
  const s = useEditor.getState();
  const img = await floorImage();
  if (!img) {
    s.notify({ tone: 'info', message: 'This floor is empty, so there is nothing to save as a picture yet.' });
    return;
  }
  const floor = currentFloor(s)!;
  const a = document.createElement('a');
  const href = URL.createObjectURL(img.blob);
  a.href = href;
  a.download = `${fileSafe(s.doc!.name)}-${fileSafe(floor.name)}.png`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}

/** Opens the floor in a print window, where the browser's print dialog can also save it as a PDF. */
export async function printFloor() {
  const s = useEditor.getState();
  // Opened before the picture is drawn, while the click still counts, so pop-up blockers allow it.
  const w = window.open('', '_blank');
  if (!w) {
    s.notify({ tone: 'error', message: 'The print window was blocked. Allow pop-ups for this site and try again.' });
    return;
  }
  const img = await floorImage();
  if (!img) {
    w.close();
    s.notify({ tone: 'info', message: 'This floor is empty, so there is nothing to print yet.' });
    return;
  }
  const floor = currentFloor(s)!;
  const title = `${s.doc!.name} · ${floor.name}`;
  const landscape = img.width >= img.height;
  w.document.title = title;
  w.document.body.innerHTML = '';
  const style = w.document.createElement('style');
  style.textContent = `@page { size: ${landscape ? 'landscape' : 'portrait'}; margin: 12mm; }
    html, body { margin: 0; font-family: system-ui, sans-serif; }
    h1 { font-size: 14pt; margin: 0 0 8px; }
    img { display: block; max-width: 100%; max-height: calc(100vh - 40px); margin: 0 auto; object-fit: contain; }`;
  w.document.head.appendChild(style);
  const h = w.document.createElement('h1');
  h.textContent = title;
  const el = w.document.createElement('img');
  el.alt = title;
  el.dataset.testid = 'print-image';
  el.onload = () => {
    w.focus();
    w.print();
  };
  el.src = img.url;
  w.document.body.append(h, el);
}
