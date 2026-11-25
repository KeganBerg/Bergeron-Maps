import { expect, test } from '@playwright/test';
import { createMap } from '../../src/model/factory';
import { COMPANY, MockSupabase, SITE_A, USERS } from './mock-supabase';

/** Second sign-in and access audit (2026-11-16): signing out, and access taken away while the app is open. */

test('signing out ends only this device’s sign-in and forgets this device’s company and return page', async ({ page }) => {
  const sb = new MockSupabase(page);
  await sb.install(USERS.owner);
  await page.goto('/');
  await expect(page.getByTestId('nav-team')).toBeVisible();
  await page.evaluate(() => { localStorage.setItem('bm.company', 'c-x'); localStorage.setItem('bm.returnTo', '/team'); });
  await page.getByTestId('account-menu').click();
  // The training hub opens in a new tab, so the map stays open here.
  const university = page.getByTestId('menu-university');
  await expect(university).toHaveAttribute('href', '/university/');
  await expect(university).toHaveAttribute('target', '_blank');
  await page.getByTestId('sign-out').click();
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  const logout = sb.log.find((l) => l.includes('/auth/v1/logout'));
  expect(logout).toContain('scope=local');
  await expect.poll(() => page.evaluate(() => [localStorage.getItem('bm.company'), localStorage.getItem('bm.returnTo')]).catch(() => 'reloading')).toEqual([null, null]);
});

test('a manager whose access is removed while the maps page is open is moved off it', async ({ page }) => {
  const sb = new MockSupabase(page);
  await sb.install(USERS.siteManager);
  await page.goto('/');
  await expect(page.getByTestId('nav-team')).toBeVisible();
  sb.members = sb.members.filter((m) => m.user_id !== USERS.siteManager.id);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByTestId('no-locations')).toBeVisible();
  await expect(page.getByTestId('nav-team')).toHaveCount(0);
});

test('a manager demoted to employee while editing leaves the editor and keeps the unsaved change', async ({ page }) => {
  const sb = new MockSupabase(page);
  const doc = createMap('Level 1 lot');
  sb.maps.push({ id: doc.id, company_id: COMPANY.id, facility_id: SITE_A.id, name: doc.name, draft: doc as unknown as Record<string, unknown>, revision: 1, slot: 1 });
  await sb.install(USERS.siteManager);
  await page.goto(`/#/edit/${doc.id}`);
  await expect(page.getByTestId('save-status')).toBeVisible();
  sb.members.find((m) => m.user_id === USERS.siteManager.id)!.role = 'employee';
  await page.evaluate(async () => {
    const { useEditor } = await import('/src/editor/store.ts');
    useEditor.getState().renameMap('Level 1 lot (edited)');
    window.dispatchEvent(new Event('focus'));
  });
  await expect(page.getByTestId('save-status')).toHaveCount(0);
  const backup = await page.evaluate((id) => localStorage.getItem(`bm.unsaved.${id}`), doc.id);
  expect(JSON.parse(backup!).doc.name).toBe('Level 1 lot (edited)');
});
