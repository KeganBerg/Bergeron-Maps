import { expect, test } from '@playwright/test';
import { spaceBox } from './pointer-helpers';

test('on a phone, asking where you start from keeps the destination above the panel', async ({ page }) => {
  await page.goto('/');
  const id = await page.evaluate(async () => {
    const { createQuickLot, QUICK_LOT_DEFAULTS } = await import('/src/model/quickLot.ts');
    const { repository } = await import('/src/storage/indexedDbRepository.ts');
    const doc = createQuickLot('Harbor Garage', { ...QUICK_LOT_DEFAULTS, floors: 3 });
    await repository.createMap(doc);
    await repository.publishMap(doc.id);
    return doc.id;
  });
  await page.goto(`/#/view/${id}`);
  await page.getByTestId('viewer-search').fill('B1');
  await page.getByTestId('viewer-search').press('Enter');
  await page.getByTestId('directions').tap();
  const sheet = (await page.locator('.dir-sheet').first().boundingBox())!;
  const at = (await spaceBox(page, '1B1'))!;
  expect(at.y, JSON.stringify({ sheet, at })).toBeLessThan(sheet.y - 10);
  expect(at.y).toBeGreaterThan(0);
});
