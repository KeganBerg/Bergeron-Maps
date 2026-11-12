import { beforeEach, describe, expect, it } from 'vitest';
import { isMouseWheel, PanZoomTracker, resetWheelBurst, wheelView } from './panZoom';

const wheel = (init: WheelEventInit & { wheelDeltaY?: number }) => {
  const e = new WheelEvent('wheel', init);
  if (init.wheelDeltaY !== undefined) Object.defineProperty(e, 'wheelDeltaY', { value: init.wheelDeltaY });
  return e;
};
const v0 = { x: 100, y: 50, scale: 1 };
const center = { x: 400, y: 300 };
/** The map point under the screen point. */
const worldAt = (v: typeof v0, p: typeof center) => ({ x: (p.x - v.x) / v.scale, y: (p.y - v.y) / v.scale });

describe('wheel', () => {
  beforeEach(resetWheelBurst);

  it('a mouse wheel notch zooms about 20% around the pointer', () => {
    const v = wheelView(v0, wheel({ deltaY: -100, wheelDeltaY: 120 }), center);
    expect(v.scale).toBeCloseTo(1.197, 2);
    expect(worldAt(v, center).x).toBeCloseTo(worldAt(v0, center).x);
    expect(worldAt(v, center).y).toBeCloseTo(worldAt(v0, center).y);
  });

  it('Ctrl + mouse wheel zooms by the same small step, not 60%', () => {
    const v = wheelView(v0, wheel({ deltaY: 100, wheelDeltaY: -120, ctrlKey: true }), center);
    expect(v.scale).toBeCloseTo(1 / 1.197, 2);
  });

  it('a trackpad two-finger scroll pans', () => {
    const v = wheelView(v0, wheel({ deltaX: 12, deltaY: 30, wheelDeltaY: -90 }), center);
    expect(v).toEqual({ x: 88, y: 20, scale: 1 });
  });

  it('a trackpad pinch zooms smoothly around the pointer', () => {
    let v = v0;
    for (let i = 0; i < 10; i++) v = wheelView(v, wheel({ deltaY: -5, ctrlKey: true }), center);
    expect(v.scale).toBeCloseTo(Math.exp(0.5), 3);
    expect(worldAt(v, center).x).toBeCloseTo(worldAt(v0, center).x);
  });

  it('Firefox line scrolling counts as a mouse', () => {
    expect(isMouseWheel(wheel({ deltaY: 3, deltaMode: 1 }))).toBe(true);
  });

  it('one odd event in a trackpad scroll does not turn it into a zoom', () => {
    expect(isMouseWheel(wheel({ deltaY: 4, wheelDeltaY: -12 }), 1000)).toBe(false);
    expect(isMouseWheel(wheel({ deltaY: 40, wheelDeltaY: -120 }), 1050)).toBe(false);
  });

  it('Shift + mouse wheel scrolls sideways', () => {
    expect(wheelView(v0, wheel({ deltaY: 100, wheelDeltaY: -120, shiftKey: true }), center)).toEqual({ x: 0, y: 50, scale: 1 });
  });

  it('stops at the zoom limits without sliding the map', () => {
    const max = { x: 10, y: 10, scale: 8 };
    expect(wheelView(max, wheel({ deltaY: -100, wheelDeltaY: 120 }), center)).toEqual(max);
  });
});

describe('PanZoomTracker', () => {
  it('one finger pans', () => {
    const t = new PanZoomTracker();
    t.down(1, { x: 10, y: 10 }, v0);
    t.startPan(1, v0);
    expect(t.move(1, { x: 40, y: 0 })).toEqual({ x: 130, y: 40, scale: 1 });
    expect(t.moved).toBe(true);
  });

  it('a pinch keeps the map point under the fingers and follows their spread', () => {
    const t = new PanZoomTracker();
    t.down(1, { x: 300, y: 300 }, v0);
    expect(t.down(2, { x: 500, y: 300 }, v0)).toBe(true);
    t.move(1, { x: 200, y: 300 });
    const v = t.move(2, { x: 600, y: 300 })!;
    expect(v.scale).toBeCloseTo(2);
    expect(worldAt(v, center)).toEqual(worldAt(v0, center));
  });

  it('pinch also pans with the midpoint', () => {
    const t = new PanZoomTracker();
    t.down(1, { x: 300, y: 300 }, v0);
    t.down(2, { x: 500, y: 300 }, v0);
    t.move(1, { x: 300, y: 350 });
    const v = t.move(2, { x: 500, y: 350 })!;
    expect(v).toEqual({ x: 100, y: 100, scale: 1 });
  });

  it('lifting one finger of a pinch carries on panning with no jump', () => {
    const t = new PanZoomTracker();
    t.down(1, { x: 300, y: 300 }, v0);
    t.down(2, { x: 500, y: 300 }, v0);
    const v = t.move(2, { x: 700, y: 300 })!;
    t.up(1, v);
    expect(t.move(2, { x: 700, y: 300 })).toEqual(v);
    expect(t.move(2, { x: 720, y: 310 })).toEqual({ ...v, x: v.x + 20, y: v.y + 10 });
  });

  it('a tap with no movement is still a tap', () => {
    const t = new PanZoomTracker();
    t.down(1, { x: 10, y: 10 }, v0);
    t.startPan(1, v0);
    t.move(1, { x: 12, y: 11 });
    t.up(1, v0);
    expect(t.moved).toBe(false);
    expect(t.active).toBe(false);
  });
});
