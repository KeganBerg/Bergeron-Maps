import { expect, type Page } from '@playwright/test';

/** A published 3-level quick-lot garage; returns its id. */
export async function seedGarage(page: Page, name = 'Route Garage') {
  await page.goto('/');
  return page.evaluate(async (n) => {
    const { createQuickLot } = await import('/src/model/quickLot.ts');
    const { repository } = await import('/src/storage/indexedDbRepository.ts');
    const doc = createQuickLot(n, { floors: 3, rows: 4, spacesPerRow: 14, accessible: 2 });
    await repository.createMap(doc);
    await repository.publishMap(doc.id);
    const f1 = doc.floors[0];
    return { id: doc.id, entrance: f1.objects.find((o) => o.name === 'Entrance')!.id };
  }, name);
}

type St = { find: (s: string) => { points?: () => number[]; getClientRect: () => { x: number; y: number; width: number; height: number } }[]; container: () => HTMLElement };

/** Number of route lines drawn on the floor on screen. */
export const routeLines = (page: Page) =>
  page.evaluate(() => (window as unknown as { Konva: { stages: St[] } }).Konva.stages[0].find('.route-line').length);

export async function findSpace(page: Page, label: string) {
  await page.getByTestId('viewer-search').fill(label);
  await page.getByTestId('viewer-search').press('Enter');
  await expect(page.getByTestId('info-card')).toContainText(`Space ${label}`);
}
