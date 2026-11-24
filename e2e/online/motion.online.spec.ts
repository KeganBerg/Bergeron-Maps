import { expect, test } from '@playwright/test';
import { MockSupabase, USERS } from './mock-supabase';

/** Admin pages ease cards and rows in and out (src/ui/motion.ts) instead of snapping. */

const giveAccess = async (page: import('@playwright/test').Page) => {
  await page.goto('/#/team');
  await expect(page.getByText('employee@example.com')).toBeVisible();
  await page.getByPlaceholder('name@company.com').fill('new.person@example.com');
  await page.getByRole('button', { name: 'Give access' }).click();
  await expect(page.locator('.people li', { hasText: 'new.person@example.com' })).toHaveCount(1);
};

test('a new person row fades in and the removed one fades out where it was', async ({ page }) => {
  const sb = new MockSupabase(page);
  await sb.install(USERS.owner);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  // Record every animation the page starts, so the check doesn't race the 220ms motion.
  await page.addInitScript(() => {
    const seen: string[] = [];
    (window as unknown as { seen: string[] }).seen = seen;
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (this: Element, k, o) {
      seen.push(`${this.tagName}:${this.textContent?.slice(0, 40)}`);
      return animate.call(this, k, o);
    };
  });
  await giveAccess(page);
  const seen = () => page.evaluate(() => (window as unknown as { seen: string[] }).seen);
  await expect.poll(async () => (await seen()).some((s) => s.startsWith('LI:new.person@example.com'))).toBe(true);

  await page.getByTestId('remove-employee@example.com').click();
  await page.getByRole('button', { name: 'Remove access' }).click();
  // The fading copy is hidden from tests and screen readers, and is gone after the fade.
  await expect(page.getByTestId('remove-employee@example.com')).toHaveCount(0);
  await expect(page.getByRole('listitem').filter({ hasText: 'employee@example.com' })).toHaveCount(0);
  await expect(page.locator('[data-motion-exit]')).toHaveCount(0);
});

test('nothing moves for people who ask their device for less motion', async ({ page }) => {
  const sb = new MockSupabase(page);
  await sb.install(USERS.owner);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    (window as unknown as { count: number }).count = 0;
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (this: Element, k, o) { (window as unknown as { count: number }).count++; return animate.call(this, k, o); };
  });
  await giveAccess(page);
  expect(await page.evaluate(() => (window as unknown as { count: number }).count)).toBe(0);
});
