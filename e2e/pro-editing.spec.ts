import { expect, test, type Page } from '@playwright/test';
import { addFromLibrary, newMap } from './helpers';
import { editorState, realClick, realDrag, settle, toScreen, type ObjInfo, type Pt } from './real-input';

/**
 * What Figma and PowerPoint users reach for: the right-click menu, Alt-drag to
 * duplicate, select all of a type, zoom shortcuts, the shortcut list, and saving
 * the floor as a picture or PDF. All with a real mouse and keyboard.
 */

const obj = async (page: Page, name: string) => (await editorState(page)).objects.find((o) => o.name === name) as ObjInfo;
const center = (page: Page, o: ObjInfo) => toScreen(page, o, { x: 0, y: 0 });
const names = async (page: Page) => {
  const s = await editorState(page);
  return s.selection.map((id) => s.objects.find((o) => o.id === id)?.name).sort();
};
async function rightClick(page: Page, p: Pt) {
  await page.mouse.move(p.x, p.y, { steps: 2 });
  await page.mouse.down({ button: 'right' });
  await page.mouse.up({ button: 'right' });
  await expect(page.getByTestId('canvas-menu')).toBeVisible();
}

/** A column, two EV spaces and a standard space, spread out across the view. */
async function scene(page: Page) {
  await newMap(page, 'Pro');
  await page.getByTestId('snap-mode').selectOption('free');
  // Konva's own double-click (two clicks within 400ms) would open the label editor.
  await page.evaluate(() => ((window as unknown as { Konva: { dblClickWindow: number } }).Konva.dblClickWindow = 1));
  const c = (await page.getByTestId('canvas').boundingBox())!;
  const spots: [string, string, number, number][] = [
    ['column', 'Column 1', 0.3, 0.3],
    ['space-ev', '1', 0.5, 0.3],
    ['space-ev', '2', 0.6, 0.3],
    ['space-standard', '3', 0.7, 0.6],
  ];
  for (const [key, name, fx, fy] of spots) {
    await addFromLibrary(page, key);
    await page.getByTestId('asset-search').blur();
    const s = await editorState(page);
    const o = s.objects.find((x) => x.id === s.selection[0]) as ObjInfo;
    expect(o.name, `placed ${key}`).toBe(name);
    await realDrag(page, await center(page, o), { x: c.x + c.width * fx, y: c.y + c.height * fy });
  }
  await page.keyboard.press('Escape');
  return c;
}

test.describe('pro editing', () => {
  test.setTimeout(90_000);

  test('right-click menu: picks what is under the pointer and acts on it', async ({ page }) => {
    const c = await scene(page);
    await realClick(page, await center(page, await obj(page, 'Column 1')));
    // Right-clicking something else selects it, as in Figma.
    await rightClick(page, await center(page, await obj(page, '3')));
    expect(await names(page)).toEqual(['3']);
    await expect(page.getByTestId('menu-select-type')).toHaveText('Select all standard spaces (1)');
    const n0 = (await editorState(page)).objects.length;
    await page.getByTestId('menu-duplicate').click();
    await expect(page.getByTestId('canvas-menu')).toHaveCount(0);
    expect((await editorState(page)).objects.length).toBe(n0 + 1);
    // Delete from the menu.
    const copy = (await editorState(page)).selection[0];
    const copyObj = (await editorState(page)).objects.find((o) => o.id === copy)!;
    await rightClick(page, await center(page, copyObj));
    await page.getByTestId('menu-delete').click();
    expect((await editorState(page)).objects.length).toBe(n0);
    // Empty map: map actions; Escape closes it without doing anything.
    await rightClick(page, { x: c.x + c.width * 0.05, y: c.y + c.height * 0.9 });
    expect(await names(page)).toEqual([]);
    await expect(page.getByTestId('menu-select-all')).toBeEnabled();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('canvas-menu')).toHaveCount(0);
    // Arrow keys and Enter work in the menu: the first item on empty map is Paste (nothing copied), so Down lands on Select all.
    await rightClick(page, { x: c.x + c.width * 0.05, y: c.y + c.height * 0.9 });
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    expect((await names(page)).length).toBe(4);
    // A click elsewhere closes the menu.
    await rightClick(page, await center(page, await obj(page, 'Column 1')));
    await realClick(page, { x: c.x + c.width * 0.05, y: c.y + c.height * 0.9 });
    await expect(page.getByTestId('canvas-menu')).toHaveCount(0);
  });

  test('select all of a type, then lock and hide from the menu', async ({ page }) => {
    await scene(page);
    await rightClick(page, await center(page, await obj(page, '1')));
    await expect(page.getByTestId('menu-select-type')).toHaveText('Select all EV charging spaces (2)');
    await page.getByTestId('menu-select-type').click();
    expect(await names(page)).toEqual(['1', '2']);
    // Lock one: it can no longer be picked or dragged.
    const col = await obj(page, 'Column 1');
    await rightClick(page, await center(page, col));
    await page.getByTestId('menu-lock').click();
    expect(await names(page)).toEqual([]);
    const p = await center(page, col);
    await realClick(page, p);
    expect(await names(page)).toEqual([]);
    await realDrag(page, p, { x: p.x + 60, y: p.y });
    expect((await obj(page, 'Column 1')).x).toBe(col.x);
    // Hide another: clicking where it was finds nothing.
    const s3 = await obj(page, '3');
    await rightClick(page, await center(page, s3));
    await page.getByTestId('menu-hide').click();
    await realClick(page, await center(page, s3));
    expect(await names(page)).toEqual([]);
  });

  test('Alt-drag leaves the original and moves a copy; one undo takes the copy away', async ({ page }) => {
    await scene(page);
    const col = await obj(page, 'Column 1');
    const from = await center(page, col);
    const past0 = (await editorState(page)).past;
    await page.keyboard.down('Alt');
    await realDrag(page, from, { x: from.x + 90, y: from.y + 40 });
    await page.keyboard.up('Alt');
    const s = await editorState(page);
    const cols = s.objects.filter((o) => o.name?.startsWith('Column'));
    expect(cols.map((o) => o.name).sort()).toEqual(['Column 1', 'Column 2']);
    expect((await obj(page, 'Column 1')).x, 'the original stays put').toBe(col.x);
    const copy = await obj(page, 'Column 2');
    expect(copy.x - col.x).toBeCloseTo(90 / s.viewport.scale, 0);
    expect(await names(page)).toEqual(['Column 2']);
    expect(s.past - past0, 'the copy and its move are one undo step').toBe(1);
    await page.keyboard.press('ControlOrMeta+z');
    expect((await editorState(page)).objects.filter((o) => o.name?.startsWith('Column')).length).toBe(1);
    // An Alt-click without a drag copies nothing.
    await page.keyboard.down('Alt');
    await realClick(page, from);
    await page.keyboard.up('Alt');
    expect((await editorState(page)).objects.filter((o) => o.name?.startsWith('Column')).length).toBe(1);
  });

  test('zoom shortcuts and the shortcut list', async ({ page }) => {
    await scene(page);
    await page.getByTestId('fit').click();
    await settle(page);
    const fit = (await editorState(page)).viewport;
    await page.keyboard.press('ControlOrMeta+Equal');
    const zin = (await editorState(page)).viewport.scale;
    expect(zin).toBeCloseTo(fit.scale * 1.25, 3);
    await page.keyboard.press('ControlOrMeta+Minus');
    await page.keyboard.press('ControlOrMeta+Minus');
    expect((await editorState(page)).viewport.scale).toBeCloseTo(fit.scale / 1.25, 3);
    await page.keyboard.press('ControlOrMeta+0');
    expect((await editorState(page)).viewport.scale).toBe(1);
    await page.keyboard.press('Shift+Digit1');
    expect((await editorState(page)).viewport).toEqual(fit);
    // Shift+2 zooms to the selection.
    await realClick(page, await center(page, await obj(page, 'Column 1')));
    await page.keyboard.press('Shift+Digit2');
    expect((await editorState(page)).viewport.scale).toBeGreaterThan(fit.scale * 2);
    // The page itself did not zoom.
    expect(await page.evaluate(() => window.visualViewport?.scale ?? 1)).toBe(1);
    await page.keyboard.press('Shift+Slash');
    await expect(page.getByTestId('shortcuts')).toBeVisible();
    await expect(page.getByTestId('shortcuts')).toContainText('Duplicate while dragging');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('shortcuts')).toHaveCount(0);
  });

  test('the floor saves as a picture and opens for printing', async ({ page }) => {
    await scene(page);
    // Zoomed in on one corner: the picture still holds the whole floor.
    await page.keyboard.press('ControlOrMeta+0');
    await page.keyboard.press('ControlOrMeta+Equal');
    await page.getByTestId('download-map').click();
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('download-image').click()]);
    expect(download.suggestedFilename()).toBe('Pro-Floor-1.png');
    const size = await page.evaluate(async () => {
      const { floorImage } = await import('/src/editor/view.ts');
      const img = (await floorImage())!;
      const bmp = await createImageBitmap(img.blob);
      // Count the pixels that differ from the background in the picture's middle row.
      const cv = new OffscreenCanvas(bmp.width, bmp.height);
      const ctx = cv.getContext('2d')!;
      ctx.drawImage(bmp, 0, 0);
      const data = ctx.getImageData(0, 0, bmp.width, bmp.height).data;
      let ink = 0;
      for (let i = 0; i < data.length; i += 4 * 97) if (Math.abs(data[i] - data[0]) + Math.abs(data[i + 1] - data[1]) + Math.abs(data[i + 2] - data[2]) > 30) ink++;
      return { w: bmp.width, h: bmp.height, ink };
    });
    expect(Math.max(size.w, size.h)).toBeGreaterThanOrEqual(3000);
    expect(size.ink, 'the picture has the objects in it').toBeGreaterThan(50);
    // Print: a window opens with the floor in it (the print dialog itself is the browser's).
    const c = (await page.getByTestId('canvas').boundingBox())!;
    await rightClick(page, { x: c.x + 10, y: c.y + c.height - 10 });
    const [popup] = await Promise.all([
      page.waitForEvent('popup'),
      page.getByTestId('menu-print').click(),
    ]);
    await popup.evaluate(() => (window.print = () => undefined));
    await expect(popup.getByTestId('print-image')).toBeVisible();
    await expect(popup.locator('h1')).toHaveText('Pro, Floor 1');
  });

  test('type a number, a name or a label straight onto the map', async ({ page }) => {
    const c = await scene(page);
    // A real double-click: Konva's own double-click window back to its default.
    await page.evaluate(() => ((window as unknown as { Konva: { dblClickWindow: number } }).Konva.dblClickWindow = 400));
    const s3 = await obj(page, '3');
    const p3 = await center(page, s3);
    await page.mouse.click(p3.x, p3.y);
    await page.mouse.dblclick(p3.x, p3.y);
    const field = page.getByTestId('inline-label');
    await expect(field).toBeVisible();
    await expect(field).toHaveValue('3');
    await expect(field).toBeFocused();
    await page.keyboard.type('B12');
    await page.keyboard.press('Enter');
    await expect(field).toHaveCount(0);
    expect((await editorState(page)).objects.find((o) => o.id === s3.id)!.name).toBe('B12');
    // A drag followed straight away by a click is not a double-click: no box over the handles.
    const col = await obj(page, 'Column 1');
    const pc0 = await center(page, col);
    await realDrag(page, pc0, { x: pc0.x + 30, y: pc0.y });
    await page.mouse.click(pc0.x + 30, pc0.y);
    await page.waitForTimeout(100);
    await expect(field).toHaveCount(0);
    await page.keyboard.press('ControlOrMeta+z');
    // Esc throws the typing away.
    const pc = await center(page, await obj(page, 'Column 1'));
    await page.mouse.click(pc.x, pc.y);
    await page.mouse.dblclick(pc.x, pc.y);
    await expect(field).toHaveValue('Column 1');
    await page.keyboard.type('Nope');
    await page.keyboard.press('Escape');
    await expect(field).toHaveCount(0);
    expect((await editorState(page)).objects.find((o) => o.id === col.id)!.name).toBe('Column 1');
    expect(await names(page), 'Esc in the box leaves the selection alone').toEqual(['Column 1']);
    // A click elsewhere keeps it, and one undo takes it back.
    await page.mouse.dblclick(pc.x, pc.y);
    await page.keyboard.type('Pillar A');
    await realClick(page, { x: c.x + c.width * 0.05, y: c.y + c.height * 0.9 });
    await expect(field).toHaveCount(0);
    expect((await editorState(page)).objects.find((o) => o.id === col.id)!.name).toBe('Pillar A');
    await page.keyboard.press('ControlOrMeta+z');
    expect((await editorState(page)).objects.find((o) => o.id === col.id)!.name).toBe('Column 1');
  });

  test('find a space or object on the map from the editor', async ({ page }) => {
    await scene(page);
    await page.getByTestId('add-floor').click();
    await addFromLibrary(page, 'stairs');
    await page.getByTestId('asset-search').blur();
    await page.keyboard.press('Escape');
    // On Floor 2, find something on Floor 1.
    await page.keyboard.press('ControlOrMeta+f');
    await expect(page.getByTestId('find-input')).toBeFocused();
    await page.keyboard.type('column');
    await expect(page.getByTestId('find-results')).toContainText('Column 1');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('find-bar')).toHaveCount(0);
    await expect(page.getByTestId('floor-tab-Floor 1').getByRole('button', { pressed: true })).toBeVisible();
    expect(await names(page)).toEqual(['Column 1']);
    // It is on screen, near the middle, ready to drag.
    const col = await obj(page, 'Column 1');
    const at = await center(page, col);
    const c = (await page.getByTestId('canvas').boundingBox())!;
    expect(Math.abs(at.x - (c.x + c.width / 2))).toBeLessThan(5);
    expect(Math.abs(at.y - (c.y + c.height / 2))).toBeLessThan(5);
    await realDrag(page, at, { x: at.x + 40, y: at.y });
    expect((await obj(page, 'Column 1')).x).toBeGreaterThan(col.x);
    // The magnifier button opens it too; Esc closes it.
    await page.getByTestId('find').click();
    await page.keyboard.type('zzz');
    await expect(page.getByTestId('find-results')).toContainText('Nothing on this map');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('find-bar')).toHaveCount(0);
  });
});
