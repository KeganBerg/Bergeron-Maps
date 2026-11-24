import Konva from 'konva';
import { useCallback, useEffect, useRef } from 'react';
import type { MapDocument } from '../model/types';
import { PanZoomTracker, wheelView } from '../render/panZoom';
import { cancelIdle, whenIdle } from './viewerHelpers';

type View = { x: number; y: number; scale: number };

/**
 * Moving the viewer's map: drag to pan, pinch to zoom, mouse wheel and
 * trackpad, and keeping Konva's tap-detection map up to date without slowing
 * the drawing down. Returns the ref callback for the map's Konva layer.
 */
export function useViewerPanZoom({ boxRef, viewRef, setView, doc }: {
  boxRef: React.RefObject<HTMLDivElement>;
  /** The view right now (state lags a render behind during a gesture). */
  viewRef: React.MutableRefObject<View>;
  setView: (v: View) => void;
  /** The gesture listeners are set up again when the map changes. */
  doc: MapDocument | null;
}) {
  const tracker = useRef(new PanZoomTracker());
  // Konva redraws its hidden hit map (what a tap lands on) with every drawing of
  // the picture: about a third of the drawing time on a big floor, and needed by
  // nothing until the next touch. So the picture comes first and the hit map is
  // brought up to date a moment later when the phone is idle, or at once when a
  // finger or mouse comes down (before Konva looks up what it is on). While the
  // map is dragged or pinched it waits until the gesture ends.
  const hit = useRef<{ layer: Konva.Layer | null; paused: boolean; stale: boolean; timer: number; idle: number; draw?: () => void }>({ layer: null, paused: false, stale: false, timer: 0, idle: 0 });
  const mapLayer = useCallback((layer: Konva.Layer | null) => {
    const h = hit.current;
    if (h.layer && h.layer !== layer) delete (h.layer as Partial<Konva.Layer>).drawHit;
    h.layer = layer;
    if (!layer) {
      cancelIdle(h.idle);
      h.draw = undefined;
      return;
    }
    const drawHit = Konva.Layer.prototype.drawHit;
    h.draw = () => drawHit.call(layer);
    layer.drawHit = function (this: Konva.Layer, ...args: Parameters<Konva.Layer['drawHit']>) {
      // Drawing onto some other canvas (a picture of the map) happens right away.
      if (args[0]) return drawHit.apply(this, args);
      h.stale = true;
      if (!h.paused) hitsSoon();
      return this;
    };
  }, []);
  const flushHits = () => {
    const h = hit.current;
    cancelIdle(h.idle);
    if (h.stale && h.draw) {
      h.stale = false;
      h.draw();
    }
  };
  const hitsSoon = () => {
    const h = hit.current;
    cancelIdle(h.idle);
    h.idle = whenIdle(flushHits);
  };
  const pauseHits = () => { hit.current.paused = true; };
  const resumeHits = () => {
    window.clearTimeout(hit.current.timer);
    hit.current.paused = false;
    flushHits();
  };

  // Drag to pan, pinch to zoom, wheel/trackpad. Native listeners on the canvas box
  // so every finger is seen (Konva only reports one pointer at a time).
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const t = tracker.current;
    const at = (e: PointerEvent | WheelEvent) => {
      const r = el.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const set = (v: { x: number; y: number; scale: number }) => {
      viewRef.current = v;
      setView(v);
    };
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 || (e.target as HTMLElement).closest('button, .info-card, .dir-sheet')) return;
      t.down(e.pointerId, at(e), viewRef.current);
      t.startPan(e.pointerId, viewRef.current);
      // No pointer capture: it would steal the pointerup from Konva, so mouse clicks on a
      // space never registered. The window listeners below already follow drags off the map.
    };
    const onMove = (e: PointerEvent) => {
      const v = t.move(e.pointerId, at(e));
      if (v && t.moved) pauseHits();
      if (v) set(v);
    };
    const onUp = (e: PointerEvent) => {
      t.up(e.pointerId, viewRef.current);
      if (t.count === 0) resumeHits();
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      pauseHits();
      window.clearTimeout(hit.current.timer);
      hit.current.timer = window.setTimeout(resumeHits, 150);
      set(wheelView(viewRef.current, e, at(e), el.clientHeight));
    };
    // Capture phase: runs before Konva looks up what the pointer is on.
    const onDownFirst = () => resumeHits();
    el.addEventListener('pointerdown', onDownFirst, true);
    el.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      t.reset();
      resumeHits();
      el.removeEventListener('pointerdown', onDownFirst, true);
      el.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      el.removeEventListener('wheel', onWheel);
    };
  }, [doc]);

  return {
    mapLayer,
    /** True when the last pointer gesture moved the map (so it was a drag, not a tap). */
    moved: () => tracker.current.moved,
    /** The map's Konva layer, once drawn. */
    layer: () => hit.current.layer,
  };
}
