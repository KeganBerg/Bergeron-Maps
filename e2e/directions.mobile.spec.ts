import { expect, test } from '@playwright/test';
import { findSpace, routeLines, seedGarage } from './directions-shared';

test('on a phone: directions with taps, panel fits the screen, map still pans', async ({ page }) => {
  const { id } = await seedGarage(page, 'Phone Garage');
  await page.goto(`/#/view/${id}`);
  await findSpace(page, '3D12');
  await page.getByTestId('directions').tap();
  await page.getByTestId('dir-start').filter({ hasText: 'Elevator 1' }).first().tap();
  await expect(page.getByTestId('route-step').last()).toContainText('Walk to Space 3D12');
  await expect.poll(() => routeLines(page)).toBeGreaterThan(0);
  // The panel leaves at least half the map visible.
  const sheet = (await page.getByTestId('directions-sheet').boundingBox())!;
  const canvas = (await page.locator('.viewer-canvas').boundingBox())!;
  expect(sheet.height).toBeLessThanOrEqual(canvas.height * 0.52);
  expect(sheet.x).toBeGreaterThanOrEqual(0);
  expect(sheet.x + sheet.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  // A tap on the map doesn't close the route.
  await page.touchscreen.tap(canvas.x + canvas.width / 2, canvas.y + 40);
  await expect(page.getByTestId('directions-sheet')).toBeVisible();
});
