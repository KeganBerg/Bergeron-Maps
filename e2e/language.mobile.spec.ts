import { expect, test } from '@playwright/test';

/** The language picker: an employee switches the map to their own language, and it stays that way on this phone. */

async function seedLot(page: import('@playwright/test').Page) {
  await page.goto('/');
  return page.evaluate(async () => {
    const { createQuickLot } = await import('/src/model/quickLot.ts');
    const { repository } = await import('/src/storage/indexedDbRepository.ts');
    const doc = createQuickLot('Harbor Lot', { floors: 2, rows: 2, spacesPerRow: 6, accessible: 0 });
    await repository.createMap(doc);
    await repository.publishMap(doc.id);
    return doc.id;
  });
}

test('an employee picks Spanish: search, the card and directions are in Spanish, and it stays after a reload', async ({ page }) => {
  const id = await seedLot(page);
  await page.goto(`/#/view/${id}`);
  await expect(page.getByTestId('viewer-search')).toHaveAttribute('placeholder', 'Find a space, e.g. B16');

  await page.getByTestId('language-picker').selectOption('es');
  const search = page.getByTestId('viewer-search');
  await expect(search).toHaveAttribute('placeholder', 'Buscar un espacio, por ejemplo B16');
  await expect(page.locator('main.viewer')).toHaveAttribute('lang', 'es');
  // The picker's label keeps the English word, so a coworker can help.
  await expect(page.getByTestId('language-picker')).toHaveAttribute('aria-label', 'Idioma (Language)');

  await search.fill('2B3');
  await search.press('Enter');
  await expect(page.getByTestId('info-card')).toContainText('Espacio 2B3');
  await page.getByTestId('directions').click();
  await expect(page.getByTestId('directions-sheet')).toContainText('¿Desde dónde sale?');
  await page.getByTestId('dir-start').filter({ hasText: 'Entrance' }).first().click();
  await expect(page.getByTestId('route-step').first()).toContainText('Camine hasta');
  // The map's own names (typed by the manager) stay as they are.
  await expect(page.getByTestId('dir-summary')).toContainText('desde Entrance');

  // Switching language with the route up rewords it in place.
  await page.getByTestId('language-picker').selectOption('vi');
  await expect(page.getByTestId('route-step').first()).toContainText('Đi bộ đến');
  await expect(page.getByTestId('directions-sheet')).toContainText('Đến Chỗ đậu 2B3');

  await page.reload();
  await expect(page.getByTestId('viewer-search')).toHaveAttribute('placeholder', 'Tìm chỗ đậu, ví dụ B16');
});

test('a link can open the map in a language (?lang=zh), for signs printed in that language', async ({ page }) => {
  const id = await seedLot(page);
  await page.goto(`/#/view/${id}?lang=zh`);
  await expect(page.getByTestId('viewer-search')).toHaveAttribute('placeholder', '查找车位，例如 B16');
  await expect(page.getByTestId('language-picker')).toHaveValue('zh');
});
