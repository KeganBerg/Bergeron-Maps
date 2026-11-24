import { useEffect, useRef } from 'react';
import type Konva from 'konva';
import type { Floor } from '../model/types';
import { layerPicture } from '../render/printPicture';
import { floorBounds } from '../render/viewport';

/**
 * The browser's own Print (Ctrl+P) in the viewer: the whole floor on the page,
 * with any route or "You are here" marker, instead of the screen's controls
 * and a map cut off at the edge. Drawn as the print starts, into the element
 * the returned ref is put on, which only shows when printing.
 */
export function useFloorPrint({ floor, layer: mapLayerNode, boxRef, viewRef }: {
  floor: Floor | undefined;
  layer: () => Konva.Layer | null;
  boxRef: React.RefObject<HTMLDivElement>;
  viewRef: React.MutableRefObject<{ x: number; y: number; scale: number }>;
}) {
  const printRef = useRef<HTMLDivElement>(null);
  const floorRef = useRef(floor);
  floorRef.current = floor;
  useEffect(() => {
    const before = () => {
      const layer = mapLayerNode(), holder = printRef.current, f = floorRef.current;
      const box = f && floorBounds(f);
      if (!layer || !holder || !box || box.width <= 0 || box.height <= 0) return;
      const bg = getComputedStyle(boxRef.current ?? document.body).backgroundColor || '#ffffff';
      const pic = layerPicture(layer, box, viewRef.current, bg);
      pic.dataset.testid = 'print-map';
      holder.querySelector('canvas')?.remove();
      holder.appendChild(pic);
      const page = holder.querySelector('style')!;
      page.textContent = `@page { size: ${pic.width >= pic.height ? 'landscape' : 'portrait'}; margin: 12mm; }`;
    };
    const after = () => printRef.current?.querySelector('canvas')?.remove();
    window.addEventListener('beforeprint', before);
    window.addEventListener('afterprint', after);
    return () => {
      window.removeEventListener('beforeprint', before);
      window.removeEventListener('afterprint', after);
    };
  }, []);
  return printRef;
}
