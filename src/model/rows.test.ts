import { describe, expect, it } from 'vitest';
import { createFloor } from './factory';
import { buildRowSpaces, DEFAULT_ROW, normalizeRows, regenerateRow, rowSpaces } from './rows';
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
});
