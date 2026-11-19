import { open, startOrca, mark, key, keys, finish, sleep } from './lib.mjs';
const page = await open();
let fail = false;
await page.route('https://mock.supabase.co/**', (r) => {
  const u = r.request().url();
  if (u.includes('/auth/v1/otp')) return fail ? r.fulfill({ status: 429, contentType: 'application/json', body: JSON.stringify({ code: 429, error_code: 'over_email_send_rate_limit', msg: 'email rate limit exceeded' }) }) : r.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
});
await page.goto('about:blank');
await startOrca('signin');
try {
mark('load sign-in'); await page.goto('http://localhost:5175/'); await sleep(4000);
const field = page.getByTestId('signin-email');
mark('type "bob" (CDP) and press Enter'); await field.focus(); await sleep(800); await page.keyboard.type('bob'); await page.keyboard.press('Enter'); await sleep(2500);
mark('Tab, shift+Tab back to field (Orca keys)'); await key('Tab'); await key('shift+Tab', 1500);
mark('fix email, Enter'); await field.fill('bob@example.com'); await page.keyboard.press('Enter'); await sleep(3000);
mark('Tab'); await key('Tab');
mark('Use a different email (Enter)'); await key('Return', 2500);
mark('rate limited send'); fail = true; await field.fill('bob@example.com'); await page.keyboard.press('Enter'); await sleep(3000);
} catch (e) { mark('ERROR ' + e.message.split('\n')[0]); }
await finish('out/signin.txt');
