import { expect, test, type Page } from '@playwright/test';
import { createQuickLot } from '../../src/model/quickLot';
import { COMPANY, MockSupabase, SITE_A, USERS } from './mock-supabase';

/**
 * Map lists and saves move only what they need: the database counts floors
 * and spaces for the lists, and a save doesn't download the map it just sent.
 * Databases from before the counting columns still work.
 */

const ID = 'a0000000-0000-4000-8000-0000000000aa';

function withGarage(page: Page) {
  const sb = new MockSupabase(page);
  // 2 floors x 3 rows x 4 spaces, so 24 spaces.
  const doc = createQuickLot('Garage', { floors: 2, rows: 3, spacesPerRow: 4, accessible: 0 });
  sb.maps.push({ id: ID, company_id: COMPANY.id, facility_id: SITE_A.id, name: 'Garage', draft: { ...doc, id: ID } as never, revision: 1, slot: 1 });
  return sb;
}

const lists = (sb: MockSupabase, table: string) => sb.log.filter((l) => l.startsWith(`GET /rest/v1/${table}?`) && !/[?&]id=eq\./.test(l));

test('the maps page shows floor and space counts without downloading the maps', async ({ page }) => {
  const sb = withGarage(page);
  await sb.install(USERS.owner);
  await page.goto('/');
  await expect(page.getByText('2 floors · 24 spaces')).toBeVisible();
  const reqs = lists(sb, 'maps');
  expect(reqs.length).toBeGreaterThan(0);
  for (const r of reqs) {
    expect(decodeURIComponent(r)).toContain('floor_count');
    expect(decodeURIComponent(r)).not.toMatch(/[,=]draft(,|&|$)/);
  }
});

test('on a database without the counting columns, the maps page still shows the counts', async ({ page }) => {
  const sb = withGarage(page);
  sb.countsMissing = true;
  await sb.install(USERS.owner);
  await page.goto('/');
  await expect(page.getByText('2 floors · 24 spaces')).toBeVisible();
  // Once it knows the database lacks them, it stops asking for the counts.
  const reqs = lists(sb, 'maps');
  const firstFull = reqs.findIndex((r) => r.includes('draft'));
  expect(firstFull).toBeGreaterThan(0);
  expect(reqs.slice(firstFull).some((r) => r.includes('floor_count'))).toBe(false);
});

test('saving a change uploads the map but does not download it again', async ({ page }) => {
  const sb = withGarage(page);
  await sb.install(USERS.owner);
  await page.goto(`/#/edit/${ID}`);
  await expect(page.getByTestId('save-status')).toBeVisible();
  await page.evaluate(async () => (await import('/src/editor/store.ts')).useEditor.getState().renameMap('Garage North'));
  await expect.poll(() => sb.maps[0].name).toBe('Garage North');
  const save = sb.log.find((l) => l.startsWith('PATCH /rest/v1/maps?') && l.includes('revision=eq.1'))!;
  expect(decodeURIComponent(save)).not.toContain('draft');
  await expect(page.getByTestId('save-status')).toHaveText(/Saved/);
  expect(await page.evaluate(async () => (await import('/src/editor/store.ts')).useEditor.getState().revision)).toBe(2);
});

for (const missing of [false, true]) {
  test(`My locations counts levels without downloading the maps${missing ? ' (older database)' : ''}`, async ({ page }) => {
    const sb = withGarage(page);
    sb.countsMissing = missing;
    sb.published.set(ID, { isPublic: false });
    await sb.install(USERS.employee);
    await page.goto('/');
    await expect(page.getByText('2 levels')).toBeVisible();
    if (!missing) for (const r of lists(sb, 'published_maps')) expect(decodeURIComponent(r)).not.toContain('doc');
  });
}
