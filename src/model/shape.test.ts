import { describe, expect, it } from 'vitest';
import { cutForObject, localOutline, maxCorner, mergeClusters, mergeOutlines, ringsArea } from './shape';

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

  it('joins overlapping pieces with sharp corners, no rounded notches', () => {
    // Two overlapping rectangles making a step shape, like two dirt areas.
    const a = { x: 67, y: 42, width: 134, height: 84, rotation: 0 };
    const b = { x: 185, y: -6, width: 134, height: 84, rotation: 0 };
    const merged = mergeOutlines([a, b]);
    expect(merged).toHaveLength(1);
    const overlap = (134 - 118) * (84 - 48);
    expect(ringsArea(merged)).toBeCloseTo(2 * 134 * 84 - overlap, -1);
  });

  it('irons out 1 px steps where hand-placed pieces meet', () => {
    const post = { x: 14, y: 50, width: 28, height: 100, rotation: 0 }; // bottom at 100
    const strip = { x: 54, y: 86.5, width: 80, height: 29, rotation: 0 }; // bottom at 101
    const [ring] = mergeOutlines([post, strip]);
    // The strip's bottom (y=101) was lined up with the post's (y=100): nothing pokes below 100.
    const ys = ring.filter((_, i) => i % 2 === 1);
    expect(Math.max(...ys)).toBeLessThan(100.2);
  });

  it('keeps far-apart pieces in separate clusters', () => {
    const a = { x: 50, y: 15, width: 100, height: 30, rotation: 0 };
    const b = { x: 500, y: 15, width: 100, height: 30, rotation: 0 };
    const c = { x: 600, y: 15, width: 100, height: 30, rotation: 0 };
    expect(mergeClusters([a, b, c]).map((k) => k.members)).toEqual([[0], [1, 2]]);
  });
});
