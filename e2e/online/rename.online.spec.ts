import { expect, test } from '@playwright/test';
import { COMPANY, MockSupabase, SITE_A, SITE_B, USERS } from './mock-supabase';

/** Renaming a company and its sites: from All accounts (admins) and from Sites and people (the account lead). */

test('an admin renames a company and a site from All accounts', async ({ page }) => {
  const sb = new MockSupabase(page);
  await sb.install(USERS.admin);
  await page.goto('/#/admin');
  await page.getByTestId(`rename-company-${COMPANY.name}`).click();
  await page.getByTestId('rename-company-input').fill('  Harbor   Parking ');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('status')).toContainText(`${COMPANY.name} is now called Harbor Parking.`);
  await expect(page.getByTestId('admin-company-Harbor Parking')).toBeVisible();
  expect(sb.companies.find((c) => c.id === COMPANY.id)?.name).toBe('Harbor Parking');

  await page.getByTestId(`rename-site-${SITE_A.name}`).click();
  // Two sites in one company can't share a name.
  await page.getByTestId('rename-site-input').fill(SITE_B.name.toUpperCase());
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByTestId('rename-site-form').getByRole('alert')).toContainText('Another site is already called');
  await page.getByTestId('rename-site-input').fill('North Garage');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByTestId('admin-site-North Garage')).toBeVisible();
  const site = sb.sites.find((x) => x.id === SITE_A.id)!;
  expect(site).toMatchObject({ name: 'North Garage', slug: SITE_A.slug });
});

// Renaming sites on Sites and people comes with the self-serve setup (PR #126) and is tested there.
test('the account lead renames the company; the header and account menu follow', async ({ page }) => {
  const sb = new MockSupabase(page);
  await sb.install(USERS.owner);
  await page.goto('/#/team');
  await page.getByTestId('rename-company').click();
  await page.getByTestId('rename-company-input').fill('Harbor Parking');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('status')).toContainText('The company is now called Harbor Parking.');
  await expect(page.locator('.page-sub')).toHaveText('Harbor Parking');
  await expect(page.locator('.account-name')).toHaveText('Harbor Parking');
});

test('a site manager cannot rename the company', async ({ page }) => {
  const sb = new MockSupabase(page);
  await sb.install(USERS.siteManager);
  await page.goto('/#/team');
  await expect(page.getByTestId(`team-site-${SITE_A.name}`)).toBeVisible();
  await expect(page.getByTestId('rename-company')).toHaveCount(0);
});
