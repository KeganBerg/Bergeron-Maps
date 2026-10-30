import { describe, expect, it } from 'vitest';
import { snapMove } from './snapping';

const box = (x: number, y: number, width = 40, height = 40) => ({ x, y, width, height });
const opts = { threshold: 6, gridSize: 10 };

describe('snapping', () => {
  it('free placement never adjusts the move', () => {
    const r = snapMove('free', box(0, 0), 97.3, 3.1, [box(100, 0)], opts);
    expect(r).toEqual({ dx: 97.3, dy: 3.1, guides: [] });
  });

  it('grid snapping rounds the top-left corner to the grid', () => {
    const r = snapMove('grid', box(0, 0), 14, 26, [], opts);
    expect(r.dx).toBe(10);
    expect(r.dy).toBe(30);
  });

  it('smart snapping aligns edges with a nearby object and shows a guide', () => {
    // Moving box ends up with left edge at 103, other object's left edge is at 100.
    const r = snapMove('smart', box(0, 200), 103, 0, [box(100, 0)], opts);
    expect(r.dx).toBe(100);
    expect(r.guides.some((g) => g.orientation === 'vertical' && g.at === 100)).toBe(true);
  });

  it('smart snapping aligns centers', () => {
    const r = snapMove('smart', box(0, 0, 20, 20), 0, 112, [box(300, 100, 40, 40)], opts);
    // other center y = 120, moving center y = 112 + 10 = 122 -> snaps to 120
    expect(r.dy).toBe(110);
  });

  it('does not snap to objects beyond the threshold', () => {
    const r = snapMove('smart', box(0, 200), 70, 0, [box(100, 0)], opts);
    expect(r.dx).toBe(70);
    expect(r.guides).toHaveLength(0);
  });

  it('snaps to equal spacing between two neighbors', () => {
    // neighbors at [0,40] and [200,240]; moving width 40 -> centered gap means x = 100
    const r = snapMove('smart', box(500, 500), -403, -500, [box(0, 0), box(200, 0)], { threshold: 6, gridSize: 10 });
    expect(r.dx + 500).toBe(100);
    expect(r.guides.some((g) => g.kind === 'spacing')).toBe(true);
  });
});
