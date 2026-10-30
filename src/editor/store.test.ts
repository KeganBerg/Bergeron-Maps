import { beforeEach, describe, expect, it } from 'vitest';
import { createMap } from '../model/factory';
import { DEFAULT_ROW } from '../model/rows';
import type { SpaceObject } from '../model/types';
import { currentFloor, useEditor } from './store';

const s = () => useEditor.getState();
const floor = () => currentFloor(s())!;
const spaces = () => floor().objects.filter((o): o is SpaceObject => o.kind === 'space');

beforeEach(() => {
  s().load(createMap('Test'));
  s().setViewSize({ width: 1000, height: 800 });
  s().setViewport({ x: 0, y: 0, scale: 1 });
});

describe('editor operations', () => {
  it('generates a row and selects it', () => {
    s().addRow({ ...DEFAULT_ROW, count: 20, prefix: 'A' }, { x: 100, y: 100, rotation: 0 });
    expect(spaces()).toHaveLength(20);
    expect(s().selection).toHaveLength(20);
    expect(spaces()[19].label).toBe('A20');
    expect(floor().layers.find((l) => l.id === spaces()[0].layerId)!.name).toBe('Parking spaces');
  });

  it('undoes and redoes moves, deletes, label changes and pastes', () => {
    s().addAsset('tree', { x: 50, y: 50 });
    const id = s().selection[0];
    s().nudge(10, 0);
    expect(floor().objects[0].x).toBe(60);
    s().updateObjects([id], { name: 'Big oak' });
    s().copy();
    s().paste();
    expect(floor().objects).toHaveLength(2);
    s().deleteSelection();
    expect(floor().objects).toHaveLength(1);
    s().undo(); // delete
    expect(floor().objects).toHaveLength(2);
    s().undo(); // paste
    expect(floor().objects).toHaveLength(1);
    s().undo(); // rename
    expect(floor().objects[0].name).toBe('Tree 1');
    s().undo(); // move
    expect(floor().objects[0].x).toBe(50);
    s().redo();
    expect(floor().objects[0].x).toBe(60);
  });

  it('keeps pasted objects selected and pastes repeatedly at new offsets', () => {
    s().addAsset('column', { x: 100, y: 100 });
    s().copy();
    s().paste();
    const first = s().selection[0];
    s().paste();
    const second = s().selection[0];
    const objs = floor().objects;
    expect(objs).toHaveLength(3);
    expect(objs.find((o) => o.id === first)!.x).toBe(120);
    expect(objs.find((o) => o.id === second)!.x).toBe(140);
  });

  it('pastes off-screen copies into view', () => {
    s().addAsset('column', { x: 5000, y: 5000 });
    s().copy();
    s().paste();
    const pasted = floor().objects.find((o) => o.id === s().selection[0])!;
    expect(pasted.x).toBeGreaterThan(0);
    expect(pasted.x).toBeLessThan(1000);
    expect(pasted.y).toBeLessThan(800);
  });

  it('warns about duplicate numbers on paste and renumbers in one click', () => {
    s().addRow({ ...DEFAULT_ROW, count: 3, prefix: 'B' }, { x: 100, y: 100, rotation: 0 });
    s().copy();
    s().paste();
    const notice = s().notices.at(-1)!;
    expect(notice.tone).toBe('warning');
    notice.action!.run();
    expect(spaces().map((x) => x.label).sort()).toEqual(['B1', 'B2', 'B3', 'B4', 'B5', 'B6']);
  });

  it('selects whole rows on click and single spaces after entering the row', () => {
    s().addRow({ ...DEFAULT_ROW, count: 4 }, { x: 0, y: 0, rotation: 0 });
    s().clearSelection();
    const sp = spaces();
    s().clickObject(sp[2].id, { additive: false });
    expect(s().selection).toHaveLength(4);
    s().clearSelection();
    s().enterRow(sp[2].rowId!);
    s().clickObject(sp[2].id, { additive: false });
    expect(s().selection).toEqual([sp[2].id]);
  });

  it('edits a generated row in place', () => {
    s().addRow({ ...DEFAULT_ROW, count: 4 }, { x: 0, y: 0, rotation: 0 });
    const rowId = spaces()[0].rowId!;
    s().updateRow(rowId, { count: 6, prefix: 'C', reverse: true });
    expect(spaces().map((x) => x.label)).toEqual(['C6', 'C5', 'C4', 'C3', 'C2', 'C1']);
    s().undo();
    expect(spaces()).toHaveLength(4);
  });

  it('does not select or move objects on locked or hidden layers', () => {
    s().addAsset('tree', { x: 0, y: 0 });
    const id = s().selection[0];
    const layerId = floor().objects[0].layerId;
    s().toggleLayer(layerId, 'locked');
    expect(s().selection).toEqual([]);
    s().select([id]);
    expect(s().selection).toEqual([]);
    s().selectAll();
    expect(s().selection).toEqual([]);
    s().toggleLayer(layerId, 'locked');
    s().toggleLayer(layerId, 'visible');
    s().selectAll();
    expect(s().selection).toEqual([]);
  });

  it('puts new objects on the active layer when one is chosen', () => {
    s().addLayer();
    const custom = s().activeLayer;
    s().addAsset('tree', { x: 0, y: 0 });
    expect(floor().objects[0].layerId).toBe(custom);
    s().setActiveLayer('auto');
    s().addAsset('column', { x: 0, y: 0 });
    expect(floor().layers.find((l) => l.id === floor().objects[1].layerId)!.name).toBe('Structure');
  });

  it('adds, duplicates, reorders and deletes floors', () => {
    s().addRow({ ...DEFAULT_ROW, count: 2 }, { x: 0, y: 0, rotation: 0 });
    s().addFloor();
    expect(s().doc!.floors.map((f) => f.name)).toEqual(['Floor 1', 'Floor 2']);
    expect(floor().name).toBe('Floor 2');
    s().setFloor(s().doc!.floors[0].id);
    s().duplicateFloor(s().doc!.floors[0].id);
    expect(s().doc!.floors.map((f) => f.name)).toEqual(['Floor 1', 'Floor 1 (copy)', 'Floor 2']);
    expect(floor().objects).toHaveLength(2);
    s().nudge(5, 0); // nothing selected: no-op
    s().selectAll();
    s().nudge(5, 0);
    expect(s().doc!.floors[0].objects[0].x).toBe(0);
    s().moveFloor(floor().id, 1);
    expect(s().doc!.floors.map((f) => f.name)).toEqual(['Floor 1', 'Floor 2', 'Floor 1 (copy)']);
    s().deleteFloor(floor().id);
    expect(s().doc!.floors).toHaveLength(2);
    s().undo();
    expect(s().doc!.floors).toHaveLength(3);
  });

  it('never deletes the last floor', () => {
    s().deleteFloor(floor().id);
    expect(s().doc!.floors).toHaveLength(1);
  });

  it('auto-names landmarks so they can be identified', () => {
    s().addAsset('stairs', { x: 0, y: 0 });
    s().addAsset('stairs', { x: 100, y: 0 });
    expect(floor().objects.map((o) => o.name)).toEqual(['Stairway 1', 'Stairway 2']);
  });

  it('aligns selected objects', () => {
    s().addAsset('column', { x: 10, y: 0 });
    s().addAsset('column', { x: 90, y: 50 });
    s().selectAll();
    s().align('top');
    const [a, b] = floor().objects;
    expect(a.y).toBe(b.y);
  });
});
