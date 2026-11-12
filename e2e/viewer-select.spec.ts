import { expect, test } from '@playwright/test';

// Regression: the viewer captured the mouse pointer, so desktop clicks on a space never reached the map.
test('clicking a space with a mouse opens its card and highlights it', async ({ page }) => {
  await page.goto('/');
  const id = await page.evaluate(async () => {
    const { createQuickLot, QUICK_LOT_DEFAULTS } = await import('/src/model/quickLot.ts');
    const { repository } = await import('/src/storage/indexedDbRepository.ts');
    const doc = createQuickLot('Click Lot', QUICK_LOT_DEFAULTS);
    await repository.createMap(doc);
    await repository.publishMap(doc.id);
    return doc.id;
  });
  await page.goto(`/#/view/${id}`);
  await expect(page.getByTestId('viewer-facility')).toHaveText('Click Lot');
  type Node = { getClientRect: () => { x: number; y: number; width: number; height: number }; findOne: (s: string) => { text: () => string } | undefined };
  type St = { find: (s: string) => Node[]; container: () => HTMLElement };
  const stage = () => (window as unknown as { Konva: { stages: St[] } }).Konva.stages[0];
  await expect.poll(() => page.evaluate(`(${stage})().find('.obj').length`)).toBeGreaterThan(0);
  const where = () => page.evaluate(() => {
    const st = (window as unknown as { Konva: { stages: St[] } }).Konva.stages[0];
    const g = st.find('.obj').find((n) => n.findOne('Text')?.text() === 'B4')!;
    const r = g.getClientRect();
    const b = st.container().getBoundingClientRect();
    return { x: b.left + r.x + r.width / 2, y: b.top + r.y + r.height / 2 };
  });
  // Wait for the fit-to-screen to settle before measuring where B4 is.
  let pos = await where();
  await expect.poll(async () => {
    const next = await where();
    const same = next.x === pos.x && next.y === pos.y;
    pos = next;
    return same;
  }).toBe(true);
  await page.mouse.click(pos.x, pos.y);
  await expect(page.getByTestId('info-card')).toContainText('Space B4');
  await expect.poll(() => page.evaluate(`(${stage})().find('.focus-ring').length`)).toBe(1);
  // A drag is a pan, not a tap: the card stays on B4.
  await page.mouse.move(pos.x, pos.y);
  await page.mouse.down();
  await page.mouse.move(pos.x + 80, pos.y + 40, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByTestId('info-card')).toContainText('Space B4');
});
