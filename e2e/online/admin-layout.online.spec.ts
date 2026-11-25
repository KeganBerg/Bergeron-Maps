import { expect, test } from '@playwright/test';
import { COMPANY, MockSupabase, OTHER_COMPANY, SITE_C, USERS } from './mock-supabase';

/** All accounts is a list and detail page: companies on the left, the chosen one on the right; phones show one at a time. */

test('a wide screen shows the companies list beside the chosen company; search opens the company a hit is in', async ({ page }) => {
  const sb = new MockSupabase(page);
  await sb.install(USERS.admin);
  await page.goto('/#/admin');
  await expect(page.getByTestId(`admin-pick-${COMPANY.name}`)).toHaveAttribute('aria-current', 'page');
  await expect(page.getByTestId(`admin-company-${COMPANY.name}`)).toBeVisible();

  await page.getByTestId(`admin-pick-${OTHER_COMPANY.name}`).click();
  await expect(page).toHaveURL(new RegExp(`#/admin\\?company=${OTHER_COMPANY.id}$`));
  await expect(page.getByTestId(`admin-company-${OTHER_COMPANY.name}`)).toContainText(SITE_C.name);
  await expect(page.getByTestId(`admin-company-${COMPANY.name}`)).toHaveCount(0);

  await page.getByTestId('admin-tool-backups').click();
  await expect(page.getByTestId('backups')).toBeVisible();
  await page.goBack();
  await expect(page.getByTestId(`admin-company-${OTHER_COMPANY.name}`)).toBeVisible();

  await page.getByTestId('admin-search').fill('manager@');
  await page.getByTestId('admin-results').getByRole('button', { name: /manager@example\.com/ }).click();
  await expect(page.getByTestId(`admin-company-${COMPANY.name}`)).toBeVisible();
});

test('a phone shows the list first, then one company with a way back', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const sb = new MockSupabase(page);
  await sb.install(USERS.admin);
  await page.goto('/#/admin');
  await expect(page.getByTestId(`admin-pick-${OTHER_COMPANY.name}`)).toBeVisible();
  await expect(page.getByTestId(`admin-company-${COMPANY.name}`)).toBeHidden();

  await page.getByTestId(`admin-pick-${OTHER_COMPANY.name}`).click();
  await expect(page.getByTestId(`admin-company-${OTHER_COMPANY.name}`)).toBeVisible();
  await expect(page.getByTestId(`admin-pick-${OTHER_COMPANY.name}`)).toBeHidden();
  await page.getByRole('link', { name: 'All companies' }).click();
  await expect(page.getByTestId(`admin-pick-${COMPANY.name}`)).toBeVisible();
  // Nothing on the page is wider than the phone.
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
