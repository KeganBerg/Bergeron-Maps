import { expect, test } from '@playwright/test';
import { seedLot, settle, spaceBox } from './pointer-helpers';

test('an employee shares a link to one space, and the link opens on it', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const id = await seedLot(page, { rows: 2, spacesPerRow: 10 }, 'Share Lot');
  await page.goto(`/#/view/${id}`);
  await expect(page.getByTestId('viewer-facility')).toHaveText('Share Lot');
  await settle(page);
  const b = (await spaceBox(page, 'B7'))!;
  await page.mouse.click(b.x, b.y);
  await expect(page.getByTestId('info-card')).toContainText('Space B7');
  await page.getByTestId('share').click();
  await expect(page.getByTestId('share-copied')).toBeVisible();
  const link = await page.evaluate(() => navigator.clipboard.readText());
  expect(link).toMatch(new RegExp(`#/view/${id}\\?at=`));

  // Someone else opens it: the map opens on B7, with its card showing and B7 near the middle.
  const other = await context.newPage();
  await other.goto(link);
  await expect(other.getByTestId('info-card')).toContainText('Space B7');
  await settle(other);
  await other.waitForTimeout(200);
  const at = (await spaceBox(other, 'B7'))!;
  const map = (await other.locator('.konvajs-content').first().boundingBox())!;
  expect(Math.abs(at.x - (map.x + map.width / 2))).toBeLessThan(map.width / 4);
  expect(at.inside).toBe(true);
});
