import { describe, expect, it } from 'vitest';
import { createQuickLot } from './quickLot';
import { floorListing } from './listing';

describe('floorListing', () => {
  it('lists places first, then each row of spaces in order', () => {
    const doc = createQuickLot('List Lot', { floors: 2, rows: 3, spacesPerRow: 5, accessible: 1 });
    const groups = floorListing(doc, doc.floors[0]);
    expect(groups[0].title).toBe('Places');
    expect(groups[0].items.some((i) => /entrance/i.test(i.title))).toBe(true);
    const rows = groups.slice(1);
    expect(rows).toHaveLength(3);
    expect(rows.every((g) => g.items.length === 5)).toBe(true);
    expect(rows[0].title).toMatch(/^Row: spaces \S+ to \S+$/);
    expect(rows.flatMap((g) => g.items).some((i) => i.detail === 'Accessible')).toBe(true);
  });

  it('leaves out hidden spaces and hidden layers', () => {
    const doc = createQuickLot('List Lot', { floors: 1, rows: 1, spacesPerRow: 4, accessible: 0 });
    const f = doc.floors[0];
    const spaces = f.objects.filter((o) => o.kind === 'space');
    spaces[0].hidden = true;
    const count = floorListing(doc, f).filter((g) => g.title !== 'Places').flatMap((g) => g.items).length;
    expect(count).toBe(3);
    for (const l of f.layers) l.visible = false;
    expect(floorListing(doc, f)).toHaveLength(0);
  });
});

describe('floorListing places', () => {
  it('leaves driving lanes and roads out of the places', () => {
    const doc = createQuickLot('List Lot', { floors: 1, rows: 2, spacesPerRow: 3, accessible: 0 });
    const places = floorListing(doc, doc.floors[0]).find((g) => g.title === 'Places')!;
    expect(places.items.some((i) => /lane|road/i.test(i.title))).toBe(false);
  });
});
