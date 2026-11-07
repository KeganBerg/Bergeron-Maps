import { describe, expect, it } from 'vitest';
import { cutForObject, localOutline, maxCorner, mergeClusters, mergeOutlines, ringsArea, insetLines } from './shape';

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

describe('insetLines (merged road edge lines)', () => {
  // A T junction: a road along the top, a road coming down from its middle.
  const across = { x: 150, y: 30, width: 300, height: 60, rotation: 0 };
  const down = { x: 150, y: 125, width: 140, height: 60, rotation: 90 };
  const ends = [
    [0, 0, 0, 60], [300, 0, 300, 60], // across: left and right ends
    [120, 55, 180, 55], [120, 195, 180, 195], // down: top end (inside the junction) and bottom end
  ];
  const round = (l: number[]) => l.map((v) => Math.round(v * 10) / 10);

  it('runs one line along the far edge, end to end, and turns the corners into the side road', () => {
    const [cluster] = mergeClusters([{ ...across, blend: 0 }, { ...down, blend: 0 }]);
    const lines = insetLines(cluster.rings, ends, 3.5).map(round);
    expect(lines).toHaveLength(3);
    // Far edge: straight across at y = 3.5, from end to end.
    const top = lines.find((l) => l.every((v, i) => i % 2 === 0 || Math.abs(v - 3.5) <= 0.2));
    expect(top).toBeDefined();
    expect(Math.min(...top!.filter((_, i) => i % 2 === 0))).toBe(0);
    expect(Math.max(...top!.filter((_, i) => i % 2 === 0))).toBe(300);
    // No line crosses the open ends or the junction mouth.
    for (const l of lines) for (let i = 1; i < l.length; i += 2) expect(l[i] <= 195).toBe(true);
    const mouth = lines.flatMap((l) => l.filter((_, i) => i % 2 === 1)).filter((y) => Math.abs(y - 56.5) < 0.2);
    expect(mouth.length).toBeGreaterThan(0); // the near edge line still runs on both sides of the side road
  });

  it('draws a closed loop when nothing is open', () => {
    const lines = insetLines([[0, 0, 100, 0, 100, 50, 0, 50]], [], 3.5).map(round);
    expect(lines).toHaveLength(1);
    expect(lines[0].slice(0, 2)).toEqual(lines[0].slice(-2));
  });
});
