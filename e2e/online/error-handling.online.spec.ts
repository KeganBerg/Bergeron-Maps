import { expect, test } from '@playwright/test';
import { MockSupabase, MOCK_URL, SITE_A, USERS } from './mock-supabase';

/** Error-handling audit (2026-11-19): what people see when the server can't be reached or breaks. */

test('a site link that can’t be looked up (no connection) says so and retries, instead of “not available to you”', async ({ page }) => {
  const sb = new MockSupabase(page);
  await sb.install(USERS.siteManager);
  let fail = true;
  // Registered after the mock, so it runs first for the site lookup.
  await page.route(`${MOCK_URL}/rest/v1/facilities?*`, (route) => (fail && route.request().url().includes('slug=') ? route.abort('internetdisconnected') : route.fallback()));
  await page.goto(`/#/${SITE_A.slug}`);
  // The database client retries a failed read a few times first.
  await expect(page.getByText('This site link couldn’t be opened. Check your connection and try again.')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('This site link isn’t available to you')).toHaveCount(0);
  fail = false;
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByText('This site link couldn’t be opened.')).toHaveCount(0);
  await expect(page.getByText('This site link isn’t available to you')).toHaveCount(0);
});

test('a server error from the database is reported, and the rest of the page still works', async ({ page }) => {
  const sb = new MockSupabase(page);
  await sb.install(USERS.owner);
  const logs: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') logs.push(m.text()); });
  await page.route(`${MOCK_URL}/rest/v1/rpc/is_platform_admin*`, (route) =>
    route.fulfill({ status: 503, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ message: `down for ${USERS.owner.email}` }) }));
  await page.goto('/');
  await expect.poll(() => logs.find((l) => l.includes('[Bergeron Maps] database')) ?? '', { timeout: 20_000 }).toContain('DatabaseError');
  // The owner's own sites still open: only the admin check failed.
  await expect(page.getByTestId('nav-team')).toBeVisible();
});
