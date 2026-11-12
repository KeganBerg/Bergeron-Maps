import { expect, test } from '@playwright/test';
import { newMap } from './helpers';

const viewport = (page: import('@playwright/test').Page) =>
  page.evaluate(async () => (await import('/src/editor/store.ts')).useEditor.getState().viewport);

test('mouse wheel zooms around the pointer in small steps', async ({ page }) => {
  await newMap(page, 'Wheel Lot');
  const c = (await page.getByTestId('canvas').boundingBox())!;
  const p = { x: c.width * 0.3, y: c.height * 0.6 };
  await page.mouse.move(c.x + p.x, c.y + p.y);
  const v0 = await viewport(page);
  const world = { x: (p.x - v0.x) / v0.scale, y: (p.y - v0.y) / v0.scale };
  await page.mouse.wheel(0, -100);
  await expect.poll(async () => (await viewport(page)).scale).toBeGreaterThan(v0.scale * 1.1);
  const v1 = await viewport(page);
  expect(v1.scale).toBeLessThan(v0.scale * 1.3);
  // The spot under the pointer stays put.
  expect(p.x - world.x * v1.scale - v1.x).toBeCloseTo(0, 0);
  expect(p.y - world.y * v1.scale - v1.y).toBeCloseTo(0, 0);

  // Ctrl + wheel is no longer a huge jump.
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, 100);
  await page.keyboard.up('Control');
  await expect.poll(async () => (await viewport(page)).scale).toBeLessThan(v1.scale);
  expect((await viewport(page)).scale).toBeGreaterThan(v1.scale * 0.75);
});

test('dragging with the middle button pans, even past the canvas edge', async ({ page }) => {
  await newMap(page, 'Pan Lot');
  const c = (await page.getByTestId('canvas').boundingBox())!;
  const v0 = await viewport(page);
  await page.mouse.move(c.x + 200, c.y + 200);
  await page.mouse.down({ button: 'middle' });
  await page.mouse.move(c.x + 150, c.y + 150, { steps: 3 });
  await page.mouse.move(c.x - 50, c.y + 100, { steps: 3 }); // off the canvas
  await page.mouse.up({ button: 'middle' });
  const v1 = await viewport(page);
  expect(v1.x).toBeCloseTo(v0.x - 250, 0);
  expect(v1.y).toBeCloseTo(v0.y - 100, 0);
  // Released outside: moving back doesn't keep panning.
  await page.mouse.move(c.x + 300, c.y + 300);
  expect(await viewport(page)).toEqual(v1);
});
