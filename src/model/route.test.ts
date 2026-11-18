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

/** Points every few px along a line. */
function sampled(p: number[]): number[] {
  const out: number[] = [];
  for (let i = 2; i < p.length; i += 2) {
    const n = Math.max(1, Math.ceil(Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1]) / 4));
    for (let s = 0; s < n; s++) out.push(p[i - 2] + ((p[i] - p[i - 2]) * s) / n, p[i - 1] + ((p[i + 1] - p[i - 1]) * s) / n);
  }
  return out;
}

describe('clean, smooth routes', () => {
  /** A lot like a real school lot: a lane on the left, angled rows back to back, a drive aisle, bare ground around. */
  async function schoolLot() {
    const { createMap } = await import('./factory');
    const { buildRowSpaces, DEFAULT_ROW } = await import('./rows');
    const { ASSET_BY_KEY } = await import('../assets/library');
    const doc = createMap('School');
    const f = doc.floors[0];
    const L = (role: string) => f.layers.find((l) => l.role === role)!.id;
    let n = 0;
    const A = (key: string, x: number, y: number, width: number, height: number, rotation = 0, name?: string) =>
      f.objects.push({ id: `a${n++}`, kind: 'asset', assetKey: key, layerId: L(ASSET_BY_KEY[key].layer), x, y, width, height, rotation, name });
    A('straight-road', 60, 300, 1300, 110, 90); // left lane, center x = 60
    A('straight-road', 800, 280, 1500, 110); // drive aisle, center y = 280
    A('pin-general', -500, -400, 40, 40, 0, 'Gate');
    for (const [prefix, y, start, reverse] of [['B', 50, 1, false], ['B', 140, 31, true]] as const) {
      const row = { ...DEFAULT_ROW, id: `r${y}`, count: 30, start, prefix, angle: 60, reverse };
      f.rows[row.id] = row;
      f.objects.push(...buildRowSpaces(row, { x: 180, y, rotation: 0 }, L('spaces')));
    }
    return { doc, f };
  }

  it('runs down the middle of the drive aisle and goes into the stall along it, ending on the space', async () => {
    const { doc, f } = await schoolLot();
    const gate = f.objects.find((o) => o.name === 'Gate')!;
    const b45 = f.objects.find((o) => o.kind === 'space' && o.label === 'B45')!;
    const r = findRoute(doc, { floorId: f.id, objectId: gate.id, x: gate.x, y: gate.y }, { floorId: f.id, objectId: b45.id, x: b45.x, y: b45.y });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const p = r.route.legs[0].points;
    expect(p.slice(-2)).toEqual([b45.x, b45.y]);
    const at = sampled(p);
    // Along the aisle (until the bend into the stall), the line keeps to the center line.
    const along: number[] = [];
    for (let i = 0; i < at.length; i += 2) if (at[i] > 200 && at[i] < b45.x - 120) along.push(at[i + 1]);
    expect(along.length).toBeGreaterThan(0);
    for (const y of along) expect(Math.abs(y - 280)).toBeLessThan(6);
    // Down the left lane, it keeps to its center line too.
    const down: number[] = [];
    for (let i = 0; i < at.length; i += 2) if (at[i + 1] > -150 && at[i + 1] < 200 && at[i] < 400) down.push(at[i]);
    for (const x of down) expect(Math.abs(x - 60)).toBeLessThan(6);
    // The last stretch runs along the stall (60 degrees), not along the row's edge.
    const n = p.length;
    const ang = (Math.atan2(Math.abs(p[n - 1] - p[n - 5]), Math.abs(p[n - 2] - p[n - 6])) * 180) / Math.PI;
    expect(ang).toBeGreaterThan(50);
    expect(ang).toBeLessThan(70);
    // No sharp corners: every turn is rounded.
    for (let i = 2; i < n - 2; i += 2) {
      const a = Math.atan2(p[i + 1] - p[i - 1], p[i] - p[i - 2]), b = Math.atan2(p[i + 3] - p[i + 1], p[i + 2] - p[i]);
      let d = Math.abs(a - b);
      if (d > Math.PI) d = 2 * Math.PI - d;
      expect(d).toBeLessThan(0.6);
    }
  });

  it('heads for the lanes instead of cutting across bare ground', async () => {
    const { doc, f } = await schoolLot();
    const gate = f.objects.find((o) => o.name === 'Gate')!;
    const b45 = f.objects.find((o) => o.kind === 'space' && o.label === 'B45')!;
    const r = findRoute(doc, { floorId: f.id, objectId: gate.id, x: gate.x, y: gate.y }, { floorId: f.id, objectId: b45.id, x: b45.x, y: b45.y });
    if (!r.ok) throw new Error('no route');
    const p = sampled(r.route.legs[0].points);
    // Once it reaches the left lane it never leaves it until the aisle: nothing between x 120 and the rows above the aisle.
    for (let i = 0; i < p.length; i += 2) if (p[i] > 130 && p[i] < b45.x - 120 && p[i + 1] < 200) throw new Error(`cut across at ${p[i]},${p[i + 1]}`);
  });

  it('rounds corners without moving the ends', async () => {
    const { roundCorners } = await import('./route');
    const p = roundCorners([0, 0, 100, 0, 100, 100]);
    expect(p.slice(0, 2)).toEqual([0, 0]);
    expect(p.slice(-2)).toEqual([100, 100]);
    expect(p.length).toBeGreaterThan(6);
    // The corner itself is cut.
    for (let i = 0; i < p.length; i += 2) expect(Math.hypot(p[i] - 100, p[i + 1])).toBeGreaterThan(5);
  });
});

/** Signed px from (x, y) to a space's box (negative inside). Unrotated and 90-degree spaces only. */
function toSpace(o: MapObject, x: number, y: number) {
  const r = Math.abs(o.rotation % 180) === 90;
  const hw = (r ? o.height : o.width) / 2, hh = (r ? o.width : o.height) / 2;
  const dx = Math.abs(x - o.x) - hw, dy = Math.abs(y - o.y) - hh;
  return dx > 0 || dy > 0 ? Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) : Math.max(dx, dy);
}

describe('directions audit fixes', () => {
  it('keeps clear of every other parked car on the way, on every floor of a garage', () => {
    const doc = createQuickLot('Garage', { floors: 3, rows: 4, spacesPerRow: 10, accessible: 2 });
    const from = named(doc, 0, 'Entrance');
    for (const f of doc.floors) {
      for (const o of f.objects.filter((x) => x.kind === 'space').filter((_, i) => i % 3 === 0)) {
        const r = findRoute(doc, from, { floorId: f.id, objectId: o.id, x: o.x, y: o.y });
        if (!r.ok) throw new Error(`no route to ${o.label}`);
        for (const leg of r.route.legs) {
          const others = doc.floors.find((x) => x.id === leg.floorId)!.objects.filter((x) => x.kind === 'space' && x.id !== o.id);
          const p = sampled(leg.points);
          for (let i = 0; i < p.length; i += 2)
            for (const s of others) {
              const d = toSpace(s, p[i], p[i + 1]);
              if (d < 8) throw new Error(`route to ${o.id} passes ${d.toFixed(1)} px from ${s.id} at ${Math.round(p[i])},${Math.round(p[i + 1])}`);
            }
        }
      }
    }
  });

  it('keeps clear of the parked cars it passes between any two spaces, round every corner', () => {
    for (const opts of [{ floors: 1, rows: 4, spacesPerRow: 12, accessible: 2 }, { floors: 2, rows: 3, spacesPerRow: 9, accessible: 1 }]) {
      const doc = createQuickLot('Lot', opts);
      const f = doc.floors[0];
      const sp = f.objects.filter((o) => o.kind === 'space');
      for (const a of sp.filter((_, i) => i % 5 === 0))
        for (const b of sp.filter((_, i) => i % 7 === 3)) {
          const r = findRoute(doc, { floorId: f.id, objectId: a.id, x: a.x, y: a.y }, { floorId: f.id, objectId: b.id, x: b.x, y: b.y });
          if (!r.ok) continue;
          const p = sampled(r.route.legs[0].points);
          for (let i = 0; i < p.length; i += 2)
            for (const o of sp) {
              if (o === a || o === b) continue;
              const d = toSpace(o, p[i], p[i + 1]);
              if (d < 10) throw new Error(`${a.id} to ${b.id} passes ${d.toFixed(1)} px from ${o.id}`);
            }
        }
    }
  });

  it('draws one line down the middle of an aisle for the stalls on both sides of it', () => {
    const doc = createQuickLot('Lot', { floors: 1, rows: 2, spacesPerRow: 10, accessible: 0 });
    const f = doc.floors[0];
    const from = named(doc, 0, 'Entrance');
    const sp = f.objects.filter((o) => o.kind === 'space');
    // The two rows face each other: take a stall on each side, the same distance along.
    const xs = [...new Set(sp.map((o) => o.x))].sort((a, b) => a - b);
    const ys = [...new Set(sp.map((o) => o.y))].sort((a, b) => a - b);
    const top = sp.find((o) => o.x === xs[6] && o.y === ys[0])!, bottom = sp.find((o) => o.x === xs[6] && o.y === ys[ys.length - 1])!;
    const yAt = (o: MapObject) => {
      const r = findRoute(doc, from, { floorId: f.id, objectId: o.id, x: o.x, y: o.y });
      if (!r.ok) throw new Error('no route');
      const p = sampled(r.route.legs[0].points);
      let best = 0, bd = Infinity;
      for (let i = 0; i < p.length; i += 2) if (Math.abs(p[i] - xs[3]) < bd) { bd = Math.abs(p[i] - xs[3]); best = p[i + 1]; }
      return best;
    };
    expect(Math.abs(yAt(top) - yAt(bottom))).toBeLessThan(1.5);
  });

  it('rides past a floor that has no stairs or elevator drawn, without walking on it', () => {
    const doc = createQuickLot('Garage', { floors: 3, rows: 2, spacesPerRow: 6, accessible: 0 });
    const [f1, f2, f3] = doc.floors;
    // Floor 2 isn't mapped yet; the elevators say they stop there.
    f2.objects = f2.objects.filter((o) => !(o.kind === 'asset' && /elevator|stair|ramp/.test(o.assetKey)));
    for (const f of [f1, f3]) for (const o of f.objects) if (o.kind === 'asset' && /elevator|stair|ramp/.test(o.assetKey)) o.connectsTo = [f2.id];
    const r = findRoute(doc, named(doc, 0, 'Entrance'), space(doc, 2, '3B3'));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.route.legs.map((l) => l.floorId)).toEqual([f1.id, f3.id]);
    expect(r.route.steps.map((s) => s.text)).toEqual(['Walk to Elevator 1', 'Take Elevator 1 up to Floor 3', 'Walk to Space 3B3']);
    expect(r.route.steps.some((s) => /spot you picked/.test(s.text))).toBe(false);
  });

  it('does not repeat the floor when the stair or ramp name already says it', () => {
    const doc = createQuickLot('Garage', { floors: 2, rows: 2, spacesPerRow: 6, accessible: 0 });
    for (const o of doc.floors[0].objects) if (o.kind === 'asset' && o.assetKey.startsWith('elevator')) o.name = 'Lift to Floor 2';
    const r = findRoute(doc, named(doc, 0, 'Entrance'), space(doc, 1, '2B3'));
    expect(r.ok && r.route.steps.map((s) => s.text)).toContain('Take Lift to Floor 2');
  });

  it('starts from the nearest way out when the spot tapped is shut in', () => {
    const doc = createQuickLot('Lot', { floors: 1, rows: 2, spacesPerRow: 6, accessible: 0 });
    const f = doc.floors[0];
    const layerId = f.layers.find((l) => l.role === 'structure')!.id;
    // A room with no door, out beside the lot.
    const cx = -400, cy = 0;
    const wall = (x: number, y: number, w: number, h: number) =>
      f.objects.push({ id: `w${x}_${y}`, kind: 'asset', assetKey: 'wall', layerId, x, y, width: w, height: h, rotation: 0 });
    wall(cx, cy - 60, 130, 10); wall(cx, cy + 60, 130, 10); wall(cx - 60, cy, 10, 130); wall(cx + 60, cy, 10, 130);
    const r = findRoute(doc, { floorId: f.id, x: cx, y: cy }, space(doc, 0, 'A3'));
    expect(r.ok).toBe(true);
    expect(r.ok && r.route.squeezed).toBe(false);
  });

  it('does not pull routes across an entrance marker painted on a lane', () => {
    const doc = createQuickLot('Lot', { floors: 1, rows: 2, spacesPerRow: 6, accessible: 0 });
    const f = doc.floors[0];
    const road = f.objects.find((o) => o.kind === 'asset' && o.assetKey === 'road')!;
    const g0 = floorGrid(f);
    const before = g0.cost[cellAt(g0, road.x, road.y)];
    const layerId = f.layers.find((l) => l.role === 'landmarks')!.id;
    const withSign = { ...doc, floors: [{ ...f, objects: [...f.objects, { id: 'ent2', kind: 'asset', assetKey: 'entrance', layerId, x: road.x, y: road.y, width: 60, height: 30, rotation: 0 } as MapObject] }] };
    const g1 = floorGrid(withSign.floors[0]);
    expect(g1.cost[cellAt(g1, road.x, road.y)]).toBe(before);
  });
});
