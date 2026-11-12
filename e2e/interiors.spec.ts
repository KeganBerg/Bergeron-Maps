import { expect, test } from '@playwright/test';
import { addFromLibrary, newMap } from './helpers';

test('a building opens its own floor plan in the editor and the viewer', async ({ page }) => {
  await newMap(page, 'Dealership');
  await addFromLibrary(page, 'service-department');
  await expect(page.getByTestId('enter-building')).toHaveText(/Build the inside/);
  await page.getByTestId('enter-building').click();

  // Inside: its own floors, a way back out, and the office library.
  await expect(page.getByTestId('building-crumb')).toHaveText('Service department 1');
  await expect(page.getByTestId('floor-tab-Floor 1')).toBeVisible();
  await addFromLibrary(page, 'cubicle-cluster');
  await expect(page.getByTestId('selected-name')).toHaveText('Cubicle cluster 1');
  await addFromLibrary(page, 'conference-table');
  await page.getByTestId('add-floor').click();
  await expect(page.getByTestId('floor-tab-Floor 2')).toBeVisible();

  await page.getByTestId('exit-building').click();
  await expect(page.getByTestId('building-crumb')).toHaveCount(0);
  await expect(page.getByTestId('floor-tab-Floor 2')).toHaveCount(0);
  await expect(page.getByTestId('selected-name')).toHaveText('Service department 1');
  await expect(page.getByTestId('enter-building')).toHaveText(/Open floor plan/);

  await page.getByTestId('publish').click();
  await expect(page.getByTestId('publish')).toHaveAttribute('data-state', 'current');
  const id = page.url().split('/edit/')[1];
  await page.goto(`/#/view/${id}`);
  await expect(page.getByTestId('viewer-facility')).toHaveText('Dealership');
  const box = (await page.locator('.viewer-canvas').boundingBox())!;
  await expect(async () => {
    await page.mouse.click(box.x + box.width / 2 + 30, box.y + box.height / 2 + 30);
    await expect(page.getByTestId('info-card')).toContainText('Service department 1', { timeout: 500 });
  }).toPass();
  await page.getByTestId('go-inside').click();
  await expect(page.getByTestId('viewer-building')).toHaveText('Service department 1');
  await expect(page.getByTestId('viewer-floor-Floor 2')).toBeVisible();

  await page.getByTestId('viewer-search').fill('conference table');
  await expect(page.getByTestId('search-results')).toContainText('Service department 1 · Floor 1');

  await page.getByTestId('go-outside').click();
  await expect(page.getByTestId('viewer-building')).toHaveCount(0);
  await expect(page.getByTestId('info-card')).toContainText('Service department 1');
});

test('double-clicking a building with a floor plan goes inside', async ({ page }) => {
  await newMap(page, 'Offices');
  await addFromLibrary(page, 'office-building');
  await page.getByTestId('enter-building').click();
  await page.getByTestId('exit-building').click();
  const c = (await page.getByTestId('canvas').boundingBox())!;
  await page.mouse.dblclick(c.x + c.width / 2, c.y + c.height / 2);
  await expect(page.getByTestId('building-crumb')).toBeVisible();
});
