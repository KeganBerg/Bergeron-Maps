import { expect, type Page } from '@playwright/test';

export async function newMap(page: Page, name: string) {
  await page.goto('/');
  await page.getByTestId('new-map').click();
  await page.getByTestId('map-name-input').fill(name);
  await page.getByTestId('mode-blank').click();
  await page.getByTestId('create-map').click();
  await expect(page.getByTestId('canvas').locator('canvas').first()).toBeVisible();
}

/** Drag across the canvas with the row tool; returns the canvas box. */
export async function drawRow(page: Page, from: [number, number], to: [number, number]) {
  await page.getByTestId('tool-row').click();
  const c = (await page.getByTestId('canvas').boundingBox())!;
  await page.mouse.move(c.x + from[0], c.y + from[1]);
  await page.mouse.down();
  await page.mouse.move(c.x + (from[0] + to[0]) / 2, c.y + (from[1] + to[1]) / 2, { steps: 4 });
  await page.mouse.move(c.x + to[0], c.y + to[1], { steps: 4 });
  await page.mouse.up();
  return c;
}

export async function waitSaved(page: Page) {
  await expect(page.getByTestId('save-status')).toHaveText(/Saved/, { timeout: 5000 });
}

export async function clickCanvas(page: Page, x: number, y: number, opts?: { shift?: boolean }) {
  const c = (await page.getByTestId('canvas').boundingBox())!;
  if (opts?.shift) await page.keyboard.down('Shift');
  await page.mouse.click(c.x + x, c.y + y);
  if (opts?.shift) await page.keyboard.up('Shift');
}

/** Adds an object from the asset library by searching for it, as a user would. */
export async function addFromLibrary(page: Page, key: string) {
  const search = page.getByTestId('asset-search');
  await search.fill(key.replace(/-/g, ' ').replace(/^space /, '').replace(/ standard$/, ' standard'));
  await page.getByTestId(`asset-${key}`).first().click();
  await search.fill('');
}
