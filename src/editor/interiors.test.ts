import { beforeEach, describe, expect, it } from 'vitest';
import { createMap } from '../model/factory';
import { buildingOf, interiorFloors, siteFloors } from '../model/interiors';
import { migrateDocument } from '../model/migrate';
import { searchMap } from '../model/search';
import { currentFloor, useEditor } from './store';

const s = () => useEditor.getState();
const floor = () => currentFloor(s())!;
const doc = () => s().doc!;

function placeBuilding(key = 'service-department') {
  s().addAsset(key, { x: 300, y: 300 });
  return s().selection[0];
}

beforeEach(() => {
  s().load(createMap('Test'));
  s().setViewSize({ width: 1000, height: 800 });
  s().setViewport({ x: 0, y: 0, scale: 1 });
});

describe('building interiors', () => {
  it('builds a floor plan with outer walls the first time someone goes inside', () => {
    const id = placeBuilding();
    const site = floor().id;
    s().enterBuilding(id);
    expect(floor().interiorOf).toBe(id);
    expect(floor().name).toBe('Floor 1');
    expect(floor().objects.map((o) => o.kind === 'asset' && o.assetKey)).toEqual(['outer-walls']);
    expect(siteFloors(doc()).map((f) => f.id)).toEqual([site]);

    s().exitBuilding();
    expect(floor().id).toBe(site);
    expect(s().selection).toEqual([id]);

    // Going back in opens the same plan instead of making another one.
    s().enterBuilding(id);
    expect(interiorFloors(doc(), id)).toHaveLength(1);
  });

  it('keeps a building’s floors separate from the site floors', () => {
    const id = placeBuilding();
    s().enterBuilding(id);
    s().addFloor();
    expect(floor().interiorOf).toBe(id);
    expect(interiorFloors(doc(), id).map((f) => f.name)).toEqual(['Floor 1', 'Floor 2']);
    s().exitBuilding();
    s().addFloor();
    expect(floor().interiorOf).toBeUndefined();
    expect(siteFloors(doc()).map((f) => f.name)).toEqual(['Floor 1', 'Floor 2']);
  });

  it('places office furniture inside and finds it in search with the building name', () => {
    const id = placeBuilding();
    s().updateObjects([id], { name: 'Service department' });
    s().enterBuilding(id);
    s().addAsset('cubicle-cluster', { x: 100, y: 100 });
    s().addAsset('private-office', { x: 200, y: 100 });
    const hit = searchMap(doc(), 'private office')[0];
    expect(hit.floorName).toBe('Service department');
    expect(buildingOf(doc(), doc().floors.find((f) => f.id === hit.floorId)!)?.building.id).toBe(id);
  });

  it('deleting the building deletes its floor plan, and undo brings both back', () => {
    const id = placeBuilding();
    s().enterBuilding(id);
    s().exitBuilding();
    s().select([id]);
    s().deleteSelection();
    expect(doc().floors).toHaveLength(1);
    s().undo();
    expect(interiorFloors(doc(), id)).toHaveLength(1);
  });

  it('deleting the last floor inside goes back outside, and the site keeps its last floor', () => {
    const id = placeBuilding();
    const site = floor().id;
    s().enterBuilding(id);
    s().deleteFloor(floor().id);
    expect(floor().id).toBe(site);
    expect(interiorFloors(doc(), id)).toHaveLength(0);
    s().deleteFloor(site);
    expect(doc().floors).toHaveLength(1);
  });

  it('duplicating a site floor copies its buildings’ floor plans too', () => {
    const id = placeBuilding();
    s().enterBuilding(id);
    s().addAsset('desk', { x: 50, y: 50 });
    s().exitBuilding();
    s().duplicateFloor(floor().id);
    const copy = floor();
    const copiedBuilding = copy.objects[0].id;
    expect(copiedBuilding).not.toBe(id);
    const plan = interiorFloors(doc(), copiedBuilding);
    expect(plan).toHaveLength(1);
    expect(plan[0].objects).toHaveLength(2);
  });

  it('moves floors only within their own group', () => {
    const id = placeBuilding();
    s().addFloor(); // site Floor 2
    s().setFloor(siteFloors(doc())[0].id);
    s().enterBuilding(id);
    s().addFloor();
    const [a, b] = interiorFloors(doc(), id);
    s().moveFloor(b.id, -1);
    expect(interiorFloors(doc(), id).map((f) => f.id)).toEqual([b.id, a.id]);
    expect(siteFloors(doc()).map((f) => f.name)).toEqual(['Floor 1', 'Floor 2']);
  });

  it('turns a floor plan whose building is gone into an ordinary floor when a map loads', () => {
    const id = placeBuilding();
    s().enterBuilding(id);
    const raw = structuredClone(doc());
    raw.floors[0].objects = [];
    const fixed = migrateDocument(raw);
    expect(fixed.floors.every((f) => !f.interiorOf)).toBe(true);
  });

  it('only buildings and rooms can be entered', () => {
    s().addAsset('tree', { x: 10, y: 10 });
    s().enterBuilding(s().selection[0]);
    expect(doc().floors).toHaveLength(1);
    expect(floor().interiorOf).toBeUndefined();
  });
});
