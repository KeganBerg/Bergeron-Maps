import { expect, test, type Page } from '@playwright/test';
import { findSpace, seedGarage } from './directions-shared';

const SHOTS = process.env.SIDE_VIEW_SHOTS;

async function seed(page: Page, floors: number, names?: string[]) {
  await page.goto('/');
  return page.evaluate(async ({ floors, names }) => {
    const { createQuickLot } = await import('/src/model/quickLot.ts');
    const { repository } = await import('/src/storage/indexedDbRepository.ts');
    const doc = createQuickLot('Side Garage', { floors, rows: 2, spacesPerRow: 8, accessible: 0 });
    if (names) doc.floors.forEach((f, i) => { f.name = names[i] ?? f.name; });
    // Its own site each time: a site has only one live map.
    await repository.createMap(doc, `Side Garage ${floors}`);
    await repository.publishMap(doc.id);
    return doc.id;
  }, { floors, names });
}

test('the side view stacks every floor, marks the space found, and opens a floor when tapped', async ({ page }) => {
  const { id } = await seedGarage(page);
  await page.goto(`/#/view/${id}`);
  await findSpace(page, '3C9');
  await page.getByTestId('side-view-toggle').click();
  const sheet = page.getByTestId('side-view');
  await expect(sheet).toBeVisible();
  await expect(sheet).toBeFocused();
  await expect(sheet.locator('.sv-floor')).toHaveCount(3);
  // Bottom to top, Floor 3 on top, the floor on screen marked as current.
  const names = await sheet.locator('.sv-floor text').allTextContents();
  expect(names).toEqual(['Floor 1', 'Floor 2', 'Floor 3']);
  await expect(sheet.getByRole('button', { name: /Open Floor 3, shown now/ })).toBeVisible();
  await expect(page.getByTestId('sv-callout')).toHaveText(/^3C9, Floor 3/);
  await expect(page.getByTestId('side-view-key')).toContainText(/Ramp|Stairs|Elevator/);
  // The space card waits behind the side view.
  await expect(page.getByTestId('info-card')).toHaveCount(0);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/desktop-found.png` });

  await sheet.getByRole('button', { name: /Open Floor 1/ }).click();
  await expect(sheet).toHaveCount(0);
  await expect(page.getByTestId('viewer-floor-Floor 1')).toHaveAttribute('aria-pressed', 'true');

  // Keyboard: Enter opens a floor, Escape closes and gives focus back to the button.
  await page.getByTestId('side-view-toggle').click();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('side-view')).toHaveCount(0);
  await expect(page.getByTestId('side-view-toggle')).toBeFocused();
  await page.getByTestId('side-view-toggle').click();
  await page.getByTestId('side-view').getByRole('button', { name: /Open Floor 2/ }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('viewer-floor-Floor 2')).toHaveAttribute('aria-pressed', 'true');
});

test('the side view draws the route across floors while directions are up', async ({ page }) => {
  const { id } = await seedGarage(page);
  await page.goto(`/#/view/${id}`);
  await findSpace(page, '3C9');
  await page.getByTestId('directions').click();
  await page.getByTestId('dir-start').filter({ hasText: 'Entrance' }).first().click();
  await expect(page.getByTestId('route-step')).toHaveCount(3);
  await page.getByTestId('side-view-toggle').click();
  await expect(page.locator('.sv-route path')).toHaveCount(1);
  await expect(page.getByTestId('side-view-key')).toContainText('Your route');
  await expect(page.getByTestId('directions-sheet')).toHaveCount(0);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/desktop-route.png` });
  // Closing it brings the directions back; the route is still up.
  await page.getByTestId('side-view-close').click();
  await expect(page.getByTestId('route-step')).toHaveCount(3);
  // Opening a floor from the side view keeps the route.
  await page.getByTestId('side-view-toggle').click();
  await page.getByTestId('side-view').getByRole('button', { name: /Open Floor 3/ }).click();
  await expect(page.getByTestId('viewer-floor-Floor 3')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('route-step')).toHaveCount(3);
});

test('one floor has no side view; many floors and basements still fit', async ({ page }) => {
  const one = await seed(page, 1);
  await page.goto(`/#/view/${one}`);
  await expect(page.getByTestId('viewer-search')).toBeVisible();
  await expect(page.getByTestId('side-view-toggle')).toHaveCount(0);

  const names = ['Ground', 'Level 2', 'Level 3', 'Level 4', 'Level 5', 'Level 6', 'Level 7', 'Level 8', 'Level 9', 'Roof', 'B1', 'B2'];
  const many = await seed(page, 12, names);
  await page.goto(`/#/view/${many}`);
  await page.getByTestId('side-view-toggle').click();
  const sheet = page.getByTestId('side-view');
  await expect(sheet.locator('.sv-floor')).toHaveCount(12);
  const order = await sheet.locator('.sv-floor text').allTextContents();
  expect(order.slice(0, 3)).toEqual(['B2', 'B1', 'Ground']);
  expect(order[order.length - 1]).toBe('Roof');
  // The sheet fits on screen; the drawing scrolls inside it.
  const box = (await sheet.boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/desktop-many-floors.png` });
});
