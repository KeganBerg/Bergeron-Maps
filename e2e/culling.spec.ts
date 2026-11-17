import { expect, test, type Page } from '@playwright/test';
import { spacePan } from './real-input';

/**
 * Big floors draw only what is on screen. These check that nothing visible goes
 * missing because of it: the saved picture still holds the whole floor, and
 * clicks still land on the right space after zooming and panning.
 */
test.describe.configure({ timeout: 90_000 });

async function bigFloor(page: Page) {
  await page.goto('/');
  await page.getByTestId('new-map').click();
  await page.getByTestId('map-name-input').fill('Big Floor');
  await page.getByTestId('mode-quick').click();
  for (const [k, v] of [['floors', 1], ['rows', 26], ['spacesPerRow', 80]] as const) await page.getByTestId(`quick-${k}`).fill(String(v));
  await page.getByTestId('create-map').click();
  await expect(page.getByTestId('canvas').locator('canvas').first()).toBeVisible();
  const c = (await page.getByTestId('canvas').boundingBox())!;
  await page.mouse.click(c.x + 5, c.y + c.height - 5);
  return c;
}

const ink = (page: Page) =>
  page.evaluate(async () => {
    const { floorImage } = await import('/src/editor/view.ts');
    const img = (await floorImage())!;
    const bmp = await createImageBitmap(img.blob);
    const cv = new OffscreenCanvas(bmp.width, bmp.height);
    const ctx = cv.getContext('2d')!;
    ctx.drawImage(bmp, 0, 0);
    const data = ctx.getImageData(0, 0, bmp.width, bmp.height).data;
    let n = 0;
    for (let i = 0; i < data.length; i += 4 * 13) if (Math.abs(data[i] - data[0]) + Math.abs(data[i + 1] - data[1]) + Math.abs(data[i + 2] - data[2]) > 30) n++;
    return n;
  });

test('the saved picture holds the whole floor even when zoomed in on a corner', async ({ page }) => {
  const c = await bigFloor(page);
  const whole = await ink(page);
  await page.mouse.move(c.x + 40, c.y + 40);
  for (let i = 0; i < 8; i++) await page.mouse.wheel(0, -300);
  await page.waitForTimeout(300);
  const zoomed = await ink(page);
  expect(whole).toBeGreaterThan(1000);
  expect(Math.abs(zoomed - whole) / whole).toBeLessThan(0.02);
});

test('zoomed in and panned, a click picks the space under the pointer', async ({ page }) => {
  const c = await bigFloor(page);
  await page.mouse.move(c.x + c.width / 2, c.y + c.height / 2);
  for (let i = 0; i < 4; i++) await page.mouse.wheel(0, -300);
  await spacePan(page, { x: c.x + c.width / 2, y: c.y + c.height / 2 }, { x: c.x + c.width / 2 + 300, y: c.y + c.height / 2 + 200 });
  await page.waitForTimeout(600);
  const target = await page.evaluate(async ({ w, h }) => {
    const s = (await import('/src/editor/store.ts')).useEditor.getState();
    const f = s.doc!.floors.find((x) => x.id === s.floorId)!;
    const v = s.viewport;
    // The space closest to the lower right of the screen.
    const d = (x: { x: number; y: number }) => Math.hypot(x.x * v.scale + v.x - w * 0.75, x.y * v.scale + v.y - h * 0.75);
    const o = f.objects.filter((x) => x.kind === 'space').sort((a, b) => d(a) - d(b))[0];
    return { id: o.id, sx: o.x * v.scale + v.x, sy: o.y * v.scale + v.y };
  }, { w: c.width, h: c.height });
  await page.mouse.click(c.x + target.sx, c.y + target.sy);
  await page.waitForTimeout(300);
  expect(target.sx).toBeGreaterThan(c.width * 0.5);
  expect(target.sx).toBeLessThan(c.width * 0.95);
  expect(target.sy).toBeGreaterThan(c.height * 0.5);
  expect(target.sy).toBeLessThan(c.height * 0.95);
  const picked = await page.evaluate(async () => (await import('/src/editor/store.ts')).useEditor.getState().selection);
  // A click picks the space's whole row (a second click picks the space itself).
  expect(picked).toContain(target.id);
});
