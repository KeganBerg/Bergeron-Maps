import { expect, test } from '@playwright/test';
import { createMap } from '../../src/model/factory';
import { COMPANY, MockSupabase, SITE_A, SITE_B, USERS } from './mock-supabase';

/** Sign-in and access in the online app, with a stand-in Supabase server. */

test.describe('signing in', () => {
  test('a site link asks a signed-out visitor to sign in, and remembers where to return', async ({ page }) => {
    const sb = new MockSupabase(page);
    await sb.install();
    await page.goto('/#/site-name');
    await expect(page.getByRole('heading', { name: 'Sign in to open your site' })).toBeVisible();
    await expect(page.getByTestId('try-local')).toHaveCount(0);
    await page.getByTestId('signin-email').fill('Manager@Example.com ');
    await page.getByTestId('signin-send').click();
    await expect(page.getByTestId('signin-sent')).toContainText('manager@example.com');
    expect(await page.evaluate(() => localStorage.getItem('bm.returnTo'))).toBe('/site-name');
  });

  test('an expired session that can no longer be refreshed shows sign-in, not an endless Loading', async ({ page }) => {
    const sb = new MockSupabase(page);
    sb.refresh = 'revoked';
    await sb.install(USERS.siteManager, { expiresInSec: -60 });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible({ timeout: 10_000 });
  });

  test('an expired session that can be refreshed signs straight back in', async ({ page }) => {
    const sb = new MockSupabase(page);
    await sb.install(USERS.siteManager, { expiresInSec: -60 });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Your site' }).or(page.getByRole('heading', { name: /sites$/ }))).toBeVisible({ timeout: 10_000 });
    expect(sb.log.some((l) => l.includes('grant_type=refresh_token'))).toBe(true);
  });

  test('being signed out while editing keeps the unsaved change and offers it back after signing in again', async ({ page }) => {
    const sb = new MockSupabase(page);
    const doc = createMap('Level 1 lot');
    sb.maps.push({ id: doc.id, company_id: COMPANY.id, facility_id: SITE_A.id, name: doc.name, draft: doc as unknown as Record<string, unknown>, revision: 1, slot: 1 });
    await sb.install(USERS.owner);
    await page.goto(`/#/edit/${doc.id}`);
    await expect(page.getByTestId('save-status')).toBeVisible();
    // The session is revoked (signed out on another device, or the refresh token ran out) right after an edit.
    sb.refresh = 'revoked';
    sb.expireTokens = true;
    await page.evaluate(async () => {
      const { useEditor } = await import('/src/editor/store.ts');
      useEditor.getState().renameMap('Level 1 lot (edited)');
      // The access token runs out, and refreshing it is refused.
      const k = 'sb-mock-auth-token';
      localStorage.setItem(k, JSON.stringify({ ...JSON.parse(localStorage.getItem(k)!), expires_at: Math.floor(Date.now() / 1000) - 10 }));
      const { supabase } = await import('/src/cloud/client.ts');
      await supabase!.auth.refreshSession();
    });
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible({ timeout: 10_000 });
    const backup = await page.evaluate((id) => localStorage.getItem(`bm.unsaved.${id}`), doc.id);
    expect(JSON.parse(backup!).doc.name).toBe('Level 1 lot (edited)');
    // Signing in again returns to this map, which then offers the backup.
    await page.getByTestId('signin-email').fill(USERS.owner.email);
    await page.getByTestId('signin-send').click();
    expect(await page.evaluate(() => localStorage.getItem('bm.returnTo'))).toBe(`/edit/${doc.id}`);
  });

  for (const [label, url] of [
    ['an expired or already used sign-in link (query)', '/?error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired'],
    ['an expired or already used sign-in link (hash)', '/#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired'],
    ['a sign-in link opened in a different browser', '/?code=0b7c6a1e-2f4d-4c8b-9d3e-5a6f7b8c9d0e'],
  ] as const) {
    test(`${label} explains what happened and how to get a new one`, async ({ page }) => {
      const sb = new MockSupabase(page);
      await sb.install();
      await page.goto(url);
      await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
      await expect(page.getByRole('alert')).toContainText('sign-in link didn’t work');
      // The error is cleared from the address, so it isn't mistaken for a site link and isn't shown again on refresh.
      expect(new URL(page.url()).search).toBe('');
      expect(new URL(page.url()).hash).toBe('');
      await page.getByTestId('signin-email').fill('a@example.com');
      await page.getByTestId('signin-send').click();
      expect(await page.evaluate(() => localStorage.getItem('bm.returnTo'))).toBe('/');
    });
  }
});

test.describe('opening another role’s page by its link', () => {
  test('an employee sees only their maps, whatever link they open', async ({ page }) => {
    const sb = new MockSupabase(page);
    await sb.install(USERS.employee);
    for (const hash of ['/', '/team', '/admin', '/edit/00000000-0000-4000-8000-000000000000']) {
      await page.goto(`/#${hash}`);
      await expect(page.getByRole('heading', { name: 'Your maps' })).toBeVisible();
      await expect(page.getByTestId('nav-team')).toHaveCount(0);
      await expect(page.getByTestId('nav-admin')).toHaveCount(0);
      await expect(page.getByText('All accounts')).toHaveCount(0);
    }
  });

  test('an employee opening another site’s link is told it isn’t theirs', async ({ page }) => {
    const sb = new MockSupabase(page);
    await sb.install(USERS.employee);
    await page.goto(`/#/${SITE_B.slug}`);
    await expect(page.getByRole('heading', { name: 'This site link isn’t available to you' })).toBeVisible();
  });

  test('a site manager can open their own site, but not another site in the same company or another company', async ({ page }) => {
    const sb = new MockSupabase(page);
    await sb.install(USERS.siteManager);
    await page.goto(`/#/${SITE_A.slug}`);
    await expect(page.getByRole('heading', { name: 'Your site' })).toBeVisible();
    for (const hash of [`/${SITE_B.slug}`, `/site/${SITE_B.id}`, '/other-site', '/site/not-a-uuid']) {
      await page.goto(`/#${hash}`);
      await expect(page.getByRole('heading', { name: 'This site link isn’t available to you' })).toBeVisible();
    }
  });

  test('a site manager sees only their own site’s code and no All accounts page', async ({ page }) => {
    const sb = new MockSupabase(page);
    await sb.install(USERS.siteManager);
    await page.goto('/#/admin');
    await expect(page.getByTestId('nav-admin')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'All accounts' })).toHaveCount(0);
    await page.goto('/#/team');
    await expect(page.getByText(SITE_A.code)).toBeVisible();
    await expect(page.getByText(SITE_B.code)).toHaveCount(0);
    await expect(page.getByText(SITE_B.name)).toHaveCount(0);
  });

  test('an owner sees every site in the company, but not All accounts', async ({ page }) => {
    const sb = new MockSupabase(page);
    await sb.install(USERS.owner);
    await page.goto('/#/team');
    await expect(page.getByText(SITE_A.code)).toBeVisible();
    await expect(page.getByText(SITE_B.code)).toBeVisible();
    await expect(page.getByTestId('nav-admin')).toHaveCount(0);
  });

  test('an admin sees All accounts with every company', async ({ page }) => {
    const sb = new MockSupabase(page);
    await sb.install(USERS.admin);
    await page.goto('/#/admin');
    await expect(page.getByText('Other Company').first()).toBeVisible();
    await expect(page.getByText(USERS.employee.email).first()).toBeVisible();
    await page.getByTestId('nav-team').click();
    await expect(page.getByText(SITE_A.code)).toBeVisible();
  });
});

test.describe('site join codes', () => {
  test('a wrong code is refused plainly, and the right code opens that site’s maps', async ({ page }) => {
    const sb = new MockSupabase(page);
    await sb.install(USERS.newcomer);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'You don’t have access to a site yet' })).toBeVisible();
    await page.getByTestId('join-code').fill('zzzzzz');
    await expect(page.getByTestId('join-code')).toHaveValue('ZZZZZZ');
    await page.getByRole('button', { name: 'Join site' }).click();
    await expect(page.getByRole('alert')).toContainText('didn’t match a site');
    await page.getByTestId('join-code').fill(SITE_A.code.toLowerCase());
    await page.getByRole('button', { name: 'Join site' }).click();
    await expect(page.getByRole('heading', { name: 'Your maps' })).toBeVisible();
    expect(sb.members.find((m) => m.user_id === USERS.newcomer.id)).toMatchObject({ role: 'employee', facility_ids: [SITE_A.id] });
  });

  test('after too many wrong codes the pause is explained', async ({ page }) => {
    const sb = new MockSupabase(page);
    sb.wrongCodes = 10;
    await sb.install(USERS.newcomer);
    await page.goto('/');
    await page.getByTestId('join-code').fill(SITE_A.code);
    await page.getByRole('button', { name: 'Join site' }).click();
    await expect(page.getByRole('alert')).toContainText('Too many wrong codes');
  });

  test('a code typed with a space still works', async ({ page }) => {
    const sb = new MockSupabase(page);
    await sb.install(USERS.newcomer);
    await page.goto('/');
    await page.getByTestId('join-code').fill('K7M 2QX');
    await page.getByRole('button', { name: 'Join site' }).click();
    await expect(page.getByRole('heading', { name: 'Your maps' })).toBeVisible();
  });
});
