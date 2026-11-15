import { describe, expect, it } from 'vitest';
import { createQuickLot } from './quickLot';
import { feet, findRoute, floorGrid, startPlaces, cellAt } from './route';
import type { MapDocument, MapObject } from './types';

const space = (doc: MapDocument, floor: number, label: string) => {
  const f = doc.floors[floor];
  const o = f.objects.find((x) => x.kind === 'space' && x.label === label)!;
  return { floorId: f.id, objectId: o.id, x: o.x, y: o.y, o };
};
const named = (doc: MapDocument, floor: number, name: string) => {
  const f = doc.floors[floor];
  const o = f.objects.find((x) => x.name === name)!;
  return { floorId: f.id, objectId: o.id, x: o.x, y: o.y, o };
};

/** Does the line ever pass over a parking space other than the end ones? */
function crossesSpaces(points: number[], objects: MapObject[], except: string[]) {
  const spaces = objects.filter((o) => o.kind === 'space' && !except.includes(o.id) && o.rotation === 0);
  for (let i = 2; i < points.length; i += 2) {
    const [ax, ay, bx, by] = [points[i - 2], points[i - 1], points[i], points[i + 1]];
    const n = Math.ceil(Math.hypot(bx - ax, by - ay) / 3);
    for (let s = 0; s <= n; s++) {
      const x = ax + ((bx - ax) * s) / n, y = ay + ((by - ay) * s) / n;
      const hit = spaces.find((o) => Math.abs(x - o.x) < o.width / 2 - 3 && Math.abs(y - o.y) < o.height / 2 - 3);
      if (hit) return hit;
    }
  }
  return null;
}

describe('walking directions', () => {
  it('walks from the entrance to a space along the drive lanes, never over other spaces', () => {
    const doc = createQuickLot('Lot', { floors: 1, rows: 4, spacesPerRow: 12, accessible: 0 });
    const from = named(doc, 0, 'Entrance');
    const to = space(doc, 0, 'D7');
    const r = findRoute(doc, from, to);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.route.legs).toHaveLength(1);
    expect(r.route.squeezed).toBe(false);
    const pts = r.route.legs[0].points;
    expect(pts.slice(0, 2)).toEqual([from.x, from.y]);
    expect(pts.slice(-2)).toEqual([to.x, to.y]);
    expect(crossesSpaces(pts, doc.floors[0].objects, [to.objectId])).toBeNull();
    expect(r.route.steps.map((s) => s.text)).toEqual(['Walk to Space D7']);
    expect(feet(r.route.length)).toBeGreaterThan(50);
  });

  it('takes the elevator or stairs between floors, with a step per floor', () => {
    const doc = createQuickLot('Garage', { floors: 3, rows: 2, spacesPerRow: 10, accessible: 0 });
    const from = named(doc, 0, 'Entrance');
    const to = space(doc, 2, '3B5');
    const r = findRoute(doc, from, to);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const texts = r.route.steps.map((s) => s.text);
    expect(texts[0]).toMatch(/^Walk to (Elevator|Stairway) 1$/);
    expect(texts[1]).toMatch(/^Take (Elevator|Stairway) 1 up to Floor 3$/);
    expect(texts[2]).toBe('Walk to Space 3B5');
    expect(r.route.legs.map((l) => l.floorId)).toEqual([doc.floors[0].id, doc.floors[2].id]);
    expect(crossesSpaces(r.route.legs[1].points, doc.floors[2].objects, [to.objectId])).toBeNull();
    // Step-free: no stairs.
    const sf = findRoute(doc, from, to, { avoidStairs: true });
    expect(sf.ok && sf.route.steps.some((s) => s.kind === 'stairs')).toBe(false);
    expect(sf.ok && sf.route.steps.some((s) => s.kind === 'elevator' || s.kind === 'ramp')).toBe(true);
  });

  it('comes back down too, and starts from a tapped spot', () => {
    const doc = createQuickLot('Garage', { floors: 2, rows: 2, spacesPerRow: 6, accessible: 0 });
    const s = space(doc, 1, '2A3');
    const r = findRoute(doc, { floorId: s.floorId, x: s.x, y: s.y + 120 }, named(doc, 0, 'Exit'));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.route.steps.some((x) => / down to Floor 1$/.test(x.text))).toBe(true);
  });

  it('says so when you are already there, and when there is no way', () => {
    const doc = createQuickLot('Lot', { floors: 1, rows: 2, spacesPerRow: 4, accessible: 0 });
    const a = space(doc, 0, 'A1');
    expect(findRoute(doc, a, a)).toEqual({ ok: false, reason: 'same' });
    // A wall all the way round the destination.
    const f = doc.floors[0];
    const t = space(doc, 0, 'B4').o;
    const layerId = f.layers.find((l) => l.role === 'structure')!.id;
    const wall = (x: number, y: number, w: number, h: number) =>
      f.objects.push({ id: `w${x}${y}`, kind: 'asset', assetKey: 'wall', layerId, x, y, width: w, height: h, rotation: 0 });
    wall(t.x, t.y - 70, 160, 10); wall(t.x, t.y + 70, 160, 10); wall(t.x - 75, t.y, 10, 150); wall(t.x + 75, t.y, 10, 150);
    expect(findRoute({ ...doc }, a, space(doc, 0, 'B4'))).toEqual({ ok: false, reason: 'none' });
  });

  it('goes through a door, not through a wall', () => {
    const doc = createQuickLot('Lot', { floors: 1, rows: 1, spacesPerRow: 1, accessible: 0 });
    const f = doc.floors[0];
    f.objects = [];
    const structure = f.layers.find((l) => l.role === 'structure')!.id;
    const add = (o: Partial<MapObject> & { assetKey: string; x: number; y: number; width: number; height: number }) =>
      f.objects.push({ id: `o${f.objects.length}`, kind: 'asset', layerId: structure, rotation: 0, ...o } as MapObject);
    // A long wall between two points, with one door near its far end.
    add({ assetKey: 'wall', x: 0, y: 0, width: 10, height: 600 });
    add({ assetKey: 'wall', x: 0, y: -400, width: 10, height: 200 });
    add({ assetKey: 'wall', x: 0, y: 400, width: 10, height: 200 });
    add({ assetKey: 'double-door', x: 0, y: -280, width: 36, height: 18, rotation: 90, name: 'Back door' });
    add({ assetKey: 'pin-general', x: -200, y: 0, width: 30, height: 30, name: 'A' });
    add({ assetKey: 'pin-general', x: 200, y: 0, width: 30, height: 30, name: 'B' });
    // Wall is from y=-500 to 500 except the door gap; the route goes round by the door.
    const g = floorGrid(f);
    expect(g.cost[cellAt(g, 0, 0)]).toBe(0);
    const r = findRoute(doc, { floorId: f.id, x: -200, y: 0 }, { floorId: f.id, x: 200, y: 0 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const ys = r.route.legs[0].points.filter((_, i) => i % 2 === 1);
    expect(Math.min(...ys)).toBeLessThan(-250);
  });

  it('lists places to start from', () => {
    const doc = createQuickLot('Garage', { floors: 2, rows: 2, spacesPerRow: 6, accessible: 0 });
    const names = startPlaces(doc).map((p) => p.name);
    expect(names).toEqual(expect.arrayContaining(['Entrance', 'Exit', 'Elevator 1', 'Stairway 1']));
  });

  it('stays quick on a 12-level garage with 2,080 spaces a level', () => {
    const doc = createQuickLot('Big', { floors: 12, rows: 26, spacesPerRow: 80, accessible: 0 });
    const t = performance.now();
    const r = findRoute(doc, named(doc, 0, 'Entrance'), space(doc, 11, '12Z80'));
    const ms = performance.now() - t;
    expect(r.ok).toBe(true);
    expect(ms).toBeLessThan(3000);
    console.log(`12 x 2,080 spaces: ${Math.round(ms)} ms`);
  });
});

describe('directions into a building', () => {
  it('walks to the building entrance, goes inside, and on to the room', async () => {
    const { createInteriorFloor } = await import('./interiors');
    const doc = createQuickLot('Campus', { floors: 1, rows: 2, spacesPerRow: 6, accessible: 0 });
    const site = doc.floors[0];
    const structure = site.layers.find((l) => l.role === 'structure')!.id;
    const landmarks = site.layers.find((l) => l.role === 'landmarks')!.id;
    const building = { id: 'bld', kind: 'asset', assetKey: 'office-building', layerId: structure, x: 600, y: 150, width: 240, height: 160, rotation: 0, name: 'Main office' } as MapObject;
    const door = { id: 'bdoor', kind: 'asset', assetKey: 'building-entrance', layerId: landmarks, x: 600, y: 240, width: 70, height: 44, rotation: 180, name: 'Front door' } as MapObject;
    site.objects.push(building, door);
    const inside = createInteriorFloor(doc, building as never);
    doc.floors.push(inside);
    const shell = inside.objects[0];
    const s2 = inside.layers.find((l) => l.role === 'structure')!.id;
    // A front door on the bottom wall, below the middle, and a room in the top corner.
    inside.objects.push({ id: 'idoor', kind: 'asset', assetKey: 'double-door', layerId: s2, x: shell.x, y: shell.y + shell.height / 2, width: 36, height: 18, rotation: 0, name: 'Lobby doors' } as MapObject);
    inside.objects.push({ id: 'room', kind: 'asset', assetKey: 'conference-room', layerId: s2, x: shell.x - shell.width / 2 + 80, y: shell.y - shell.height / 2 + 70, width: 120, height: 100, rotation: 0, name: 'Board room' } as MapObject);
    const a1 = site.objects.find((o) => o.kind === 'space' && o.label === 'A1')!;
    const r = findRoute(doc, { floorId: site.id, objectId: a1.id, x: a1.x, y: a1.y }, { floorId: inside.id, objectId: 'room', x: 0, y: 0 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.route.steps.map((s) => s.text)).toEqual(['Walk to Front door', 'Go inside Main office', 'Walk to Board room']);
    // Back out again.
    const back = findRoute(doc, { floorId: inside.id, objectId: 'room', x: 0, y: 0 }, { floorId: site.id, objectId: a1.id, x: a1.x, y: a1.y });
    expect(back.ok && back.route.steps.map((s) => s.text)).toEqual(['Walk to Lobby doors', 'Leave Main office', 'Walk to Space A1']);
  });
});
