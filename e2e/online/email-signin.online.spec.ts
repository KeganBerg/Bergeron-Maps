import { expect, test } from '@playwright/test';
import { MockSupabase, USERS } from './mock-supabase';

/** Sign-in emails: the branded link (token_hash) and the 6-digit code. */

test.describe('sign-in email', () => {
  test('opening the link waits for a press, so an email scanner cannot use it up', async ({ page }) => {
    const sb = new MockSupabase(page);
    await sb.install();
    await page.goto(`/?token_hash=hash-${USERS.siteManager.id}&type=email`);
    await expect(page.getByTestId('signin-finish')).toBeVisible();
    // The token is out of the address and nothing was sent to the server yet.
    expect(page.url()).not.toContain('token_hash');
    expect(sb.log.some((l) => l.includes('/auth/v1/verify'))).toBe(false);
    await page.getByTestId('signin-finish-btn').click();
    await expect(page.getByTestId('signin-finish')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Sign in' })).toHaveCount(0);
    expect(sb.log.some((l) => l.startsWith('POST /auth/v1/verify'))).toBe(true);
  });

  test('the "account is open" link (auto=1) signs in at once, with no press', async ({ page }) => {
    const sb = new MockSupabase(page);
    await sb.install();
    await page.goto(`/?token_hash=hash-${USERS.siteManager.id}&type=magiclink&auto=1`);
    await expect(page.getByRole('heading', { name: 'Sign in' })).toHaveCount(0);
    expect(page.url()).not.toContain('token_hash');
    expect(page.url()).not.toContain('auto=');
    expect(sb.log.some((l) => l.startsWith('POST /auth/v1/verify'))).toBe(true);
  });

  test('a used or expired link says so and offers a new email', async ({ page }) => {
    const sb = new MockSupabase(page);
    await sb.install();
    await page.goto('/?token_hash=hash-nobody&type=email');
    await page.getByTestId('signin-finish-btn').click();
    await expect(page.getByRole('alert')).toContainText('didn’t work');
    await expect(page.getByTestId('signin-finish')).toHaveCount(0);
    await expect(page.getByTestId('signin-email')).toBeVisible();
  });

  test('the code from the email signs in, and a wrong code explains what to do', async ({ page }) => {
    const sb = new MockSupabase(page);
    await sb.install();
    await page.goto('/');
    await page.getByTestId('signin-email').fill('manager@example.com');
    await page.getByTestId('signin-send').click();
    await expect(page.getByTestId('signin-sent')).toContainText('Check spam');
    await page.getByTestId('signin-code').fill('000000');
    await page.getByTestId('signin-code-send').click();
    await expect(page.getByRole('alert')).toContainText('code didn’t work');
    await page.getByTestId('signin-code').fill('123 456');
    await page.getByTestId('signin-code-send').click();
    await expect(page.getByTestId('signin-sent')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Sign in' })).toHaveCount(0);
  });

  test('a failed send gives a plain message', async ({ page }) => {
    const sb = new MockSupabase(page);
    await sb.install();
    await page.route('https://mock.supabase.co/auth/v1/otp**', (r) => r.fulfill({ status: 500, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({ code: 500, error_code: 'unexpected_failure', msg: 'Error sending magic link email' }) }));
    await page.goto('/');
    await page.getByTestId('signin-email').fill('manager@example.com');
    await page.getByTestId('signin-send').click();
    await expect(page.getByRole('alert')).toContainText('couldn’t send the sign-in email');
  });
});
