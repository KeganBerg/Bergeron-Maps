import { describe, expect, it } from 'vitest';
import { cutForObject, localOutline, maxCorner, mergeOutlines, ringsArea } from './shape';

const box = { x: 50, y: 25, width: 100, height: 50, rotation: 0 };

describe('shape outlines', () => {
  it('rounds corners: area shrinks by the corner cut-offs', () => {
    const plain = ringsArea(localOutline({ width: 100, height: 50 }));
    const round = ringsArea(localOutline({ width: 100, height: 50, corner: 10 }));
    expect(plain).toBeCloseTo(5000, 0);
    // Each rounded corner removes r²(1 − π/4) ≈ 21.5.
    expect(round).toBeGreaterThan(5000 - 4 * 21.5 - 20);
    expect(round).toBeLessThan(5000 - 4 * 21.5 + 20);
  });

  it('bevels corners when asked', () => {
    const bevel = ringsArea(localOutline({ width: 100, height: 50, corner: 10, bevel: true }));
    expect(bevel).toBeLessThan(5000 - 60);
  });

  it('draws circles, half circles, quarter rounds, curved bands and L corners', () => {
    expect(ringsArea(localOutline({ width: 100, height: 100, outline: 'ellipse' }))).toBeCloseTo(Math.PI * 2500, -2);
    expect(ringsArea(localOutline({ width: 100, height: 50, outline: 'half' }))).toBeCloseTo((Math.PI * 2500) / 2, -2);
    expect(ringsArea(localOutline({ width: 100, height: 100, outline: 'quarter' }))).toBeCloseTo((Math.PI * 10000) / 4, -2);
    const band = ringsArea(localOutline({ width: 100, height: 100, outline: 'arc', band: 20 }));
    expect(band).toBeCloseTo((Math.PI * (10000 - 6400)) / 4, -2);
    expect(ringsArea(localOutline({ width: 100, height: 100, outline: 'L', band: 20 }))).toBeCloseTo(100 * 20 + 80 * 20, -1);
  });

  it('caps the corner so thin pieces never vanish', () => {
    expect(maxCorner({ width: 200, height: 30 })).toBe(14);
    expect(ringsArea(localOutline({ width: 200, height: 30, corner: 999 }))).toBeGreaterThan(4000);
  });

  it('cuts an L shape out of a rectangle', () => {
    const cut = cutForObject(box, [50, 0, 100, 0, 100, 25, 50, 25]);
    expect(cut).not.toBeNull();
    expect(ringsArea(localOutline({ ...box, cuts: [cut!] }))).toBeCloseTo(5000 - 50 * 25, 0);
    expect(cutForObject(box, [500, 500, 600, 500, 600, 600])).toBeNull();
  });

  it('merges overlapping pieces into one outline, and bridges near ones', () => {
    const a = { x: 50, y: 15, width: 100, height: 30, rotation: 0 };
    const b = { x: 130, y: 15, width: 100, height: 30, rotation: 0 }; // overlaps a by 20
    const merged = mergeOutlines([a, b]);
    expect(merged).toHaveLength(1);
    expect(ringsArea(merged)).toBeCloseTo(180 * 30, -1);
    const far = { ...b, x: 158 }; // 8 px gap, under the default blend
    expect(mergeOutlines([a, far])).toHaveLength(1);
    const veryFar = { ...b, x: 400 };
    expect(mergeOutlines([a, veryFar])).toHaveLength(2);
  });
});
