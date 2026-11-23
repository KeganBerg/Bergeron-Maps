import { beforeEach, describe, expect, it } from 'vitest';
import { createMap } from '../model/factory';
import { DEFAULT_ROW } from '../model/rows';
import type { SpaceObject } from '../model/types';
import { currentFloor, useEditor } from './store';

/** Bugs found in the map editor audit of 2026-11-19. */
const s = () => useEditor.getState();
const floor = () => currentFloor(s())!;
const spaces = () => floor().objects.filter((o): o is SpaceObject => o.kind === 'space');

beforeEach(() => {
  s().load(createMap('Audit'));
  s().setViewSize({ width: 1000, height: 800 });
  s().setViewport({ x: 0, y: 0, scale: 1 });
});

describe('editor audit 2026-11-19', () => {
  it('Ctrl+X with nothing selected keeps the next paste from landing on the original', () => {
    s().addAsset('column', { x: 100, y: 100 });
    s().copy();
    s().clearSelection();
    s().cut();
    s().paste();
    const [a, b] = floor().objects;
    expect(floor().objects).toHaveLength(2);
    expect(b.x).not.toBe(a.x);
  });

  it('pastes onto another floor in the same place, then steps on', () => {
    s().addAsset('column', { x: 100, y: 100 });
    s().copy();
    s().addFloor();
    s().paste();
    expect(floor().objects[0].x).toBe(100);
    s().paste();
    expect(floor().objects[1].x).toBe(120);
  });

  it('undo of a change on another floor goes to that floor', () => {
    const first = s().floorId;
    s().addFloor();
    const second = s().floorId;
    s().addAsset('column', { x: 100, y: 100 });
    s().setFloor(first);
    s().undo();
    expect(s().floorId).toBe(second);
    expect(floor().objects).toHaveLength(0);
    expect(s().notices.at(-1)?.message).toContain('Undid a change on');
    s().setFloor(first);
    s().redo();
    expect(s().floorId).toBe(second);
    expect(floor().objects).toHaveLength(1);
  });

  it('does not undo underneath a drag that is still going', () => {
    s().addAsset('column', { x: 100, y: 100 });
    s().beginGesture();
    s().previewGesture((_d, f) => { f.objects[0].x = 150; });
    s().undo();
    expect(floor().objects).toHaveLength(1);
    s().endGesture();
    expect(floor().objects[0].x).toBe(150);
    s().undo();
    expect(floor().objects[0].x).toBe(100);
  });

  it('a selection box over part of a row picks the whole row, but only some spaces inside the row', () => {
    s().addRow({ ...DEFAULT_ROW, count: 6, prefix: 'A' }, { x: 100, y: 100, rotation: 0 });
    s().clearSelection();
    // Covers the first two spaces only.
    s().selectInBox({ x: 60, y: 40, width: 80, height: 100 }, false);
    expect(s().selection).toHaveLength(6);
    s().enterRow(spaces()[0].rowId!);
    s().selectInBox({ x: 60, y: 40, width: 80, height: 100 }, false);
    expect(s().selection).toHaveLength(2);
  });

  it('refuses a floor name another floor already has', () => {
    s().addFloor();
    const id = s().floorId;
    s().renameFloor(id, ' floor 1 ');
    expect(floor().name).toBe('Floor 2');
    expect(s().notices.at(-1)?.message).toContain('already a floor called');
    s().renameFloor(id, 'Roof');
    expect(floor().name).toBe('Roof');
  });
});
