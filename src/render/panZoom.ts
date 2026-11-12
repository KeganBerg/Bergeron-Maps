import { clampScale, zoomAt } from './viewport';

export type View = { x: number; y: number; scale: number };
type Pt = { x: number; y: number };

/** How much one mouse-wheel notch (about 100px of scroll) zooms: about 20%. */
const MOUSE_ZOOM_PER_PX = 0.0018;
/** Trackpad pinch sends many small ctrl+wheel events; this keeps it smooth. */
const PINCH_ZOOM_PER_PX = 0.01;
/** Wheel events closer together than this belong to the same scroll gesture. */
const BURST_MS = 200;

let lastWheel = { t: -Infinity, mouse: false };

/**
 * A mouse wheel moves in big fixed steps; a trackpad sends lots of small deltas.
 * Chrome and Safari report trackpads with wheelDeltaY = -3 × deltaY, and mice in
 * multiples of 120. Firefox mice scroll by lines (deltaMode 1).
 * The answer sticks for a whole burst so one odd event can't flip pan into zoom.
 */
export function isMouseWheel(e: WheelEvent, now = performance.now()): boolean {
  if (now - lastWheel.t < BURST_MS) {
    lastWheel.t = now;
    return lastWheel.mouse;
  }
  let mouse: boolean;
  if (e.deltaMode !== 0) mouse = true;
  else {
    const legacy = (e as WheelEvent & { wheelDeltaY?: number }).wheelDeltaY;
    if (legacy && Math.abs(legacy) === Math.abs(e.deltaY) * 3) mouse = false;
    else if (legacy) mouse = e.deltaX === 0 && legacy % 120 === 0;
    else mouse = e.deltaX === 0 && Number.isInteger(e.deltaY) && Math.abs(e.deltaY) >= 50;
  }
  lastWheel = { t: now, mouse };
  return mouse;
}

/** For tests. */
export function resetWheelBurst() {
  lastWheel = { t: -Infinity, mouse: false };
}

/**
 * The map's wheel rules, shared by the editor and the viewer:
 * - mouse wheel zooms around the pointer (Shift + wheel scrolls sideways)
 * - trackpad two-finger scroll pans
 * - trackpad pinch, or Ctrl/Cmd + wheel, zooms around the pointer
 */
export function wheelView(v: View, e: WheelEvent, point: Pt, pageHeight = 800): View {
  const unit = e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? pageHeight : 1;
  const dx = e.deltaX * unit;
  const dy = e.deltaY * unit;
  const mouse = isMouseWheel(e);
  if (e.ctrlKey || e.metaKey) {
    // Ctrl + a real mouse wheel would otherwise jump ~60% per notch.
    const k = mouse ? MOUSE_ZOOM_PER_PX : PINCH_ZOOM_PER_PX;
    const step = Math.max(-0.5, Math.min(0.5, -dy * k));
    return zoomAt(v, point, v.scale * Math.exp(step));
  }
  if (mouse && e.shiftKey) return { ...v, x: v.x - (dx || dy) };
  if (mouse) {
    const step = Math.max(-0.5, Math.min(0.5, -dy * MOUSE_ZOOM_PER_PX));
    return zoomAt(v, point, v.scale * Math.exp(step));
  }
  return { ...v, x: v.x - dx, y: v.y - dy };
}

/**
 * Touch (and drag) panning and two-finger pinch zoom.
 *
 * Pinch is anchored to where it started: the map point under the fingers' midpoint
 * stays under the midpoint, and the zoom follows the finger spread exactly. That
 * avoids the drift and jitter of adding up small per-event changes. Lifting one
 * finger carries on as a one-finger pan from where that finger is, without a jump.
 */
export class PanZoomTracker {
  private pts = new Map<number, Pt>();
  private mode: 'idle' | 'pan' | 'pinch' = 'idle';
  private anchor: { view: View; a: Pt; b?: Pt; panId?: number } | null = null;
  private downAt: Pt | null = null;
  /** True once the current touch moved the map (so the lift isn't a tap). */
  moved = false;

  get active() {
    return this.mode !== 'idle';
  }
  get pinching() {
    return this.mode === 'pinch';
  }
  get count() {
    return this.pts.size;
  }

  /** Records a pointer. Returns true when this pointer starts a pinch. */
  down(id: number, p: Pt, view: View): boolean {
    if (this.pts.size === 0) {
      this.moved = false;
      this.downAt = p;
    }
    this.pts.set(id, p);
    if (this.pts.size === 2) {
      this.startPinch(view);
      return true;
    }
    return false;
  }

  /** Makes the given pointer drag the map. */
  startPan(id: number, view: View) {
    const p = this.pts.get(id);
    if (!p || this.mode === 'pinch') return;
    this.mode = 'pan';
    this.anchor = { view, a: p, panId: id };
  }

  /** Returns the new view, or null when this pointer isn't moving the map. */
  move(id: number, p: Pt): View | null {
    if (!this.pts.has(id)) return null;
    this.pts.set(id, p);
    if (this.downAt && Math.hypot(p.x - this.downAt.x, p.y - this.downAt.y) > 6) this.moved = true;
    const an = this.anchor;
    if (!an) return null;
    if (this.mode === 'pan' && an.panId === id) {
      return { ...an.view, x: an.view.x + p.x - an.a.x, y: an.view.y + p.y - an.a.y };
    }
    if (this.mode === 'pinch' && an.b) {
      const [p1, p2] = [...this.pts.values()];
      const d0 = Math.max(1, Math.hypot(an.a.x - an.b.x, an.a.y - an.b.y));
      const d1 = Math.hypot(p1.x - p2.x, p1.y - p2.y);
      const m0 = { x: (an.a.x + an.b.x) / 2, y: (an.a.y + an.b.y) / 2 };
      const m1 = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
      const scale = clampScale(an.view.scale * (d1 / d0));
      const wx = (m0.x - an.view.x) / an.view.scale;
      const wy = (m0.y - an.view.y) / an.view.scale;
      return { scale, x: m1.x - wx * scale, y: m1.y - wy * scale };
    }
    return null;
  }

  /** Forgets a pointer. `view` is the current view, used to re-anchor what's left. */
  up(id: number, view: View) {
    if (!this.pts.delete(id)) return;
    if (this.pts.size === 0) {
      this.mode = 'idle';
      this.anchor = null;
      this.downAt = null;
    } else if (this.pts.size === 1) {
      if (this.mode === 'pinch' || this.anchor?.panId === id) {
        const [[rest]] = this.pts;
        this.mode = 'pan';
        this.anchor = { view, a: this.pts.get(rest)!, panId: rest };
      }
    } else if (this.mode === 'pinch') {
      this.startPinch(view);
    }
  }

  reset() {
    this.pts.clear();
    this.mode = 'idle';
    this.anchor = null;
    this.downAt = null;
  }

  private startPinch(view: View) {
    const [a, b] = [...this.pts.values()];
    this.mode = 'pinch';
    this.moved = true;
    this.anchor = { view, a, b };
  }
}
