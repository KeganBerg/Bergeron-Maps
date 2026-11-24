import { expect, test } from '@playwright/test';
import { createMap } from '../../src/model/factory';
import { COMPANY, MockSupabase, SITE_A, SITE_B, USERS } from './mock-supabase';

/** Fourth access audit (2026-11-19): accounts, roles and sharing, with a stand-in Supabase server. */

test('an admin who also joined a company as an employee still manages it as an owner', async ({ page }) => {
  const sb = new MockSupabase(page);
  sb.members.push({ user_id: USERS.admin.id, email: USERS.admin.email, company_id: COMPANY.id, role: 'employee', facility_ids: [SITE_B.id] });
  await sb.install(USERS.admin);
  await page.goto('/#/team');
  await expect(page.getByTestId('nav-team')).toBeVisible();
  await expect(page.getByText('employee@example.com')).toBeVisible();
  await expect(page.getByTestId(`team-site-${SITE_B.name}`)).toBeVisible();
});

test('an admin typing a site code is told they already have every site', async ({ page }) => {
  const sb = new MockSupabase(page);
  await sb.install(USERS.admin);
  await page.goto('/#/locations');
  await page.getByTestId('join-code').fill(SITE_A.code);
  await page.getByRole('button', { name: 'Join site' }).click();
  await expect(page.getByRole('alert')).toContainText('already have every site');
});

test('giving an employee a second site adds it instead of replacing their first', async ({ page }) => {
  const sb = new MockSupabase(page);
  await sb.install(USERS.owner);
  await page.goto('/#/team');
  await page.getByPlaceholder('name@company.com').fill(USERS.employee.email);
  await page.getByRole('combobox').first().selectOption({ label: 'Employee (view only)' });
  await page.getByRole('combobox').nth(1).selectOption({ label: SITE_B.name });
  await page.getByRole('button', { name: 'Give access' }).click();
  await expect(page.getByRole('status')).toContainText(`access is now Employee, ${SITE_A.name}, ${SITE_B.name}`);
  expect(sb.members.find((m) => m.email === USERS.employee.email)?.facility_ids).toEqual([SITE_A.id, SITE_B.id]);
});

test('making an employee a site manager elsewhere says what it replaces before changing anything', async ({ page }) => {
  const sb = new MockSupabase(page);
  await sb.install(USERS.owner);
  await page.goto('/#/team');
  await page.getByPlaceholder('name@company.com').fill(USERS.employee.email);
  await page.getByRole('combobox').nth(1).selectOption({ label: SITE_B.name });
  await page.getByRole('button', { name: 'Give access' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText(`They’re Employee, ${SITE_A.name} now`);
  await expect(dialog).toContainText(`Site manager, ${SITE_B.name}`);
  expect(sb.log.some((l) => l.startsWith('add_member'))).toBe(false);
  await dialog.getByRole('button', { name: 'Change access' }).click();
  await expect(page.getByRole('status')).toContainText(`access is now Site manager, ${SITE_B.name}`);
  expect(sb.members.find((m) => m.email === USERS.employee.email)).toMatchObject({ role: 'manager', facility_ids: [SITE_B.id] });
});

test('giving someone the access they already have changes nothing', async ({ page }) => {
  const sb = new MockSupabase(page);
  await sb.install(USERS.owner);
  await page.goto('/#/team');
  await page.getByPlaceholder('name@company.com').fill(USERS.siteManager.email);
  await page.getByRole('button', { name: 'Give access' }).click();
  await expect(page.getByRole('status')).toContainText('already has that access');
  expect(sb.log.some((l) => l.startsWith('add_member'))).toBe(false);
});

test('a site manager sees Remove only where it works, and removing a shared employee keeps their other site', async ({ page }) => {
  const sb = new MockSupabase(page);
  sb.members.find((m) => m.email === USERS.employee.email)!.facility_ids = [SITE_A.id, SITE_B.id];
  await sb.install(USERS.siteManager);
  await page.goto('/#/team');
  await expect(page.getByText(USERS.siteManager.email)).toBeVisible();
  // Not on themselves.
  await expect(page.getByTestId(`remove-${USERS.siteManager.email}`)).toHaveCount(0);
  const remove = page.getByTestId(`remove-${USERS.employee.email}`);
  await expect(remove).toHaveText('Remove from my sites');
  await remove.click();
  await expect(page.getByRole('dialog')).toContainText(`They lose access to ${SITE_A.name} right away. They keep their other sites.`);
  await page.getByRole('button', { name: 'Remove access' }).click();
  await expect(page.getByTestId(`remove-${USERS.employee.email}`)).toHaveCount(0);
  expect(sb.members.find((m) => m.email === USERS.employee.email)?.facility_ids).toEqual([SITE_B.id]);
  expect(sb.signedOut).toEqual([]);
});

test('Copy public link shows only for a site with a public live map', async ({ page }) => {
  const sb = new MockSupabase(page);
  const doc = createMap('Garage');
  sb.maps.push({ id: 'a0000000-0000-4000-8000-000000000001', company_id: COMPANY.id, facility_id: SITE_B.id, name: 'Garage', draft: doc as unknown as Record<string, unknown>, revision: 1, slot: 1 });
  sb.published.set('a0000000-0000-4000-8000-000000000001', { isPublic: true });
  await sb.install(USERS.owner);
  await page.goto('/#/team');
  await expect(page.getByTestId(`public-link-${SITE_B.name}`)).toBeVisible();
  await expect(page.getByTestId(`public-link-${SITE_A.name}`)).toHaveCount(0);
});

test('a site link can’t be renamed to a page of the app', async ({ page }) => {
  const sb = new MockSupabase(page);
  await sb.install(USERS.owner);
  await page.goto('/#/team');
  await page.getByTestId(`team-site-${SITE_A.name}`).getByRole('button', { name: 'Edit link' }).click();
  await page.getByTestId('slug-input').fill('Locations');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('alert')).toContainText('“locations” is used by the app itself');
});
