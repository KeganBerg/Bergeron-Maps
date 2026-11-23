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

test('phone: the card is a bottom sheet with a big Directions button, and the map button sits above it', async ({ page }) => {
  const { id } = await seedGarage(page, 'Sheet Garage');
  await page.goto(`/#/view/${id}`);
  await findSpace(page, '1D3');
  const canvas = (await page.locator('.viewer-canvas').boundingBox())!;
  const card = (await page.getByTestId('info-card').boundingBox())!;
  const dirs = (await page.getByTestId('directions').boundingBox())!;
  // Edge to edge along the bottom of the map.
  expect(card.x).toBeLessThanOrEqual(canvas.x + 1);
  expect(card.width).toBeGreaterThanOrEqual(canvas.width - 2);
  expect(Math.abs(card.y + card.height - (canvas.y + canvas.height))).toBeLessThan(2);
  // Directions is the main thing to do: tall and most of the width.
  expect(dirs.height).toBeGreaterThanOrEqual(48);
  expect(dirs.width).toBeGreaterThan(card.width * 0.6);
  // "Show whole floor" never overlaps the card.
  await expect.poll(async () => { const f = (await page.getByTestId('reset-view').boundingBox())!; return f.y + f.height; }).toBeLessThanOrEqual(card.y - 4);
  // The space itself stays above the card.
  const ring = await page.evaluate(() => {
    const K = (window as unknown as { Konva: { stages: { findOne: (s: string) => { getClientRect: () => { y: number; height: number } } | undefined; container: () => HTMLElement }[] } }).Konva;
    const s = K.stages[0];
    const r = s.findOne('.focus-ring')!.getClientRect();
    return r.y + r.height + s.container().getBoundingClientRect().top;
  });
  expect(ring).toBeLessThan(card.y);
});

test('phone: a map with one floor shows no floor bar', async ({ page }) => {
  await page.goto('/');
  const id = await page.evaluate(async () => {
    const { createQuickLot, QUICK_LOT_DEFAULTS } = await import('/src/model/quickLot.ts');
    const { repository } = await import('/src/storage/indexedDbRepository.ts');
    const doc = createQuickLot('One Floor Lot', { ...QUICK_LOT_DEFAULTS, floors: 1 });
    await repository.createMap(doc);
    await repository.publishMap(doc.id);
    return doc.id;
  });
  await page.goto(`/#/view/${id}`);
  await expect(page.getByTestId('viewer-facility')).toHaveText('One Floor Lot');
  await expect(page.getByRole('navigation', { name: 'Floors' })).toHaveCount(0);
});
