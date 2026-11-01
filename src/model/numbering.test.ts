import { describe, expect, it } from 'vitest';
import { formatIdentifier, parseIdentifier, renumberSequential, rowLabels } from './numbering';

describe('identifier numbering', () => {
  it('formats plain, prefixed and zero-padded identifiers', () => {
    expect(rowLabels({ start: 1, prefix: '', suffix: '', digits: 1, count: 4, reverse: false })).toEqual(['1', '2', '3', '4']);
    expect(rowLabels({ start: 1, prefix: 'A', suffix: '', digits: 1, count: 3, reverse: false })).toEqual(['A1', 'A2', 'A3']);
    expect(rowLabels({ start: 1, prefix: 'B', suffix: '', digits: 2, count: 3, reverse: false })).toEqual(['B01', 'B02', 'B03']);
    expect(rowLabels({ start: 9, prefix: 'L2-', suffix: 'V', digits: 2, count: 3, reverse: false })).toEqual(['L2-09V', 'L2-10V', 'L2-11V']);
  });

  it('generates 20 spaces numbered 1-20', () => {
    const labels = rowLabels({ start: 1, prefix: '', suffix: '', digits: 1, count: 20, reverse: false });
    expect(labels).toHaveLength(20);
    expect(labels[0]).toBe('1');
    expect(labels[19]).toBe('20');
  });

  it('reverses numbering direction', () => {
    expect(rowLabels({ start: 1, prefix: 'A', suffix: '', digits: 1, count: 3, reverse: true })).toEqual(['A3', 'A2', 'A1']);
  });

  it('does not truncate numbers longer than the padding', () => {
    expect(formatIdentifier({ start: 100, prefix: 'B', suffix: '', digits: 2 }, 0)).toBe('B100');
  });

  it('parses identifiers using the last run of digits', () => {
    expect(parseIdentifier('B016')).toEqual({ prefix: 'B', number: 16, digits: 3, suffix: '' });
    expect(parseIdentifier('L2-A14')).toEqual({ prefix: 'L2-A', number: 14, digits: 2, suffix: '' });
    expect(parseIdentifier('12R')).toEqual({ prefix: '', number: 12, digits: 2, suffix: 'R' });
    expect(parseIdentifier('VIP')).toBeNull();
  });

  it('renumbers copies after the highest existing number', () => {
    const existing = ['A1', 'A2', 'A3', 'B1'];
    expect(renumberSequential(['A1', 'A2', 'A3'], existing)).toEqual(['A4', 'A5', 'A6']);
    expect(renumberSequential(['B01'], existing)).toEqual(['B02']);
  });

  it('never returns an identifier that already exists', () => {
    expect(renumberSequential(['7'], ['7', '8', '9'])).toEqual(['10']);
    const out = renumberSequential(['5', '5', '5'], ['5']);
    expect(new Set(out).size).toBe(3);
    expect(out).not.toContain('5');
  });
});
