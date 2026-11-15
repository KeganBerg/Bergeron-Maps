import { describe, expect, it } from 'vitest';
import { createFloor } from './factory';
import { angledSpecFrom, buildRowSpaces, DEFAULT_ROW, normalizeRows, regenerateRow, rowGeometry, rowSpaces } from './rows';
import type { Floor, RowSpec } from './types';

const spec = (over: Partial<RowSpec> = {}): RowSpec => ({ ...DEFAULT_ROW, id: 'row_1', ...over });

function floorWithRow(over: Partial<RowSpec> = {}, rotation = 0): Floor {
  const f = createFloor('Floor 1');
  const s = spec(over);
  f.rows[s.id] = s;
  f.objects.push(...buildRowSpaces(s, { x: 100, y: 100, rotation }, f.layers[2].id));
  return f;
}

describe('row generator', () => {
  it('creates the requested number of spaces side by side', () => {
    const f = floorWithRow({ count: 20, gap: 5 });
    const spaces = rowSpaces(f, 'row_1');
    expect(spaces).toHaveLength(20);
    expect(spaces.map((s) => s.label).slice(0, 3)).toEqual(['1', '2', '3']);
    expect(spaces[1].x - spaces[0].x).toBe(DEFAULT_ROW.spaceWidth + 5);
    expect(spaces.every((s) => s.y === 100)).toBe(true);
  });

  it('lays out rotated rows along the rotation direction', () => {
    const f = floorWithRow({ count: 3 }, 90);
    const [a, b] = rowSpaces(f, 'row_1');
    expect(b.x).toBeCloseTo(a.x);
    expect(b.y - a.y).toBeCloseTo(DEFAULT_ROW.spaceWidth);
    expect(b.rotation).toBe(90);
  });

  it('adds and removes spaces without moving the first space', () => {
    const f = floorWithRow({ count: 5 });
    const firstId = rowSpaces(f, 'row_1')[0].id;
    regenerateRow(f, 'row_1', { count: 8 });
    let spaces = rowSpaces(f, 'row_1');
    expect(spaces).toHaveLength(8);
    expect(spaces[0].id).toBe(firstId);
    expect(spaces[0].x).toBe(100);
    expect(spaces[7].label).toBe('8');
    regenerateRow(f, 'row_1', { count: 2 });
    spaces = rowSpaces(f, 'row_1');
    expect(spaces).toHaveLength(2);
    expect(f.objects.filter((o) => o.kind === 'space')).toHaveLength(2);
  });

  it('changes numbering, spacing, size and direction in place', () => {
    const f = floorWithRow({ count: 3 });
    regenerateRow(f, 'row_1', { prefix: 'B', digits: 2, start: 10, reverse: true, gap: 10, spaceWidth: 50 });
    const spaces = rowSpaces(f, 'row_1');
    expect(spaces.map((s) => s.label)).toEqual(['B12', 'B11', 'B10']);
    expect(spaces[1].x - spaces[0].x).toBe(60);
    expect(spaces[0].width).toBe(50);
  });

  it('keeps a moved row where it is when settings change', () => {
    const f = floorWithRow({ count: 3 });
    for (const o of f.objects) o.x += 500;
    regenerateRow(f, 'row_1', { count: 4 });
    expect(rowSpaces(f, 'row_1')[0].x).toBe(600);
  });

  it('normalizes rows after deleting spaces', () => {
    const f = floorWithRow({ count: 4 });
    f.objects = f.objects.filter((o) => !(o.kind === 'space' && o.label === '2'));
    normalizeRows(f);
    expect(f.rows.row_1.count).toBe(3);
    expect(rowSpaces(f, 'row_1').map((s) => s.rowIndex)).toEqual([0, 1, 2]);
    f.objects = [];
    normalizeRows(f);
    expect(f.rows.row_1).toBeUndefined();
  });

  it('builds angled rows as leaning stalls that touch edge to edge', () => {
    const f = floorWithRow({ count: 4, angle: 60 });
    const spaces = rowSpaces(f, 'row_1');
    const g = rowGeometry({ ...DEFAULT_ROW, angle: 60 });
    expect(spaces.every((s) => s.variant === 'angled')).toBe(true);
    // 45 px stall square to its lines takes 45 / sin 60° along the row.
    expect(g.along).toBeCloseTo(51.96, 1);
    expect(spaces[0].skew).toBeCloseTo(90 / Math.tan(Math.PI / 3), 1);
    expect(spaces[1].x - spaces[0].x).toBeCloseTo(g.along, 5);
    expect(spaces[0].width).toBeCloseTo(g.along + (spaces[0].skew ?? 0), 1);
  });

  it('leans angled rows the other way', () => {
    const f = floorWithRow({ count: 2, angle: 45, lean: 'left' });
    expect(rowSpaces(f, 'row_1')[0].skew).toBeCloseTo(-90, 1);
  });

  it('switches a row between straight and angled, keeping its look and number size', () => {
    const f = floorWithRow({ count: 3 });
    for (const s of rowSpaces(f, 'row_1')) {
      s.labelScale = 1.5;
      s.stroke = '#ff0000';
    }
    rowSpaces(f, 'row_1')[1].variant = 'ev';
    regenerateRow(f, 'row_1', { angle: 45 });
    let spaces = rowSpaces(f, 'row_1');
    expect(spaces.map((s) => s.variant)).toEqual(['angled', 'angled', 'angled']);
    expect(spaces.every((s) => s.labelScale === 1.5 && s.stroke === '#ff0000')).toBe(true);
    regenerateRow(f, 'row_1', { angle: 90, count: 4 });
    spaces = rowSpaces(f, 'row_1');
    expect(spaces.map((s) => s.variant)).toEqual([undefined, undefined, undefined, undefined]);
    expect(spaces[3].labelScale).toBe(1.5);
    expect(spaces[0].skew).toBeUndefined();
    expect(spaces[0].width).toBe(DEFAULT_ROW.spaceWidth);
  });

  it('keeps space types when a straight row is renumbered', () => {
    const f = floorWithRow({ count: 3 });
    rowSpaces(f, 'row_1')[1].variant = 'ev';
    regenerateRow(f, 'row_1', { prefix: 'A' });
    expect(rowSpaces(f, 'row_1')[1].variant).toBe('ev');
  });

  it('reads an angled row back from a drawn space', () => {
    const g = rowGeometry({ ...DEFAULT_ROW, angle: 60 });
    const back = angledSpecFrom(g.width, DEFAULT_ROW.spaceDepth, g.skew);
    expect(back.angle).toBeCloseTo(60, 0);
    expect(back.spaceWidth).toBeCloseTo(45, 0);
  });
});
