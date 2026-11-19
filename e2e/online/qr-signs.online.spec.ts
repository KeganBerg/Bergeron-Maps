import { expect, test } from '@playwright/test';
import { createQuickLot } from '../../src/model/quickLot';
import { COMPANY, MockSupabase, SITE_A, USERS } from './mock-supabase';

/** "You are here" signs online: the code holds the site's public link to this map, so visitors can scan it. */

const ID = 'a0000000-0000-4000-8000-0000000000aa';
const OTHER = 'a0000000-0000-4000-8000-0000000000bb';

// Made once, so the manager's browser and the visitor's phone see the same objects.
const doc = { ...createQuickLot('Garage', { floors: 2, rows: 2, spacesPerRow: 6, accessible: 0 }), id: ID };
const other = { ...createQuickLot('Surface lot', { floors: 1, rows: 2, spacesPerRow: 6, accessible: 0 }), id: OTHER };

function twoMaps(sb: MockSupabase, isPublic: boolean) {
  sb.maps.push({ id: ID, company_id: COMPANY.id, facility_id: SITE_A.id, name: 'Garage', draft: doc as never, revision: 1, slot: 1 });
  sb.maps.push({ id: OTHER, company_id: COMPANY.id, facility_id: SITE_A.id, name: 'Surface lot', draft: other as never, revision: 1, slot: 2 });
  sb.published.set(ID, { isPublic });
  sb.published.set(OTHER, { isPublic });
  return doc;
}

async function signFor(page: import('@playwright/test').Page, objectId: string) {
  await page.goto(`/#/edit/${ID}`);
  await expect(page.getByTestId('save-status')).toBeVisible();
  await page.evaluate(async (id) => {
    const { useEditor } = await import('/src/editor/store.ts');
    useEditor.getState().select([id]);
  }, objectId);
  await page.getByTestId('qr-sign').click();
  await expect(page.getByTestId('sign-link')).toHaveValue(/\?from=/);
  return page.getByTestId('sign-link').inputValue();
}

test('a public map’s sign opens for a visitor, on the right one of two maps', async ({ page, browser }) => {
  const sb = new MockSupabase(page);
  twoMaps(sb, true);
  await sb.install(USERS.owner);
  const ent = doc.floors[0].objects.find((o) => o.kind === 'asset' && o.name === 'Entrance')!;
  const url = await signFor(page, ent.id);
  expect(url).toMatch(new RegExp(`#/view/${SITE_A.slug}/${ID}\\?from=${ent.id}$`));
  await expect(page.getByTestId('sign-warning')).toHaveCount(0);
  // A visitor's phone: no account, no session.
  const ctx = await browser.newContext();
  const phone = await ctx.newPage();
  const visitor = new MockSupabase(phone);
  twoMaps(visitor, true);
  await visitor.install();
  await phone.goto(url);
  await expect(phone.getByTestId('viewer-facility')).toHaveText('Garage');
  await expect(phone.getByTestId('info-card')).toContainText('You are here');
  await ctx.close();
});

test('a private map’s sign warns that only signed-in people can open it', async ({ page }) => {
  const sb = new MockSupabase(page);
  twoMaps(sb, false);
  await sb.install(USERS.owner);
  const ent = doc.floors[0].objects.find((o) => o.kind === 'asset' && o.name === 'Entrance')!;
  const url = await signFor(page, ent.id);
  expect(url).toMatch(new RegExp(`#/view/${ID}\\?from=${ent.id}$`));
  await expect(page.getByTestId('sign-warning')).toContainText('make the map public');
});
