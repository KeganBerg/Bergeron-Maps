import { expect, test } from '@playwright/test';

test('employee finds a space on a phone and sees it highlighted on the right floor', async ({ page }) => {
  // Build a two-floor map through the editor UI is desktop-only; seed it via the app's own storage instead.
  await page.goto('/');
  const id = await page.evaluate(async () => {
    const { createMap, createFloor } = await import('/src/model/factory.ts');
    const { buildRowSpaces, DEFAULT_ROW } = await import('/src/model/rows.ts');
    const { repository } = await import('/src/storage/indexedDbRepository.ts');
    const doc = createMap('Harbor Hotel Garage');
    const f2 = createFloor('Level 2');
    doc.floors.push(f2);
    const spec = { ...DEFAULT_ROW, id: 'row_b', prefix: 'B', count: 20 };
    f2.rows[spec.id] = spec;
    f2.objects.push(...buildRowSpaces(spec, { x: 0, y: 0, rotation: 0 }, f2.layers[2].id));
    await repository.createMap(doc);
    await repository.publishMap(doc.id);
    return doc.id;
  });
  await page.goto(`/#/view/${id}`);
  await expect(page.getByTestId('viewer-facility')).toHaveText('Harbor Hotel Garage');
  await expect(page.getByTestId('viewer-floor-Floor 1')).toHaveAttribute('aria-pressed', 'true');

  await page.getByTestId('viewer-search').fill('b16');
  await page.getByTestId('viewer-search').press('Enter');
  await expect(page.getByTestId('viewer-floor-Level 2')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('info-card')).toContainText('Space B16');
  await expect(page.getByTestId('info-card')).toContainText('Level 2');

  await page.getByTestId('viewer-search').fill('Z99');
  await expect(page.getByTestId('search-results')).toContainText('No space or landmark called “Z99”');
  await page.getByTestId('reset-view').click();
  // No editing controls in the employee view.
  await expect(page.getByTestId('tool-row')).toHaveCount(0);
});
