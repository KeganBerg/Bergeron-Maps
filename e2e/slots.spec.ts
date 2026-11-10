import { expect, test } from '@playwright/test';

/** Seeds maps straight into the app's browser storage. */
async function seed(page: import('@playwright/test').Page, site: string, names: string[], publish: number) {
  await page.goto('/');
  await page.evaluate(async ({ site, names, publish }) => {
    const { createQuickLot } = await import('/src/model/quickLot.ts');
    const { QUICK_LOT_DEFAULTS } = await import('/src/model/quickLot.ts');
    const { repository } = await import('/src/storage/indexedDbRepository.ts');
    for (const [i, name] of names.entries()) {
      const doc = await repository.createMap(createQuickLot(name, QUICK_LOT_DEFAULTS), site);
      if (i < publish) await repository.publishMap(doc.id);
    }
  }, { site, names, publish });
  await page.reload();
}

test('each site shows 5 save slots and blocks a sixth map and a third published map', async ({ page }) => {
  await seed(page, 'North Garage', ['Level A', 'Level B', 'Level C'], 2);
  const site = page.getByTestId('site-North Garage');
  await expect(page.getByTestId('site-meta-North Garage')).toContainText('3 of 5 slots used · 2 of 2 published');
  await expect(site.getByTestId('slot-North Garage-4')).toContainText('Empty');
  await expect(site.locator('li.map-card-filled')).toHaveCount(3);

  // Publishing a third map is refused with a plain explanation.
  await page.getByTestId('open-Level C').click();
  await page.getByTestId('publish').click();
  await expect(page.getByTestId('notice').first()).toContainText('already has 2 live maps');
  await page.getByRole('button', { name: 'All maps' }).click();

  // Unpublishing one frees a place.
  await page.getByTestId('unpublish-Level A').click();
  await page.getByRole('dialog').getByRole('button', { name: 'Unpublish', exact: true }).click();
  await expect(page.getByTestId('site-meta-North Garage')).toContainText('1 of 2 published');

  // Filling the last two slots disables adding and copying.
  await page.evaluate(async () => {
    const { createMap } = await import('/src/model/factory.ts');
    const { repository } = await import('/src/storage/indexedDbRepository.ts');
    await repository.createMap(createMap('Level D'), 'North Garage');
    await repository.createMap(createMap('Level E'), 'North Garage');
  });
  await page.reload();
  await expect(page.getByTestId('slots-full-North Garage')).toContainText('All 5 slots are in use');
  await expect(page.getByTestId('add-map-North Garage')).toBeDisabled();
  await expect(site.getByRole('button', { name: 'Copy' }).first()).toBeDisabled();
});
