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

test('tapping a space highlights it, search outlines matches, closing the card clears it', async ({ page }) => {
  await page.goto('/');
  const id = await page.evaluate(async () => {
    const { createMap } = await import('/src/model/factory.ts');
    const { buildRowSpaces, DEFAULT_ROW } = await import('/src/model/rows.ts');
    const { repository } = await import('/src/storage/indexedDbRepository.ts');
    const doc = createMap('Tap Lot');
    const f = doc.floors[0];
    const spec = { ...DEFAULT_ROW, id: 'row_a', prefix: '', count: 8 };
    f.rows[spec.id] = spec;
    f.objects.push(...buildRowSpaces(spec, { x: 0, y: 0, rotation: 0 }, f.layers[2].id));
    await repository.createMap(doc);
    await repository.publishMap(doc.id);
    return doc.id;
  });
  await page.goto(`/#/view/${id}`);
  await expect(page.getByTestId('viewer-facility')).toHaveText('Tap Lot');
  const count = (name: string) => page.evaluate((n) => {
    const K = (window as unknown as { Konva: { stages: { find: (s: string) => unknown[] }[] } }).Konva;
    return K.stages[0].find(`.${n}`).length;
  }, name);
  // Tap space 3 at its on-screen position.
  const pos = await page.evaluate(() => {
    const K = (window as unknown as { Konva: { stages: { findOne: (s: string) => { getClientRect: () => { x: number; y: number; width: number; height: number } } | undefined; container: () => HTMLElement }[] } }).Konva;
    const st = K.stages[0];
    const g = (st as unknown as { find: (s: string) => { getClientRect: () => { x: number; y: number; width: number; height: number }; findOne: (s: string) => { text: () => string } | undefined }[] })
      .find('.obj').find((n) => n.findOne('Text')?.text() === '3');
    const r = g!.getClientRect();
    const b = st.container().getBoundingClientRect();
    return { x: b.left + r.x + r.width / 2, y: b.top + r.y + r.height / 2 };
  });
  await page.touchscreen.tap(pos.x, pos.y);
  await expect(page.getByTestId('info-card')).toContainText('Space 3');
  await expect.poll(() => count('focus-ring')).toBe(1);

  await page.getByTestId('info-card').getByRole('button', { name: 'Close' }).click();
  await expect.poll(() => count('focus-ring')).toBe(0);

  await page.getByTestId('viewer-search').fill('1');
  await expect(page.getByTestId('search-results')).toContainText('Space 1');
  await expect.poll(() => count('search-match')).toBeGreaterThan(0);
});
