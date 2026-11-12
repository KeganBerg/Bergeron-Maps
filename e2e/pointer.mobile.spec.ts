import { expect, test } from '@playwright/test';
import { editorSelection, seedLot, settle, spaceBox } from './pointer-helpers';

test('viewer: a finger tap counts once, even when the browser follows it with a copy-cat mouse click', async ({ page }) => {
  const id = await seedLot(page, { rows: 4, spacesPerRow: 10 });
  await page.goto(`/#/view/${id}`);
  await expect(page.getByTestId('viewer-facility')).toHaveText('Pointer Lot');
  await settle(page);
  const b3 = (await spaceBox(page, 'B3'))!;
  await page.touchscreen.tap(b3.x, b3.y);
  await expect(page.getByTestId('info-card').locator('strong')).toHaveText('Space B3');
  // Phones send mousedown/mouseup/click after a tap. If the map slid in between,
  // those land on a neighbor. Send them over B4 and check B3 stays picked.
  const b4 = (await spaceBox(page, 'B4'))!;
  await page.evaluate(({ x, y }) => {
    const el = document.elementFromPoint(x, y)!;
    for (const t of ['mousedown', 'mouseup', 'click']) el.dispatchEvent(new MouseEvent(t, { clientX: x, clientY: y, bubbles: true, cancelable: true }));
  }, b4);
  await page.waitForTimeout(200);
  await expect(page.getByTestId('info-card').locator('strong')).toHaveText('Space B3');
  // Tapping the next space moves the highlight.
  for (const label of ['B4', 'C1', 'A10', 'D5']) {
    const b = (await spaceBox(page, label))!;
    await page.touchscreen.tap(b.x, b.y);
    await expect(page.getByTestId('info-card').locator('strong')).toHaveText(`Space ${label}`);
  }
});

test('editor: tap picks a row, double tap picks one space, tapping others moves the selection, drag moves it', async ({ page, context }) => {
  const id = await seedLot(page, { rows: 4, spacesPerRow: 8 });
  await page.goto(`/#/edit/${id}`);
  await expect(page.getByTestId('canvas').locator('canvas').first()).toBeVisible();
  await settle(page);
  const tap = async (label: string) => {
    const b = (await spaceBox(page, label))!;
    await page.touchscreen.tap(b.x, b.y);
  };
  await tap('C5');
  await expect.poll(async () => (await editorSelection(page)).length).toBe(8);
  const c5 = (await spaceBox(page, 'C5'))!;
  await page.touchscreen.tap(c5.x, c5.y);
  await page.waitForTimeout(50);
  await page.touchscreen.tap(c5.x, c5.y);
  await expect.poll(() => editorSelection(page)).toEqual(['C5']);
  for (const label of ['C6', 'C2']) {
    await tap(label);
    await expect.poll(() => editorSelection(page)).toEqual([label]);
  }
  // Drag the selected space with a finger.
  const cdp = await context.newCDPSession(page);
  const a = (await spaceBox(page, 'C2'))!;
  const send = (type: string, x?: number, y?: number) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: x === undefined ? [] : [{ x, y: y! }] });
  await send('touchStart', a.x, a.y);
  for (let i = 1; i <= 8; i++) await send('touchMove', a.x, a.y + i * 10);
  await send('touchEnd');
  await expect.poll(async () => Math.round((await spaceBox(page, 'C2'))!.y - a.y)).toBeGreaterThan(40);
});
