import { expect, test } from '@playwright/test';
import { MockSupabase } from './mock-supabase';

/** Sign-in with a screen reader (found with Orca, 2026-11-19). */
test('a wrong email is tied to the field, and a sent link is read out instead of silence', async ({ page }) => {
  const sb = new MockSupabase(page);
  await sb.install();
  await page.goto('/');
  const field = page.getByTestId('signin-email');
  await field.fill('bob');
  await page.getByTestId('signin-send').click();
  // The app's own message (not the browser's bubble), linked to the field.
  await expect(page.getByRole('alert')).toHaveText('Enter your work email address.');
  await expect(field).toHaveAttribute('aria-invalid', 'true');
  await expect(field).toHaveAccessibleDescription('Enter your work email address.');
  await field.fill('bob@example.com');
  await page.getByTestId('signin-send').click();
  // The button that was pressed is gone: focus goes to the message that replaced it.
  const sent = page.getByRole('region', { name: 'Check your email' });
  await expect(sent).toBeFocused();
  await expect(sent).toHaveAccessibleDescription(/We sent a sign-in link and code to bob@example.com/);
  await page.getByRole('button', { name: 'Use a different email' }).click();
  await expect(field).toBeFocused();
});
