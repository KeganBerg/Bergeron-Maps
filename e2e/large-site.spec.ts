import { expect, test, type Page } from '@playwright/test';

/**
 * Very large sites (see scripts/loadtest). Opening a big floor draws it once, not
 * once at a made-up size and again for real, and the route's draw-in animation
 * redraws only the route, not the thousands of spaces under it.
 */
test.describe.configure({ timeout: 90_000 });

/** Counts full drawings of each Konva layer, by how many children it had. */
async function countDraws(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { Konva?: { Layer: { prototype: Record<string, unknown> } }; __draws: { kids: number; map: boolean }[] };
    w.__draws = [];
    let K: typeof w.Konva;
    const wrap = () => {
      const p = K?.Layer?.prototype;
      if (!p || p.__counted) return;
      p.__counted = true;
      const draw = p.drawScene as (...a: unknown[]) => unknown;
      p.drawScene = function (this: { children?: unknown[]; listening(): boolean }, ...a: unknown[]) {
        // The map layer listens for taps; the route's layer above it doesn't.
        w.__draws.push({ kids: this.children?.length ?? 0, map: this.listening() });
        return draw.apply(this, a);
      };
    };
    Object.defineProperty(window, 'Konva', { configurable: true, get: () => K, set(v) { K = v; wrap(); queueMicrotask(wrap); } });
  });
}
// The floor layer holds a group per map layer; the selection and route layers hold one or two things.
const draws = (page: Page) => page.evaluate(() => (window as unknown as { __draws: { kids: number }[] }).__draws.filter((d) => d.kids >= 3).length);
const resetDraws = (page: Page) => page.evaluate(() => ((window as unknown as { __draws: unknown[] }).__draws = []));

async function seedBigGarage(page: Page) {
  await page.goto('/');
  return page.evaluate(async () => {
    const { createQuickLot } = await import('/src/model/quickLot.ts');
    const { repository } = await import('/src/storage/indexedDbRepository.ts');
    const doc = createQuickLot('Huge Garage', { floors: 3, rows: 26, spacesPerRow: 80, accessible: 4 });
    await repository.createMap(doc);
    await repository.publishMap(doc.id);
    return doc.id;
  });
}

test('the phone map of a 2,000-space floor is drawn once when it opens', async ({ page }) => {
  await countDraws(page);
  const id = await seedBigGarage(page);
  await page.goto('/#/');
  await resetDraws(page);
  await page.goto(`/#/view/${id}`);
  await expect(page.getByTestId('viewer-search')).toBeVisible();
  await page.waitForTimeout(1500);
  // One drawing of the map layer (two allowed: a symbol image may arrive late).
  expect(await draws(page)).toBeLessThanOrEqual(2);
  const size = await page.evaluate(() => {
    const st = (window as unknown as { Konva: { stages: { width(): number }[] } }).Konva.stages[0];
    return st.width();
  });
  expect(size).toBeGreaterThan(360);
});

test('the editor draws a 2,000-space floor once when it opens', async ({ page }) => {
  await countDraws(page);
  const id = await seedBigGarage(page);
  await page.goto('/#/');
  await resetDraws(page);
  await page.goto(`/#/edit/${id}`);
  await expect(page.getByTestId('canvas').locator('canvas').first()).toBeVisible();
  await page.waitForTimeout(1500);
  expect(await draws(page)).toBeLessThanOrEqual(2);
});

test('while the route draws itself in, the floor under it is not redrawn each frame', async ({ page }) => {
  await countDraws(page);
  const id = await seedBigGarage(page);
  await page.goto(`/#/view/${id}`);
  await page.getByTestId('viewer-search').fill('3Z80');
  await page.getByTestId('viewer-search').press('Enter');
  await expect(page.getByTestId('info-card')).toContainText('Space 3Z80');
  await page.getByTestId('directions').click();
  await page.getByTestId('dir-start').first().click();
  await expect(page.getByTestId('dir-summary')).toBeVisible();
  await page.waitForTimeout(100);
  const route = await page.evaluate(() => {
    const st = (window as unknown as { Konva: { stages: { find(s: string): { getLayer(): unknown }[]; getLayers(): unknown[] }[] } }).Konva.stages[0];
    const line = st.find('.route-line')[0];
    return { onTop: !!line && st.getLayers().indexOf(line.getLayer()) === st.getLayers().length - 1 };
  });
  expect(route.onTop).toBe(true);
  await resetDraws(page);
  await page.waitForTimeout(900);
  const d = await page.evaluate(() => (window as unknown as { __draws: { map: boolean }[] }).__draws);
  // The line kept drawing itself in on its own layer, and the floor was drawn at most once more.
  expect(d.filter((x) => !x.map).length).toBeGreaterThan(3);
  expect(d.filter((x) => x.map).length).toBeLessThanOrEqual(1);
});
