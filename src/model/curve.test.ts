import { describe, expect, it } from 'vitest';
import { bezierAt, curvePx, defaultCurvePx, reshapedFields } from './curve';
import { curveOutline, ringsArea, toWorld } from './shape';

describe('bendable curves', () => {
  it('the default curve runs from the middle of the left end to the middle of the bottom end', () => {
    const p = defaultCurvePx(240, 240, 120);
    expect(p.slice(0, 2)).toEqual([0, 60]);
    expect(p.slice(6)).toEqual([180, 240]);
    // Close to a true quarter circle of radius 180 round the bottom-left corner.
    const [x, y] = bezierAt(p, 0.5);
    expect(Math.hypot(x, y - 240)).toBeCloseTo(180, 0);
  });

  it('reshaping keeps every point where it was dragged, and the box fits the band', () => {
    const o = { x: 520, y: 310, width: 240, height: 240, rotation: 30 };
    const p = [0, 60, 240, 60, 380, 160, 460, 450];
    const f = reshapedFields(o, p, 120);
    const after = { ...o, ...f };
    const q = curvePx(after, 120);
    for (let k = 0; k < 4; k++) {
      const a = toWorld(o, p[k * 2], p[k * 2 + 1]);
      const b = toWorld(after, q[k * 2], q[k * 2 + 1]);
      expect(Math.hypot(a[0] - b[0], a[1] - b[1])).toBeLessThan(0.5);
    }
    for (const v of f.curve) expect(v).toBeGreaterThanOrEqual(-0.01);
  });

  it('a very tight bend is still one clean band', () => {
    const rings = curveOutline([0, 0, 200, 0, 200, 20, 0, 20], 120);
    expect(rings.length).toBe(1);
    expect(Math.abs(ringsArea(rings))).toBeGreaterThan(0);
  });
});
