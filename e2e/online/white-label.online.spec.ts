import { expect, test } from '@playwright/test';
import { createMap } from '../../src/model/factory';
import { COMPANY, MockSupabase, SITE_A, SITE_B, USERS } from './mock-supabase';

/** White-label roles and site workflow, with a stand-in Supabase server. */

test('an employee joins with a code typed with a dash and sees My Locations', async ({ page }) => {
  const sb = new MockSupabase(page);
  await sb.install(USERS.newcomer);
  await page.goto('/');
  await expect(page.getByTestId('no-locations')).toBeVisible();
  await page.getByTestId('join-code').fill('K7M-2QX');
  await expect(page.getByTestId('join-code')).toHaveValue('K7M2QX');
  await page.getByRole('button', { name: 'Join site' }).click();
  await expect(page.getByTestId(`location-${SITE_A.name}`)).toBeVisible();
  await expect(page.getByRole('status')).toContainText('Site added');
});

test('Request Manager Status: the employee asks, the account lead approves in one tap', async ({ browser }) => {
  const employee = await browser.newPage();
  const sb = new MockSupabase(employee);
  await sb.install(USERS.employee);
  await employee.goto('/');
  await employee.getByTestId(`request-manager-${SITE_A.name}`).click();
  await employee.getByTestId('send-request').click();
  await expect(employee.getByTestId(`request-pending-${SITE_A.name}`)).toBeVisible();
  expect(sb.requests).toHaveLength(1);

  // The account lead sees it on Sites & people, with a count on the tab.
  const lead = await browser.newPage();
  const sb2 = new MockSupabase(lead);
  sb2.requests = sb.requests;
  await sb2.install(USERS.owner);
  await lead.goto('/');
  await expect(lead.getByTestId('nav-team')).toContainText('1');
  await lead.getByTestId('nav-team').click();
  await expect(lead.getByTestId('manager-requests')).toContainText(USERS.employee.email);
  await lead.getByTestId(`approve-${USERS.employee.email}`).click();
  await expect(lead.getByRole('status')).toContainText(`${USERS.employee.email} is now the site manager of ${SITE_A.name}`);
  expect(sb2.members.find((m) => m.user_id === USERS.employee.id)).toMatchObject({ role: 'manager', facility_ids: [SITE_A.id] });
  await expect(lead.getByTestId('manager-requests')).toHaveCount(0);
});

test('the account lead moves a site manager to another site', async ({ page }) => {
  const sb = new MockSupabase(page);
  await sb.install(USERS.owner);
  await page.goto('/#/team');
  await page.getByTestId(`move-${USERS.siteManager.email}`).click();
  await page.getByTestId('move-to').selectOption(SITE_B.id);
  await page.getByTestId('move-confirm').click();
  await expect(page.getByRole('status')).toContainText(`moved from ${SITE_A.name} to ${SITE_B.name}`);
  expect(sb.members.find((m) => m.user_id === USERS.siteManager.id)?.facility_ids).toEqual([SITE_B.id]);
});

test('a public map opens from the site link with no sign-in; private maps do not', async ({ page }) => {
  const sb = new MockSupabase(page);
  const pub = createMap('Visitor map');
  const priv = createMap('Staff map');
  sb.maps.push(
    { id: 'a0000000-0000-4000-8000-000000000001', company_id: COMPANY.id, facility_id: SITE_A.id, name: 'Visitor map', draft: pub as never, revision: 1, slot: 1 },
    { id: 'a0000000-0000-4000-8000-000000000002', company_id: COMPANY.id, facility_id: SITE_A.id, name: 'Staff map', draft: priv as never, revision: 1, slot: 2 },
  );
  sb.published.set('a0000000-0000-4000-8000-000000000001', { isPublic: true });
  sb.published.set('a0000000-0000-4000-8000-000000000002', { isPublic: false });
  await sb.install();
  await page.goto(`/#/view/${SITE_A.slug}`);
  await expect(page.getByTestId('viewer-facility')).toHaveText('Visitor map');
  await expect(page.getByRole('button', { name: 'All maps' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Sign in' })).toHaveCount(0);
  await page.goto(`/#/view/${SITE_B.slug}`);
  await expect(page.getByTestId('public-none')).toBeVisible();
});

test('a manager makes a published map public and gets its link', async ({ page }) => {
  const sb = new MockSupabase(page);
  sb.maps.push({ id: 'a0000000-0000-4000-8000-000000000003', company_id: COMPANY.id, facility_id: SITE_A.id, name: 'Garage', draft: createMap('Garage') as never, revision: 1, slot: 1 });
  sb.published.set('a0000000-0000-4000-8000-000000000003', { isPublic: false });
  await sb.install(USERS.siteManager);
  await page.goto('/');
  await page.getByTestId('public-Garage').click();
  await page.getByTestId('make-public').click();
  await expect(page.getByTestId('public-link')).toHaveValue(new RegExp(`#/view/${SITE_A.slug}$`));
  expect(sb.published.get('a0000000-0000-4000-8000-000000000003')?.isPublic).toBe(true);
});

test('an admin sets up a company from a contract and deletes one by typing its name', async ({ page }) => {
  const sb = new MockSupabase(page);
  await sb.install(USERS.admin);
  await page.goto('/#/admin');
  await page.getByTestId('setup-name').fill('New Company');
  await page.getByTestId('setup-lead').fill('Lead@Company.example');
  await page.getByTestId('setup-limit').fill('3');
  await page.getByTestId('setup-site').fill('Site Name 2');
  await page.getByRole('button', { name: 'Create company' }).click();
  await expect(page.getByRole('status')).toContainText('lead@company.example is its account lead');
  await expect(page.getByTestId('admin-company-New Company')).toContainText('1 of 3 contracted sites');

  await page.getByTestId('delete-company-New Company').click();
  const confirm = page.getByTestId('delete-company-confirm');
  await expect(confirm).toBeDisabled();
  await page.getByTestId('delete-company-name').fill('new company');
  await expect(confirm).toBeDisabled();
  await page.getByTestId('delete-company-name').fill('New Company');
  await confirm.click();
  await expect(page.getByTestId('admin-company-New Company')).toHaveCount(0);
  expect(sb.companies.some((c) => c.name === 'New Company')).toBe(false);
});

test('a site that still has maps cannot be deleted; the admin is told how to clear it', async ({ page }) => {
  const sb = new MockSupabase(page);
  sb.maps.push({ id: 'a0000000-0000-4000-8000-000000000004', company_id: COMPANY.id, facility_id: SITE_A.id, name: 'Garage', draft: createMap('Garage') as never, revision: 1, slot: 1 });
  await sb.install(USERS.admin);
  await page.goto('/#/admin');
  await page.getByTestId(`delete-site-${SITE_A.name}`).click();
  await expect(page.getByRole('dialog')).toContainText('can’t be deleted while it holds maps');
  await page.getByRole('button', { name: 'Close' }).click();
  await page.getByTestId(`delete-site-${SITE_B.name}`).click();
  await page.getByRole('button', { name: 'Delete site' }).click();
  await expect(page.getByTestId(`admin-site-${SITE_B.name}`)).toHaveCount(0);
});

test('an admin removes a person; they are signed out', async ({ page }) => {
  const sb = new MockSupabase(page);
  await sb.install(USERS.admin);
  await page.goto('/#/admin');
  await page.getByTestId(`remove-${COMPANY.name}-${USERS.employee.email}`).click();
  await page.getByRole('button', { name: 'Remove access' }).click();
  await expect(page.getByRole('status')).toContainText(`${USERS.employee.email} removed`);
  expect(sb.signedOut).toEqual([USERS.employee.id]);
});
