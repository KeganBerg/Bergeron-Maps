import { expect, test, type Page } from '@playwright/test';

/**
 * The biggest lot the quick builder makes: 12 floors x 2,080 spaces. Moving or
 * undoing a full-floor selection used to take from 7 seconds to over a minute.
 * The limits here are loose (CI machines are slow) but far below the old times.
 */
test.describe.configure({ timeout: 120_000 });

async function bigLot(page: Page) {
  await page.goto('/');
  await page.getByTestId('new-map').click();
  await page.getByTestId('map-name-input').fill('Big Garage');
  await page.getByTestId('mode-quick').click();
  for (const [k, v] of [['floors', 12], ['rows', 26], ['spacesPerRow', 80]] as const) await page.getByTestId(`quick-${k}`).fill(String(v));
  await page.getByTestId('create-map').click();
  await expect(page.getByTestId('canvas').locator('canvas').first()).toBeVisible();
  const c = (await page.getByTestId('canvas').boundingBox())!;
  await page.mouse.click(c.x + 5, c.y + c.height - 5);
  return c;
}

const settle = (page: Page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 0)))));

async function timed(page: Page, run: () => Promise<unknown>) {
  const t = Date.now();
  await run();
  await settle(page);
  return Date.now() - t;
}

const firstSpace = (page: Page) =>
  page.evaluate(async () => {
    const s = (await import('/src/editor/store.ts')).useEditor.getState();
    const f = s.doc!.floors.find((x) => x.id === s.floorId)!;
    const o = f.objects.find((x) => x.kind === 'space')!;
    return { id: o.id, x: o.x, y: o.y, count: f.objects.length, sx: o.x * s.viewport.scale + s.viewport.x, sy: o.y * s.viewport.scale + s.viewport.y };
  });

test('select all, paste, move and undo stay quick on a 2,000-space floor', async ({ page }) => {
  await bigLot(page);
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Control+c');
  expect(await timed(page, () => page.keyboard.press('Control+v'))).toBeLessThan(5000);
  // Moving the pasted block was ~10 seconds.
  expect(await timed(page, () => page.keyboard.press('ArrowRight'))).toBeLessThan(3000);
  // Undo with thousands of spaces selected was ~6 seconds.
  expect(await timed(page, () => page.keyboard.press('Control+z'))).toBeLessThan(3000);
  expect(await timed(page, () => page.keyboard.press('Control+z'))).toBeLessThan(3000);
  expect((await firstSpace(page)).count).toBeLessThan(2200);
});

test('dragging a whole floor moves it, saves once and undoes in one step', async ({ page }) => {
  const c = await bigLot(page);
  await page.keyboard.press('Control+a');
  await settle(page);
  const before = await firstSpace(page);
  const past = await page.evaluate(async () => (await import('/src/editor/store.ts')).useEditor.getState().past.length);
  await page.mouse.move(c.x + before.sx, c.y + before.sy);
  await page.mouse.down();
  // Each move used to take ~9 seconds with a full floor selected.
  const t = Date.now();
  for (let i = 1; i <= 5; i++) {
    await page.mouse.move(c.x + before.sx + i * 8, c.y + before.sy + i * 5);
    await settle(page);
  }
  expect(Date.now() - t).toBeLessThan(10_000);
  await page.mouse.up();
  await settle(page);
  const after = await firstSpace(page);
  expect(after.x).not.toBe(before.x);
  expect(after.y).not.toBe(before.y);
  // The drawn space sits where the saved one says.
  const drawn = await page.evaluate((id) => {
    const n = (window as unknown as { Konva: { stages: { findOne(s: string): { x(): number; y(): number } }[] } }).Konva.stages[0].findOne(`#${id}`);
    return { x: n.x(), y: n.y() };
  }, after.id);
  expect(drawn).toEqual({ x: after.x, y: after.y });
  expect(await page.evaluate(async () => (await import('/src/editor/store.ts')).useEditor.getState().past.length)).toBe(past + 1);
  await page.keyboard.press('Control+z');
  await settle(page);
  const undone = await firstSpace(page);
  expect({ x: undone.x, y: undone.y }).toEqual({ x: before.x, y: before.y });
  const redrawn = await page.evaluate((id) => {
    const n = (window as unknown as { Konva: { stages: { findOne(s: string): { x(): number; y(): number } }[] } }).Konva.stages[0].findOne(`#${id}`);
    return { x: n.x(), y: n.y() };
  }, before.id);
  expect(redrawn).toEqual({ x: before.x, y: before.y });
});
