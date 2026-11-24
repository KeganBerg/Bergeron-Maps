import { expect, test, type Page } from '@playwright/test';
import { seedGarage, findSpace } from './directions-shared';

/** Viewer audit, 2026-11-19: QR "you are here" links, search during directions, Escape, Refresh. */

const garage = (page: Page) => seedGarage(page, 'Viewer Audit Garage');

async function objectId(page: Page, mapId: string, floor: number, test: string) {
  return page.evaluate(async ([id, f, t]) => {
    const { repository } = await import('/src/storage/indexedDbRepository.ts');
    const d = (await repository.getMap(id as string))!;
    return d.floors[f as number].objects.find((o) => new RegExp(t as string).test(o.kind === 'asset' ? o.assetKey : ''))!.id;
  }, [mapId, floor, test] as const);
}

const hereMarkers = (page: Page) =>
  page.evaluate(() => (window as unknown as { Konva: { stages: { find: (s: string) => unknown[] }[] } }).Konva.stages[0].find('.here-marker').length);

test('a QR link opens on the floor of the sign and says "You are here"', async ({ page }) => {
  const { id } = await garage(page);
  const el = await objectId(page, id, 2, '^elevator$');
  await page.goto(`/#/view/${id}?from=${el}`);
  await expect(page.locator('.viewer-header .titles')).toContainText('Floor 3');
  await expect(page.getByTestId('info-card')).toContainText('You are here');
  expect(await hereMarkers(page)).toBe(1);
  // Directions to a space start from the sign, with no question asked.
  await findSpace(page, '1D3');
  await page.getByTestId('directions').click();
  await expect(page.getByTestId('dir-summary')).toContainText('from Elevator 1');
  // The marker steps aside while a route (with its own start ring) is drawn.
  await page.getByTestId('viewer-floor-Floor 3').click();
  expect(await hereMarkers(page)).toBe(0);
});

test('searching while directions are up shows what was found, not the old route', async ({ page }) => {
  const { id } = await garage(page);
  await page.goto(`/#/view/${id}`);
  await findSpace(page, '3A1');
  await page.getByTestId('directions').click();
  await page.getByTestId('dir-start').first().click();
  await expect(page.getByTestId('dir-summary')).toBeVisible();
  await findSpace(page, '2B4');
  await expect(page.getByTestId('directions-sheet')).toHaveCount(0);
  await expect(page.locator('.viewer-header .titles')).toContainText('Floor 2');
});

test('Escape backs out of tap mode, directions and the card, one step at a time', async ({ page }) => {
  const { id } = await garage(page);
  await page.goto(`/#/view/${id}`);
  await findSpace(page, '1B2');
  await page.getByTestId('directions').click();
  await page.getByTestId('dir-tap').click();
  await expect(page.getByTestId('dir-tap-banner')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('directions-sheet')).toContainText('Where are you starting from?');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('directions-sheet')).toHaveCount(0);
  await expect(page.getByTestId('info-card')).toContainText('Space 1B2');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('info-card')).toHaveCount(0);
});

test('Refresh drops the card of a space the manager removed, and redraws the route on the new map', async ({ page }) => {
  const { id } = await garage(page);
  await page.goto(`/#/view/${id}`);
  await findSpace(page, '1B5');
  const removeAndPublish = (label: string) => page.evaluate(async ([mid, l]) => {
    const { repository } = await import('/src/storage/indexedDbRepository.ts');
    const d = (await repository.getMap(mid))!;
    for (const f of d.floors) f.objects = f.objects.filter((o) => !(o.kind === 'space' && o.label === l));
    await repository.saveMap(d, d.revision);
    await repository.publishMap(mid);
  }, [id, label] as const);
  await removeAndPublish('1B5');
  await page.getByLabel('Refresh map').click();
  await expect(page.getByTestId('info-card')).toHaveCount(0);

  await findSpace(page, '1D3');
  await page.getByTestId('directions').click();
  await page.getByTestId('dir-start').first().click();
  await expect(page.getByTestId('dir-summary')).toBeVisible();
  await removeAndPublish('1A1');
  await page.getByLabel('Refresh map').click();
  // Still there, worked out again (not thrown away).
  await expect(page.getByTestId('dir-summary')).toBeVisible();
  await removeAndPublish('1D3');
  await page.getByLabel('Refresh map').click();
  await expect(page.getByTestId('directions-sheet')).toHaveCount(0);
});

test('a newly published version shows up by itself when someone comes back to the page', async ({ page }) => {
  const { id } = await garage(page);
  await page.goto(`/#/view/${id}`);
  await findSpace(page, '1B5');
  await page.evaluate(async (mid) => {
    const { repository } = await import('/src/storage/indexedDbRepository.ts');
    const d = (await repository.getMap(mid))!;
    for (const f of d.floors) f.objects = f.objects.filter((o) => !(o.kind === 'space' && o.label === '1B5'));
    await repository.saveMap(d, d.revision);
    await repository.publishMap(mid);
  }, id);
  // Nothing happens until the page is shown again (no Refresh pressed).
  await expect(page.getByTestId('info-card')).toContainText('1B5');
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(page.getByTestId('info-card')).toHaveCount(0);
  await expect(page.getByTestId('viewer-floor-announce')).toHaveText('The map was updated to the latest published version.');
  // Coming back again with nothing new published doesn't reload or announce anything.
  await page.waitForTimeout(2600);
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await page.waitForTimeout(300);
  await expect(page.getByTestId('viewer-floor-announce')).toHaveText('');
});
