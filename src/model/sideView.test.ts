import { describe, expect, it } from 'vitest';
import { createQuickLot } from './quickLot';
import { findRoute } from './route';
import { isBasement, sideView, stackFloors } from './sideView';
import { createFloor } from './factory';

describe('side view of the floors', () => {
  it('stacks every floor with its color, spaces and the connectors between them', () => {
    const doc = createQuickLot('Garage', { floors: 4, rows: 4, spacesPerRow: 10, accessible: 0 });
    const m = sideView(doc, doc.floors);
    expect(m.floors.map((f) => f.name)).toEqual(['Floor 1', 'Floor 2', 'Floor 3', 'Floor 4']);
    expect(m.floors.map((f) => f.colorIndex)).toEqual([0, 1, 2, 3]);
    expect(m.floors.every((f) => f.spaces > 0 && f.parked.length > 0)).toBe(true);
    expect(m.ground).toBe(0);
    expect(m.links.length).toBeGreaterThan(0);
    // Every pair of floors next to each other is connected by something.
    for (let l = 0; l < 3; l++) expect(m.links.some((k) => k.from <= l && k.to >= l + 1)).toBe(true);
    for (const k of m.links) {
      expect(k.x0).toBeGreaterThanOrEqual(0);
      expect(k.x1).toBeLessThanOrEqual(1);
      expect(k.from).toBeLessThan(k.to);
    }
  });

  it('marks the found space with its floor and the nearest named stairs', () => {
    const doc = createQuickLot('Garage', { floors: 3, rows: 4, spacesPerRow: 10, accessible: 0 });
    const f = doc.floors[2];
    const sp = f.objects.find((o) => o.kind === 'space')!;
    const stairs = f.objects.find((o) => o.kind === 'asset' && o.assetKey.startsWith('stairs'));
    if (stairs) stairs.name = 'North stairs';
    const m = sideView(doc, doc.floors, { focusId: sp.id });
    expect(m.mark?.level).toBe(2);
    expect(m.mark?.space).toBe(true);
    expect(m.mark?.text).toContain(`${sp.kind === 'space' ? sp.label : ''}, Floor 3`);
    if (stairs) expect(m.mark?.text).toContain('North stairs');
  });

  it('draws a route that changes floors', () => {
    const doc = createQuickLot('Garage', { floors: 3, rows: 4, spacesPerRow: 10, accessible: 0 });
    const a = doc.floors[0].objects.find((o) => o.name === 'Entrance')!;
    const b = doc.floors[2].objects.find((o) => o.kind === 'space')!;
    const r = findRoute(doc, { floorId: doc.floors[0].id, objectId: a.id, x: a.x, y: a.y }, { floorId: doc.floors[2].id, objectId: b.id, x: b.x, y: b.y });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const m = sideView(doc, doc.floors, { route: r.route, focusId: b.id });
    const levels = m.route!.points.map((p) => p[1]);
    expect(levels[0]).toBe(0);
    expect(levels[levels.length - 1]).toBe(2);
    expect(m.route!.points.length).toBeGreaterThanOrEqual(4);
  });

  it('puts basements under the ground line, deepest at the bottom', () => {
    const names = ['Ground', 'Level 2', 'B1', 'B2'];
    const floors = names.map((n) => createFloor(n));
    expect(stackFloors(floors).map((f) => f.name)).toEqual(['B2', 'B1', 'Ground', 'Level 2']);
    expect(['Basement', 'B1', 'P-1', 'Lower level', 'LL2', 'Level -1'].every(isBasement)).toBe(true);
    expect(['Level 1', 'Floor 2', 'P1', 'Roof', 'Ballroom', 'Lobby'].some(isBasement)).toBe(false);
    const m = sideView({ floors } as never, floors);
    expect(m.ground).toBe(2);
    // Colors follow the editor's floor order, not the stacking.
    expect(m.floors.map((f) => f.colorIndex)).toEqual([3, 2, 0, 1]);
  });

  it('copes with empty floors and floors with no connectors', () => {
    const floors = [createFloor('Floor 1'), createFloor('Floor 2')];
    const m = sideView({ floors } as never, floors, { focusId: 'nope' });
    expect(m.links).toEqual([]);
    expect(m.mark).toBeUndefined();
    expect(m.floors.every((f) => f.spaces === 0)).toBe(true);
  });
});
