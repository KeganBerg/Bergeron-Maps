import { expect, test, type Page } from '@playwright/test';
import { spaceBox } from './pointer-helpers';
import { editorState, realClick, realDrag, settle } from './real-input';

/**
 * Map editor audit (2026-11-19): bugs found by driving the editor with a real
 * mouse and keyboard. Each test is one bug.
 */

async function openLot(page: Page, floors = 1) {
  await page.goto('/');
  const id = await page.evaluate(async (floors) => {
    const { createQuickLot } = await import('/src/model/quickLot.ts');
    const { repository } = await import('/src/storage/indexedDbRepository.ts');
    const doc = createQuickLot('Audit Lot', { floors, accessible: 0, rows: 2, spacesPerRow: 6 });
    await repository.createMap(doc);
    return doc.id;
  }, floors);
  await page.goto(`/#/edit/${id}`);
  await expect(page.getByTestId('canvas').locator('canvas').first()).toBeVisible();
  // Konva's own double-click (two clicks within 400ms) would open the label editor.
  await page.evaluate(() => ((window as unknown as { Konva: { dblClickWindow: number } }).Konva.dblClickWindow = 1));
  await settle(page);
}

const pos = async (page: Page, name: string) => {
  const o = (await editorState(page)).objects.find((x) => x.name === name)!;
  return { x: o.x, y: o.y };
};

test('Escape in the middle of a drag puts the row back', async ({ page }) => {
  await openLot(page);
  const a = (await spaceBox(page, 'A2'))!;
  const before = await pos(page, 'A2');
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(a.x + 80, a.y + 60, { steps: 8 });
  await page.keyboard.press('Escape');
  await page.mouse.move(a.x + 100, a.y + 60, { steps: 2 });
  await page.mouse.up();
  expect(await pos(page, 'A2')).toEqual(before);
  const s = await editorState(page);
  expect(s.past, 'nothing to undo').toBe(0);
  expect(s.selection, 'the row stays selected').toHaveLength(6);
});

test('Escape during an Alt-drag takes the copies away too', async ({ page }) => {
  await openLot(page);
  const n = (await editorState(page)).objects.length;
  const a = (await spaceBox(page, 'A2'))!;
  await page.keyboard.down('Alt');
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(a.x, a.y + 300, { steps: 8 });
  expect((await editorState(page)).objects.length).toBe(n + 6);
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await page.keyboard.up('Alt');
  const s = await editorState(page);
  expect(s.objects.length).toBe(n);
  expect(s.past).toBe(0);
  expect(s.selection).toHaveLength(6);
});

test('Ctrl+Z while still dragging does nothing until the drag ends', async ({ page }) => {
  await openLot(page);
  const a = (await spaceBox(page, 'A2'))!;
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('ArrowRight'); // one step to undo
  await realClick(page, { x: a.x + 1, y: a.y });
  const start = await pos(page, 'A2');
  await page.mouse.move(a.x + 1, a.y);
  await page.mouse.down();
  await page.mouse.move(a.x + 60, a.y + 40, { steps: 6 });
  await page.keyboard.press('ControlOrMeta+z');
  await page.mouse.move(a.x + 80, a.y + 40, { steps: 2 });
  await page.mouse.up();
  const moved = await pos(page, 'A2');
  expect(moved.x).toBeGreaterThan(start.x + 20);
  expect((await editorState(page)).past).toBe(2);
  // Undo now takes back the drag, then the nudge.
  await page.keyboard.press('ControlOrMeta+z');
  expect(await pos(page, 'A2')).toEqual(start);
  await page.keyboard.press('ControlOrMeta+z');
  expect((await pos(page, 'A2')).x).toBe(start.x - 1);
});

test('a selection box over half a row picks the whole row, so dragging it does not split the row', async ({ page }) => {
  await openLot(page);
  const a6 = (await spaceBox(page, 'A6'))!;
  const a4 = (await spaceBox(page, 'A4'))!;
  // From the empty map right of the row, over A6 to A4.
  const from = { x: a6.x + a6.w, y: a6.y - a6.h * 0.7 };
  await realDrag(page, from, { x: a4.x, y: a4.y });
  const s = await editorState(page);
  const picked = s.selection.map((id) => s.objects.find((o) => o.id === id)!.name);
  for (const n of ['A1', 'A2', 'A3', 'A4', 'A5', 'A6']) expect(picked).toContain(n);

  // Inside a row (double-click), the box picks single spaces.
  await page.evaluate(async () => {
    const { useEditor, currentFloor } = await import('/src/editor/store.ts');
    const s = useEditor.getState();
    const sp = currentFloor(s)!.objects.find((o) => o.kind === 'space' && o.label === 'A1') as { rowId: string };
    s.clearSelection();
    s.enterRow(sp.rowId);
  });
  await realDrag(page, from, { x: a4.x, y: a4.y });
  const s2 = await editorState(page);
  expect(s2.selection.map((id) => s2.objects.find((o) => o.id === id)!.name).sort()).toEqual(['A4', 'A5', 'A6']);
  // A plain click on empty map still leaves the row.
  await realClick(page, from);
  expect(await page.evaluate(async () => (await import('/src/editor/store.ts')).useEditor.getState().enteredRowId)).toBeNull();
});

test('placing a text label starts typing in it', async ({ page }) => {
  await openLot(page);
  await page.getByTestId('tool-text').click();
  const c = (await page.getByTestId('canvas').boundingBox())!;
  await page.mouse.click(c.x + c.width - 200, c.y + 120);
  await expect(page.getByTestId('inline-label')).toBeFocused();
  await page.keyboard.type('Visitor parking');
  await page.keyboard.press('Enter');
  const s = await editorState(page);
  expect(s.objects.filter((o) => o.kind === 'text').map((o) => o.name)).toEqual(['Visitor parking']);
});

test('Ctrl+S inside a field keeps what was typed and saves the map', async ({ page }) => {
  await openLot(page);
  // One space picked inside its row, so the panel shows its number field.
  await page.evaluate(async () => {
    const { useEditor, currentFloor } = await import('/src/editor/store.ts');
    const s = useEditor.getState();
    const sp = currentFloor(s)!.objects.find((o) => o.kind === 'space' && o.label === 'A2') as { id: string; rowId: string };
    s.enterRow(sp.rowId);
    s.select([sp.id]);
  });
  await expect(page.getByTestId('space-label')).toBeVisible();
  await page.getByTestId('space-label').fill('A99');
  // Listens at the document, under the editor's own handler, to see what the browser is left to do.
  await page.evaluate(() => {
    document.addEventListener('keydown', (e) => {
      if (e.key === 's') (window as unknown as { saveKey: boolean }).saveKey = e.defaultPrevented;
    }, { capture: true });
  });
  await page.getByTestId('space-label').press('ControlOrMeta+s');
  expect(await page.evaluate(() => (window as unknown as { saveKey?: boolean }).saveKey), "the browser's own Save page dialog is kept away").toBe(true);
  await expect(page.getByTestId('save-status')).toHaveText(/Saved/);
  expect((await editorState(page)).objects.some((o) => o.name === 'A99')).toBe(true);
});

test('undo of a change on another floor shows that floor', async ({ page }) => {
  await openLot(page, 2);
  await page.getByTestId('floor-tab-Floor 2').click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('Delete');
  await page.getByTestId('floor-tab-Floor 1').click();
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.getByTestId('floor-tab-Floor 2')).toHaveClass(/active/);
  await expect(page.getByTestId('notice').first()).toContainText('Undid a change on “Floor 2”');
  expect((await editorState(page)).objects.length).toBeGreaterThan(10);
});

test('a locked object can be unlocked again from the map', async ({ page }) => {
  await openLot(page);
  const a = (await spaceBox(page, 'A2'))!;
  await page.mouse.click(a.x, a.y, { button: 'right' });
  await page.getByTestId('menu-lock').click();
  await expect(page.getByTestId('notice').first()).toContainText('locked');
  await realClick(page, a);
  expect((await editorState(page)).selection.filter((id) => id.startsWith('sp'))).toHaveLength(0);
  // Right-click on empty map offers to unlock.
  const c = (await page.getByTestId('canvas').boundingBox())!;
  await page.mouse.click(c.x + c.width - 60, c.y + c.height - 60, { button: 'right' });
  await page.getByTestId('menu-unlock-all').click();
  await realClick(page, a);
  expect((await editorState(page)).selection).toHaveLength(6);
});

test('a floor cannot be renamed to the name of another floor', async ({ page }) => {
  await openLot(page, 2);
  await page.getByTestId('floor-tab-Floor 2').dblclick();
  await page.getByTestId('floor-rename').fill('Floor 1');
  await page.getByTestId('floor-rename').press('Enter');
  await expect(page.getByTestId('notice').first()).toContainText('already a floor called “Floor 1”');
  await expect(page.getByTestId('floor-tab-Floor 2')).toBeVisible();
});

test('Ctrl+X with nothing selected does not make the next paste land on top', async ({ page }) => {
  await openLot(page);
  const a = (await spaceBox(page, 'A2'))!;
  await realClick(page, a);
  await page.keyboard.press('ControlOrMeta+c');
  await page.keyboard.press('Escape');
  await page.keyboard.press('ControlOrMeta+x');
  await page.keyboard.press('ControlOrMeta+v');
  const s = await editorState(page);
  const before = s.objects.filter((o) => o.name === 'A2');
  expect(before).toHaveLength(2);
  expect(before[1].x).not.toBe(before[0].x);
});
