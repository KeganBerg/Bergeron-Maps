import { expect, test } from '@playwright/test';
import { createQuickLot } from '../../src/model/quickLot';
import { COMPANY, MockSupabase, SITE_A } from './mock-supabase';

/** The public site link (#/view/<site-link>), as a visitor with no account sees it. */

const MAP_ID = 'a0000000-0000-4000-8000-0000000000aa';

function publicLot(sb: MockSupabase) {
  const doc = createQuickLot('Visitor lot', { floors: 1, rows: 2, spacesPerRow: 6, accessible: 0 });
  sb.maps.push({ id: MAP_ID, company_id: COMPANY.id, facility_id: SITE_A.id, name: 'Visitor lot', draft: doc as never, revision: 1, slot: 1 });
  sb.published.set(MAP_ID, { isPublic: true });
  return doc;
}

test('Refresh on a public link fetches the latest published map', async ({ page }) => {
  const sb = new MockSupabase(page);
  publicLot(sb);
  await sb.install();
  await page.goto(`/#/view/${SITE_A.slug}`);
  await expect(page.getByTestId('viewer-facility')).toHaveText('Visitor lot');
  const calls = () => sb.log.filter((l) => l.includes('get_public_site')).length;
  const before = calls();
  sb.maps[0].name = 'Visitor lot (new)';
  await page.getByLabel('Refresh map').click();
  await expect(page.getByTestId('viewer-facility')).toHaveText('Visitor lot (new)');
  expect(calls()).toBe(before + 1);
});

test('a public link that fails to load can be tried again', async ({ page }) => {
  const sb = new MockSupabase(page);
  publicLot(sb);
  let fail = true;
  await sb.install();
  // Added after the stand-in server, so it's asked first.
  await page.route('https://mock.supabase.co/rest/v1/rpc/get_public_site', (route) =>
    fail && route.request().method() !== 'OPTIONS'
      ? route.fulfill({ status: 500, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"message":"down"}' })
      : route.fallback());
  await page.goto(`/#/view/${SITE_A.slug}`);
  await expect(page.getByTestId('public-none')).toContainText('couldn’t be loaded');
  fail = false;
  await page.getByTestId('public-retry').click();
  await expect(page.getByTestId('viewer-facility')).toHaveText('Visitor lot');
});

test('a shared space link and a QR link work on a public site link', async ({ page }) => {
  const sb = new MockSupabase(page);
  const doc = publicLot(sb);
  await sb.install();
  const sp = doc.floors[0].objects.find((o) => o.kind === 'space' && o.label === 'B3')!;
  await page.goto(`/#/view/${SITE_A.slug}?at=${sp.id}`);
  await expect(page.getByTestId('info-card')).toContainText('Space B3');
  const ent = doc.floors[0].objects.find((o) => o.kind === 'asset' && o.name === 'Entrance')!;
  await page.goto(`/#/view/${SITE_A.slug}?from=${ent.id}`);
  await page.reload();
  await expect(page.getByTestId('info-card')).toContainText('You are here');
});
