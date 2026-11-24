import { describe, expect, it, vi } from 'vitest';
// @ts-expect-error plain JS module run by the Cloudflare Worker
import { checkout, checkoutTestPage, stripeWebhook, verifySignature, hmacHex, readOrder, describeEvent, STRIPE_VERSION } from '../../worker/stripe.js';

const env = {
  STRIPE_SECRET_KEY: 'rk_test_abc',
  STRIPE_SETUP_PRICE: 'price_setup',
  STRIPE_MONTHLY_PRICE: 'price_monthly',
  STRIPE_WEBHOOK_SECRET: 'whsec_test',
  RESEND_API_KEY: 're_test',
};
const buyer = { company: 'Company', name: 'Pat Lee', email: 'Pat@Example.com', locations: 3 };
const post = (body: unknown, origin = 'https://bergeronmaps.com') =>
  new Request('https://bergeronmaps.com/api/checkout', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) });
const stripeOk = () => vi.fn(async () => new Response(JSON.stringify({ id: 'cs_test_1', url: 'https://checkout.stripe.com/c/pay/cs_test_1' }), { status: 200 }));
type Call = [string, RequestInit];

describe('POST /api/checkout', () => {
  it('starts one Checkout page: setup fee today and the monthly fee 30 days later, both per location', async () => {
    const send = stripeOk();
    const res = await checkout(post(buyer), env, send);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, url: 'https://checkout.stripe.com/c/pay/cs_test_1' });
    const [url, init] = send.mock.calls[0] as unknown as Call;
    expect(url).toBe('https://api.stripe.com/v1/checkout/sessions');
    const headers = init.headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer rk_test_abc');
    expect(headers['stripe-version']).toBe(STRIPE_VERSION);
    const form = new URLSearchParams(String(init.body));
    expect(form.get('mode')).toBe('subscription');
    expect(form.get('line_items[0][price]')).toBe('price_setup');
    expect(form.get('line_items[0][quantity]')).toBe('3');
    expect(form.get('line_items[1][price]')).toBe('price_monthly');
    expect(form.get('line_items[1][quantity]')).toBe('3');
    expect(form.get('subscription_data[trial_period_days]')).toBe('30');
    expect(form.get('managed_payments[enabled]')).toBe('false');
    expect(form.get('customer_email')).toBe('pat@example.com');
    expect(form.get('metadata[company]')).toBe('Company');
    expect(form.get('subscription_data[metadata][locations]')).toBe('3');
    expect(form.get('success_url')).toBe('https://bergeronmaps.com/api/checkout-test?checkout=done&session_id={CHECKOUT_SESSION_ID}');
    // Stripe's guidance: let the Dashboard decide payment methods.
    expect([...form.keys()].some((k) => k.startsWith('payment_method_types'))).toBe(false);
    // The terms box only once the terms page exists.
    expect(form.has('consent_collection[terms_of_service]')).toBe(false);
  });
  it('ignores stray line breaks in pasted values and explains a product ID by mistake', async () => {
    const send = stripeOk();
    await checkout(post(buyer), { ...env, STRIPE_SETUP_PRICE: 'price_setup\n', STRIPE_SECRET_KEY: ' rk_test_abc ' }, send);
    const [, init] = send.mock.calls[0] as unknown as Call;
    expect(new URLSearchParams(String(init.body)).get('line_items[0][price]')).toBe('price_setup');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer rk_test_abc');
    const res = await checkout(post(buyer), { ...env, STRIPE_SETUP_PRICE: 'prod_123' }, stripeOk());
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/price IDs/);
  });
  it('asks for agreement to the terms when turned on', async () => {
    const send = stripeOk();
    await checkout(post(buyer), { ...env, STRIPE_TERMS: 'required' }, send);
    const form = new URLSearchParams(String((send.mock.calls[0] as unknown as Call)[1].body));
    expect(form.get('consent_collection[terms_of_service]')).toBe('required');
  });
  it('refuses live keys until sales are turned on', async () => {
    const live = { ...env, STRIPE_SECRET_KEY: 'rk_live_abc' };
    const send = stripeOk();
    expect((await checkout(post(buyer), live, send)).status).toBe(503);
    expect(send).not.toHaveBeenCalled();
    expect((await checkout(post(buyer), { ...live, CHECKOUT_LIVE: 'true' }, send)).status).toBe(200);
  });
  it('refuses other sites, missing setup, bad details and big orders without calling Stripe', async () => {
    const send = stripeOk();
    expect((await checkout(post(buyer, 'https://evil.example'), env, send)).status).toBe(403);
    expect((await checkout(new Request('https://bergeronmaps.com/api/checkout'), env, send)).status).toBe(405);
    const empty = await checkout(post(buyer), { ...env, STRIPE_MONTHLY_PRICE: '' }, send);
    expect(empty.status).toBe(503);
    expect((await empty.json()).error).toBe('Not set up: STRIPE_MONTHLY_PRICE is empty');
    expect((await checkout(post('nope'), env, send)).status).toBe(400);
    for (const bad of [{ email: 'x' }, { company: '' }, { locations: 0 }, { locations: 2.5 }, { locations: 21 }])
      expect((await checkout(post({ ...buyer, ...bad }), env, send)).status).toBe(400);
    expect(send).not.toHaveBeenCalled();
  });
  it('says the payment service failed when Stripe refuses', async () => {
    const send = vi.fn(async () => new Response(JSON.stringify({ error: { message: 'No such price' } }), { status: 400 }));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await checkout(post(buyer), env, send);
    expect(res.status).toBe(502);
    // Test keys show Stripe's reason; live keys never do.
    expect((await res.json()).error).toBe('Payment service failed: No such price');
    const live = await checkout(post(buyer), { ...env, STRIPE_SECRET_KEY: 'rk_live_x', CHECKOUT_LIVE: 'true' }, send);
    expect((await live.json()).error).toBe('Payment service failed');
  });
  it('only sends buyers back to a page on this site', () => {
    expect(readOrder({ ...buyer, returnPath: '/get-your-map/' }).returnPath).toBe('/get-your-map/');
    expect(readOrder({ ...buyer, returnPath: '//evil.example' }).returnPath).toBe('/api/checkout-test');
    expect(readOrder({ ...buyer, returnPath: 'https://evil.example' }).returnPath).toBe('/api/checkout-test');
  });
});

const NOW = 1_800_000_000_000;
async function signed(event: unknown, secret = 'whsec_test', t = NOW / 1000) {
  const raw = JSON.stringify(event);
  const sig = await hmacHex(secret, `${t}.${raw}`);
  return new Request('https://bergeronmaps.com/api/stripe-webhook', { method: 'POST', headers: { 'stripe-signature': `t=${t},v1=${sig}` }, body: raw });
}
const paid = {
  type: 'checkout.session.completed',
  livemode: false,
  data: { object: { payment_status: 'paid', amount_total: 750000, currency: 'usd', customer: 'cus_1', metadata: { company: 'Company <b>', locations: '3' }, customer_details: { name: 'Pat Lee', email: 'pat@example.com' } } },
};

describe('POST /api/stripe-webhook', () => {
  it('emails the inbox about a paid order, escaped, with a link to the customer in Stripe', async () => {
    const send = vi.fn(async () => new Response('{}', { status: 200 }));
    const res = await stripeWebhook(await signed(paid), env, send, NOW);
    expect(res.status).toBe(200);
    const mail = JSON.parse(String((send.mock.calls[0] as unknown as Call)[1].body));
    expect(mail.to).toEqual(['bergeronmaps@gmail.com']);
    expect(mail.subject).toBe('Test: New order paid: Company <b>');
    expect(mail.html).toContain('$7,500.00');
    expect(mail.html).toContain('Company &lt;b&gt;');
    expect(mail.html).toContain('https://dashboard.stripe.com/test/customers/cus_1');
    expect(mail.html).not.toMatch(/·|&middot;/);
  });
  it('refuses bad, wrong-secret and old signatures without emailing', async () => {
    const send = vi.fn(async () => new Response('{}', { status: 200 }));
    const forged = await signed(paid, 'whsec_other');
    expect((await stripeWebhook(forged, env, send, NOW)).status).toBe(400);
    const old = await signed(paid, 'whsec_test', NOW / 1000 - 600);
    expect((await stripeWebhook(old, env, send, NOW)).status).toBe(400);
    const none = new Request('https://bergeronmaps.com/api/stripe-webhook', { method: 'POST', body: JSON.stringify(paid) });
    expect((await stripeWebhook(none, env, send, NOW)).status).toBe(400);
    expect(send).not.toHaveBeenCalled();
  });
  it('answers 500 when the email fails, so Stripe tries again', async () => {
    const send = vi.fn(async () => new Response('{}', { status: 500 }));
    expect((await stripeWebhook(await signed(paid), env, send, NOW)).status).toBe(500);
  });
  it('ignores events it does not act on', async () => {
    const send = vi.fn();
    expect((await stripeWebhook(await signed({ type: 'customer.created', data: { object: {} } }), env, send, NOW)).status).toBe(200);
    expect(send).not.toHaveBeenCalled();
  });
  it('tells a pending bank payment apart from a paid order, and names the other events', () => {
    expect(describeEvent({ ...paid, data: { object: { ...paid.data.object, payment_status: 'unpaid' } } }).title).toMatch(/^Order placed, bank payment pending/);
    expect(describeEvent({ type: 'invoice.payment_failed', data: { object: { id: 'in_1', customer_email: 'a@b.co', amount_due: 150000, currency: 'usd' } } }).title).toBe('Payment failed: a@b.co');
    expect(describeEvent({ type: 'charge.dispute.created', livemode: true, data: { object: { id: 'dp_1', amount: 250000, currency: 'usd' } } }).link).toBe('https://dashboard.stripe.com/disputes/dp_1');
  });
  it('checks signatures the way Stripe signs them', async () => {
    const sig = await hmacHex('whsec_test', `${NOW / 1000}.body`);
    expect(await verifySignature('body', `t=${NOW / 1000},v1=bad,v1=${sig}`, 'whsec_test', NOW)).toBe(true);
    expect(await verifySignature('body2', `t=${NOW / 1000},v1=${sig}`, 'whsec_test', NOW)).toBe(false);
  });
});

describe('GET /api/checkout-test', () => {
  it('exists only with a test key', async () => {
    const get = new Request('https://bergeronmaps.com/api/checkout-test');
    const res = checkoutTestPage(get, env);
    expect(res.status).toBe(200);
    expect(res.headers.get('x-robots-tag')).toBe('noindex');
    expect(checkoutTestPage(get, { ...env, STRIPE_SECRET_KEY: 'rk_live_abc' }).status).toBe(404);
    expect(checkoutTestPage(get, {}).status).toBe(404);
  });
});
