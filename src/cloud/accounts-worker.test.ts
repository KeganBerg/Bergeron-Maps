import { describe, expect, it, vi } from 'vitest';
// @ts-expect-error plain JS module run by the Cloudflare Worker
import { accountChange, applyAccountChange, signInLink } from '../../worker/accounts.js';
// @ts-expect-error plain JS module run by the Cloudflare Worker
import { graceDaysLeft, reminderFor, sendGraceReminders } from '../../worker/grace.js';
// @ts-expect-error plain JS module run by the Cloudflare Worker
import { stripeWebhook, hmacHex } from '../../worker/stripe.js';

type Call = [string, RequestInit];
const env = {
  STRIPE_SECRET_KEY: 'rk_test_abc',
  STRIPE_WEBHOOK_SECRET: 'whsec_test',
  RESEND_API_KEY: 're_test',
  SUPABASE_URL: 'https://db.example',
  SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_abc',
};

/** A fake Stripe, Supabase and Resend that answers by URL, and records every call. */
function fakeServices(answers: Record<string, unknown>, status = 200) {
  return vi.fn(async (url: string) => {
    const hit = Object.keys(answers).find((k) => url.includes(k));
    return new Response(JSON.stringify(hit ? answers[hit] : {}), { status: url.includes('/rpc/') ? status : 200 });
  });
}
const calls = (send: ReturnType<typeof vi.fn>) => send.mock.calls as unknown as Call[];
const emails = (send: ReturnType<typeof vi.fn>) =>
  calls(send).filter(([u]) => u.includes('resend')).map(([, i]) => JSON.parse(String(i.body)));

const order = {
  type: 'checkout.session.completed',
  livemode: false,
  data: { object: {
    id: 'cs_1', payment_status: 'paid', customer: 'cus_1', subscription: 'sub_1', amount_total: 250000, currency: 'usd',
    metadata: { company: 'Company', locations: '2', term_months: '6' }, customer_details: { name: 'Pat Lee', email: 'pat@example.com' },
  } },
};
const statusChange = (from: string, to: string) =>
  ({ type: 'customer.subscription.updated', data: { object: { id: 'sub_1', customer: 'cus_1', status: to }, previous_attributes: { status: from } } });

describe('which Stripe events open or pause an account', () => {
  it('opens on an order, even while a bank payment is still clearing', () => {
    expect(accountChange(order)).toEqual({ open: { customer: 'cus_1', subscription: 'sub_1', company: 'Company', email: 'pat@example.com', locations: 2, term: 6 } });
    const pending = { ...order, data: { object: { ...order.data.object, payment_status: 'unpaid' } } };
    expect(accountChange(pending)?.open?.customer).toBe('cus_1');
  });
  it('pauses when the bank payment fails, the grace period ends or the subscription ends; resumes once paid', () => {
    expect(accountChange({ type: 'checkout.session.async_payment_failed', data: { object: { customer: 'cus_1' } } })).toEqual({ pause: 'cus_1' });
    expect(accountChange(statusChange('past_due', 'unpaid'))).toEqual({ pause: 'cus_1' });
    expect(accountChange(statusChange('active', 'canceled'))).toEqual({ pause: 'cus_1' });
    expect(accountChange({ type: 'customer.subscription.deleted', data: { object: { customer: 'cus_1' } } })).toEqual({ pause: 'cus_1' });
    expect(accountChange(statusChange('unpaid', 'active'))).toEqual({ resume: 'cus_1' });
  });
  it('leaves the account alone during the grace period and when nothing changed', () => {
    expect(accountChange(statusChange('active', 'past_due'))).toBeNull();
    expect(accountChange(statusChange('trialing', 'active'))).toBeNull();
    expect(accountChange({ type: 'invoice.payment_failed', data: { object: {} } })).toBeNull();
  });
});

describe('opening and pausing', () => {
  it('opens the account with the service role key and welcomes the owner once', async () => {
    const send = fakeServices({ provision_paid_account: [{ company_id: 'co_1', created: true }] });
    const line = await applyAccountChange(env, send, accountChange(order));
    expect(line).toMatch(/^Opened, pat@example.com is the owner/);
    const [url, init] = calls(send)[0];
    expect(url).toBe('https://db.example/rest/v1/rpc/provision_paid_account');
    const headers = init.headers as Record<string, string>;
    expect(headers.apikey).toBe('sb_secret_abc');
    // The new sb_secret_ keys never go in Authorization; only the older JWT keys do.
    expect(headers.authorization).toBeUndefined();
    expect(JSON.parse(String(init.body))).toEqual({ p_customer: 'cus_1', p_subscription: 'sub_1', p_company: 'Company', p_email: 'pat@example.com', p_locations: 2, p_term: 6 });
    const [welcome] = emails(send);
    expect(welcome.to).toEqual(['pat@example.com']);
    expect(welcome.html).toContain('https://bergeronmaps.com/app/');

    const again = fakeServices({ provision_paid_account: [{ company_id: 'co_1', created: false }] });
    expect(await applyAccountChange(env, again, accountChange(order))).toBe('Already open');
    expect(emails(again)).toEqual([]);
  });
  it('the welcome button signs the owner straight in with a one-time link', async () => {
    const send = fakeServices({ provision_paid_account: [{ company_id: 'co_1', created: true }], generate_link: { hashed_token: 'abc123' } });
    await applyAccountChange(env, send, accountChange(order));
    const [welcome] = emails(send);
    expect(welcome.html).toContain('https://bergeronmaps.com/app/?token_hash=abc123&amp;type=magiclink&amp;auto=1');
    const gen = calls(send).find(([u]) => u.includes('generate_link'))!;
    expect(gen[0]).toBe('https://db.example/auth/v1/admin/generate_link');
    expect(JSON.parse(String(gen[1].body))).toEqual({ type: 'magiclink', email: 'pat@example.com' });
  });
  it('someone who never signed in gets an invite link, and with no link the button opens sign-in', async () => {
    const invite = vi.fn(async (_url: string, init?: RequestInit) => {
      const type = JSON.parse(String(init?.body)).type;
      return new Response(JSON.stringify(type === 'invite' ? { properties: { hashed_token: 'inv9' } } : { msg: 'User not found' }), { status: type === 'invite' ? 200 : 404 });
    });
    expect(await signInLink(env, invite, 'new@example.com')).toBe('https://bergeronmaps.com/app/?token_hash=inv9&type=invite&auto=1');
    const down = vi.fn(async () => new Response('{}', { status: 500 }));
    expect(await signInLink(env, down, 'new@example.com')).toBe('');
    const send = vi.fn(async (url: string) => new Response(JSON.stringify(url.includes('provision') ? [{ created: true }] : {}), { status: url.includes('generate_link') ? 500 : 200 }));
    await applyAccountChange(env, send, accountChange(order));
    expect(emails(send)[0].html).toContain('https://bergeronmaps.com/app/?email=pat%40example.com');
  });
  it('pauses and tells the billing contact, with the link to pay', async () => {
    const send = fakeServices({
      set_account_paused: 'co_1',
      'customers/cus_1': { email: 'billing@example.com' },
      'invoices?customer=cus_1': { data: [{ hosted_invoice_url: 'https://invoice.stripe.com/i/1' }] },
    });
    expect(await applyAccountChange(env, send, { pause: 'cus_1' })).toMatch(/^Paused/);
    expect(JSON.parse(String(calls(send)[0][1].body))).toEqual({ p_customer: 'cus_1', p_paused: true });
    const [mail] = emails(send);
    expect(mail.to).toEqual(['billing@example.com']);
    expect(mail.html).toContain('https://invoice.stripe.com/i/1');
    expect(mail.html).toMatch(/halted/);
  });
  it('without the key it changes nothing and says to do it by hand', async () => {
    const send = vi.fn();
    expect(await applyAccountChange({ ...env, SUPABASE_SERVICE_ROLE_KEY: '' }, send, { pause: 'cus_1' })).toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
    expect(send).not.toHaveBeenCalled();
  });
  it('a failed database call makes the webhook answer 500 before any email, so Stripe retries', async () => {
    const NOW = 1_800_000_000_000;
    const raw = JSON.stringify(order);
    const sig = await hmacHex('whsec_test', `${NOW / 1000}.${raw}`);
    const req = new Request('https://bergeronmaps.com/api/stripe-webhook', { method: 'POST', headers: { 'stripe-signature': `t=${NOW / 1000},v1=${sig}` }, body: raw });
    const send = fakeServices({ provision_paid_account: { message: 'down' } }, 500);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect((await stripeWebhook(req, env, send, NOW)).status).toBe(500);
    expect(emails(send)).toEqual([]);
  });
});

describe('daily grace-period reminders', () => {
  const DAY = 86_400_000;
  const failedAt = 1_800_000_000; // seconds
  const sub = (daysLater: number, extra: Record<string, unknown> = {}) => ({
    id: 'sub_1', metadata: { company: 'Company' }, customer: { email: 'billing@example.com' },
    latest_invoice: { status: 'open', amount_remaining: 100000, currency: 'usd', hosted_invoice_url: 'https://invoice.stripe.com/i/1', status_transitions: { finalized_at: failedAt }, ...extra },
    now: failedAt * 1000 + daysLater * DAY,
  });
  it('counts down from 10 days to 1, then stops', () => {
    const inv = sub(0).latest_invoice;
    expect(graceDaysLeft(inv, failedAt * 1000)).toBe(10);
    expect(graceDaysLeft(inv, failedAt * 1000 + 9 * DAY + 1000)).toBe(1);
    expect(graceDaysLeft(inv, failedAt * 1000 + 10 * DAY)).toBe(0);
  });
  it('says how many days are left, that service will be halted, and links to pay', () => {
    const s = sub(7);
    const mail = reminderFor(s, s.now);
    expect(mail.to).toEqual(['billing@example.com']);
    expect(mail.subject).toBe('Payment overdue: 3 days left before your Bergeron Maps service is halted');
    expect(mail.html).toContain('$1,000.00');
    expect(mail.html).toContain('https://invoice.stripe.com/i/1');
    expect(mail.html).not.toMatch(/·|&middot;/);
    const last = sub(9);
    expect(reminderFor(last, last.now).subject).toMatch(/^Payment overdue: 1 day left/);
  });
  it('sends nothing once the period is over, the invoice is paid, or there is no email', () => {
    const over = sub(10);
    expect(reminderFor(over, over.now)).toBeNull();
    const paid = sub(2, { status: 'paid' });
    expect(reminderFor(paid, paid.now)).toBeNull();
    const nobody = { ...sub(2), customer: {} };
    expect(reminderFor(nobody, nobody.now)).toBeNull();
  });
  it('the daily run emails every overdue customer, across pages', async () => {
    const s = sub(1);
    const pages = [
      { data: [{ ...s, id: 'sub_a' }], has_more: true },
      { data: [{ ...s, id: 'sub_b' }, { ...sub(1, { status_transitions: { finalized_at: failedAt - 12 * 86_400 } }), id: 'sub_c' }], has_more: false },
    ];
    let page = 0;
    const send = vi.fn(async (url: string) =>
      new Response(JSON.stringify(url.includes('/subscriptions') ? pages[page++] : {}), { status: 200 }));
    vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(await sendGraceReminders(env, send, s.now)).toBe(2);
    const listed = calls(send).filter(([u]) => u.includes('/subscriptions')).map(([u]) => u);
    expect(listed[0]).toContain('status=past_due');
    expect(listed[1]).toContain('starting_after=sub_a');
  });
});
