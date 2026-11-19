import { expect, test } from '@playwright/test';
import { seedGarage, findSpace } from './directions-shared';

test('phone: the card keeps Close at the top right and Share beside Directions', async ({ page }) => {
  const { id } = await seedGarage(page, 'Card Garage');
  await page.goto(`/#/view/${id}`);
  await findSpace(page, '1D3');
  const card = (await page.getByTestId('info-card').boundingBox())!;
  const close = (await page.getByTestId('info-card').getByRole('button', { name: 'Close' }).boundingBox())!;
  const share = (await page.getByTestId('share').boundingBox())!;
  const dirs = (await page.getByTestId('directions').boundingBox())!;
  expect(close.y).toBeLessThan(dirs.y); // on the title row
  expect(close.x + close.width).toBeGreaterThan(card.x + card.width - 60);
  expect(Math.abs(share.y + share.height / 2 - (dirs.y + dirs.height / 2))).toBeLessThan(6); // same row as Directions
  expect(share.x).toBeGreaterThan(dirs.x + dirs.width);
});
