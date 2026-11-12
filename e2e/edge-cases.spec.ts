import { expect, test } from '@playwright/test';
import { newMap, waitSaved } from './helpers';

/** Careless-user cases: double clicks, refreshes mid-edit, blanked names, damaged maps. */

test('double-clicking Create makes one map, not two', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('new-map').click();
  await page.getByTestId('map-name-input').fill('Double Click Site');
  await page.getByTestId('create-map').dblclick();
  await expect(page.getByTestId('save-status')).toBeVisible();
  await page.getByRole('button', { name: 'All maps' }).click();
  await expect(page.getByTestId('site-meta-Double Click Site')).toContainText('1 of 5 slots used');
});

test('refreshing right after an edit offers to recover it', async ({ page }) => {
  await newMap(page, 'Refresh Site');
  await waitSaved(page);
  page.on('dialog', (d) => void d.accept());
  const name = page.getByTestId('map-name-input-top');
  await name.fill('Renamed just before refresh');
  await name.press('Enter');
  await page.reload();
  await page.getByRole('button', { name: 'Recover changes' }).click();
  await expect(name).toHaveValue('Renamed just before refresh');
});

test('clearing the map name puts the real name back instead of showing a blank', async ({ page }) => {
  await newMap(page, 'Keep My Name');
  const name = page.getByTestId('map-name-input-top');
  await name.fill('   ');
  await name.press('Enter');
  await expect(name).toHaveValue('Keep My Name');
});

test('a map that fails to draw shows a way back instead of a white page', async ({ page }) => {
  await page.goto('/');
  const id = await page.evaluate(async () => {
    const { createQuickLot, QUICK_LOT_DEFAULTS } = await import('/src/model/quickLot.ts');
    const { repository } = await import('/src/storage/indexedDbRepository.ts');
    const doc = createQuickLot('Broken', QUICK_LOT_DEFAULTS);
    // Stored data the app can't draw (written by something other than the editor).
    (doc.floors[0].objects[0] as unknown as { cuts: unknown }).cuts = 'bad';
    return (await repository.createMap(doc, 'Broken site')).id;
  });
  await page.goto(`/#/edit/${id}`);
  await expect(page.getByTestId('crash')).toContainText('Something went wrong');
  await page.getByRole('button', { name: 'Back to maps' }).click();
  await expect(page.getByTestId('site-Broken site')).toBeVisible();
});
