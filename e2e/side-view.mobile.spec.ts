import { expect, test } from '@playwright/test';
import { findSpace, seedGarage } from './directions-shared';

const SHOTS = process.env.SIDE_VIEW_SHOTS;

test('phone: the side view fits the screen and a tap opens the floor', async ({ page }) => {
  const { id } = await seedGarage(page);
  await page.goto(`/#/view/${id}`);
  await findSpace(page, '3C9');
  await page.getByTestId('side-view-toggle').tap();
  const sheet = page.getByTestId('side-view');
  await expect(sheet).toBeVisible();
  const vw = page.viewportSize()!.width;
  const svg = (await sheet.locator('svg.sv').boundingBox())!;
  expect(svg.x).toBeGreaterThanOrEqual(0);
  expect(svg.x + svg.width).toBeLessThanOrEqual(vw);
  // The callout stays inside the drawing.
  const callout = (await page.getByTestId('sv-callout').boundingBox())!;
  expect(callout.x).toBeGreaterThanOrEqual(0);
  expect(callout.x + callout.width).toBeLessThanOrEqual(vw);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/phone-found.png` });
  await sheet.getByRole('button', { name: /Open Floor 2/ }).tap();
  await expect(page.getByTestId('viewer-floor-Floor 2')).toHaveAttribute('aria-pressed', 'true');
});
