// Get Your Map Now payments through Stripe Checkout. Setup and steps: docs/STRIPE.md.
//
//   POST /api/checkout        {company, name, email, locations}: starts a Stripe Checkout page
//                             and answers {url} to send the buyer to. One subscription with the
//                             setup fee charged today and the monthly fee starting 30 days later,
//                             both times the number of locations.
//   POST /api/stripe-webhook  Stripe's signed events: emails the company inbox about new orders,
//                             failed payments, cancellations, refunds and disputes.
//   GET  /api/checkout-test   a bare test form, only while the Stripe key is a test key.
//
// Stripe is called over plain HTTPS (fetch) rather than with the stripe package, like the
// Resend calls in index.js: the Worker stays dependency-free and every call is easy to fake in
// the tests. The secret values live only in Cloudflare (Worker → Settings → Variables and
// Secrets): STRIPE_SECRET_KEY (a restricted key), STRIPE_WEBHOOK_SECRET, STRIPE_SETUP_PRICE,
// STRIPE_MONTHLY_PRICE.

import { INBOX, ORIGIN, EMAIL, reply, esc, shell, button } from './shared.js';

const STRIPE_API = 'https://api.stripe.com/v1';
// Pinned so a Stripe-side upgrade can't change what these calls return.
export const STRIPE_VERSION = '2026-11-18.endive';
// Tags these Checkout pages in the Stripe Dashboard so this flow can be told apart from others.
const INTEGRATION_ID = 'get-your-map-now-qmwvhtrk';
// Bigger orders go through a conversation first (the assisted path in the sales plan).
export const MAX_LOCATIONS = 20;
// Kegan's rule: the monthly fee starts 30 days after the setup payment.
export const MONTHLY_STARTS_AFTER_DAYS = 30;
// How old a signed webhook may be before it's refused as a replay (Stripe's own default).
const SIGNATURE_TOLERANCE_SECONDS = 300;

const isTestKey = (key) => /^(sk|rk)_test_/.test(key || '');
const isLiveKey = (key) => /^(sk|rk)_live_/.test(key || '');

/** POST /api/checkout. Answers {success, url} or {success: false, error}. */
export async function checkout(request, env, send = fetch) {
  if (request.method !== 'POST') return reply(405, { success: false, error: 'POST only' });
  const origin = request.headers.get('origin') || '';
  if (!ORIGIN.test(origin)) return reply(403, { success: false, error: 'Not allowed' });
  const key = env.STRIPE_SECRET_KEY;
  if (!key || !env.STRIPE_SETUP_PRICE || !env.STRIPE_MONTHLY_PRICE) return reply(503, { success: false, error: 'Not set up' });
  // Live keys sell for real, so they only work once Kegan turns sales on (CHECKOUT_LIVE=true).
  if (isLiveKey(key) && env.CHECKOUT_LIVE !== 'true') return reply(503, { success: false, error: 'Not open yet' });

  const text = await request.text();
  if (text.length > 4000) return reply(413, { success: false, error: 'Too long' });
  let data;
  try { data = JSON.parse(text); } catch { return reply(400, { success: false, error: 'Bad request' }); }
  const order = readOrder(data);
  if (typeof order === 'string') return reply(400, { success: false, error: order });

  const back = `${origin}${order.returnPath}`;
  const form = new URLSearchParams({
    mode: 'subscription',
    'line_items[0][price]': env.STRIPE_SETUP_PRICE,
    'line_items[0][quantity]': String(order.locations),
    'line_items[1][price]': env.STRIPE_MONTHLY_PRICE,
    'line_items[1][quantity]': String(order.locations),
    // The monthly price waits 30 days; the one-time setup price is charged today.
    'subscription_data[trial_period_days]': String(MONTHLY_STARTS_AFTER_DAYS),
    customer_email: order.email,
    billing_address_collection: 'required',
    'phone_number_collection[enabled]': 'true',
    'tax_id_collection[enabled]': 'true',
    'custom_text[submit][message]': `You pay the setup fee today. The monthly fee starts ${MONTHLY_STARTS_AFTER_DAYS} days from today.`,
    success_url: `${back}?checkout=done&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${back}?checkout=canceled`,
    integration_identifier: INTEGRATION_ID,
  });
  // The same facts on the Checkout page and on the subscription, so either can be traced back.
  const facts = { company: order.company, contact_name: order.name, locations: String(order.locations), source: 'get-your-map-now' };
  for (const [k, v] of Object.entries(facts)) {
    form.set(`metadata[${k}]`, v);
    form.set(`subscription_data[metadata][${k}]`, v);
  }
  // The "I agree to the terms" box. Stripe needs a terms page link in its settings first.
  if (env.STRIPE_TERMS === 'required') form.set('consent_collection[terms_of_service]', 'required');

  const res = await send(`${STRIPE_API}/checkout/sessions`, {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'stripe-version': STRIPE_VERSION, 'content-type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });
  const session = await res.json().catch(() => null);
  if (!res.ok || !session?.url) {
    console.error('Stripe Checkout failed', res.status, session?.error?.message);
    return reply(502, { success: false, error: 'Payment service failed' });
  }
  return reply(200, { success: true, url: session.url });
}

/** Checks the buyer's details. Answers the cleaned order, or an error message to show. */
export function readOrder(data) {
  if (!data || typeof data !== 'object') return 'Bad request';
  const field = (k, max = 200) => String(data[k] ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
  const company = field('company'), name = field('name'), email = field('email').toLowerCase();
  const locations = Number(data.locations);
  if (!company || !name) return 'Company and name are needed';
  if (!EMAIL.test(email)) return 'A valid email is needed';
  if (!Number.isInteger(locations) || locations < 1) return 'Choose how many locations';
  if (locations > MAX_LOCATIONS) return `For more than ${MAX_LOCATIONS} locations, contact us`;
  // Only a page on this same site, so the redirect can't be pointed somewhere else.
  const path = String(data.returnPath || '/api/checkout-test');
  const returnPath = /^\/[a-z0-9/_-]*$/i.test(path) && !path.startsWith('//') ? path : '/api/checkout-test';
  return { company, name, email, locations, returnPath };
}

/** POST /api/stripe-webhook. Answers 200 once handled, so Stripe stops retrying. */
export async function stripeWebhook(request, env, send = fetch, now = Date.now()) {
  if (request.method !== 'POST') return reply(405, { received: false });
  if (!env.STRIPE_WEBHOOK_SECRET) return reply(503, { received: false });
  const raw = await request.text();
  const signed = await verifySignature(raw, request.headers.get('stripe-signature') || '', env.STRIPE_WEBHOOK_SECRET, now);
  if (!signed) return reply(400, { received: false });
  let event;
  try { event = JSON.parse(raw); } catch { return reply(400, { received: false }); }

  const note = describeEvent(event);
  if (!note) return reply(200, { received: true });
  if (!env.RESEND_API_KEY) return reply(200, { received: true, emailed: false });
  const res = await send('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: 'Bergeron Maps orders <noreply@bergeronmaps.com>',
      to: [INBOX],
      subject: `${event.livemode ? '' : 'Test: '}${note.title}`.replace(/[\r\n]+/g, ' '),
      html: orderEmail(note),
      text: [note.title, ...note.rows.map(([k, v]) => `${k}: ${v}`), note.link].join('\n'),
    }),
  });
  // A failed email answers 500 so Stripe sends the event again later.
  if (!res.ok) return reply(500, { received: false });
  return reply(200, { received: true, emailed: true });
}

/**
 * Stripe-Signature is "t=<seconds>,v1=<hex>[,v1=<hex>]": an HMAC-SHA256 of "<t>.<raw body>"
 * with the endpoint's signing secret. Checked in constant time, and refused when older than
 * five minutes so a captured request can't be replayed.
 */
export async function verifySignature(raw, header, secret, now = Date.now()) {
  const parts = header.split(',').map((p) => p.split('='));
  const t = Number(parts.find(([k]) => k === 't')?.[1]);
  const sigs = parts.filter(([k]) => k === 'v1').map(([, v]) => v);
  if (!Number.isFinite(t) || !sigs.length) return false;
  if (Math.abs(now / 1000 - t) > SIGNATURE_TOLERANCE_SECONDS) return false;
  const expected = await hmacHex(secret, `${t}.${raw}`);
  return sigs.some((s) => sameText(s, expected));
}

export async function hmacHex(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function sameText(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const money = (cents, currency = 'usd') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase() }).format((cents || 0) / 100);

/**
 * What an event means for the business, as {title, rows, link, button}, or null for events the
 * Worker doesn't act on. Only the events listed in docs/STRIPE.md are sent to this endpoint.
 */
export function describeEvent(event) {
  const o = event?.data?.object || {};
  const dash = `https://dashboard.stripe.com/${event?.livemode ? '' : 'test/'}`;
  const who = (c = {}) => [c.name, c.email].filter(Boolean).join(', ');
  const order = (title) => {
    const m = o.metadata || {};
    return {
      title: `${title}: ${m.company || o.customer_details?.name || 'new customer'}`,
      rows: [
        ['Company', m.company],
        ['Contact', who(o.customer_details) || m.contact_name],
        ['Phone', o.customer_details?.phone],
        ['Locations', m.locations],
        ['Paid today', o.amount_total != null && money(o.amount_total, o.currency)],
      ],
      link: o.customer ? `${dash}customers/${o.customer}` : `${dash}payments`,
      button: 'Open the customer in Stripe',
    };
  };
  switch (event?.type) {
    case 'checkout.session.completed':
      // Bank payments (ACH) finish days later: async_payment_succeeded says when the money is in.
      return o.payment_status === 'unpaid' ? order('Order placed, bank payment pending') : order('New order paid');
    case 'checkout.session.async_payment_succeeded':
      return order('Bank payment cleared, order paid');
    case 'checkout.session.async_payment_failed':
      return order('Bank payment failed');
    case 'invoice.payment_failed':
      return {
        title: `Payment failed: ${o.customer_name || o.customer_email || 'a customer'}`,
        rows: [['Customer', who({ name: o.customer_name, email: o.customer_email })], ['Amount due', money(o.amount_due, o.currency)], ['Attempt', o.attempt_count && String(o.attempt_count)]],
        link: `${dash}invoices/${o.id}`,
        button: 'Open the invoice in Stripe',
      };
    case 'customer.subscription.deleted':
      return {
        title: `Subscription canceled: ${o.metadata?.company || 'a customer'}`,
        rows: [['Company', o.metadata?.company], ['Locations', o.metadata?.locations], ['Reason', o.cancellation_details?.reason]],
        link: `${dash}subscriptions/${o.id}`,
        button: 'Open the subscription in Stripe',
      };
    case 'charge.refunded':
      return {
        title: `Refund issued: ${money(o.amount_refunded, o.currency)}`,
        rows: [['Customer', who(o.billing_details)], ['Refunded', money(o.amount_refunded, o.currency)], ['Of', money(o.amount, o.currency)]],
        link: `${dash}payments/${o.payment_intent || o.id}`,
        button: 'Open the payment in Stripe',
      };
    case 'charge.dispute.created':
      return {
        title: `Card dispute opened: ${money(o.amount, o.currency)}`,
        rows: [['Amount', money(o.amount, o.currency)], ['Reason', o.reason], ['Respond by', o.evidence_details?.due_by && new Date(o.evidence_details.due_by * 1000).toDateString()]],
        link: `${dash}disputes/${o.id}`,
        button: 'Respond in Stripe',
      };
    case 'radar.early_fraud_warning.created':
      return {
        title: 'Fraud warning on a payment',
        rows: [['Type', o.fraud_type], ['Charge', o.charge]],
        link: `${dash}payments/${o.payment_intent || o.charge}`,
        button: 'Open the payment in Stripe',
      };
    default:
      return null;
  }
}

function orderEmail({ title, rows, link, button: label }) {
  const row = ([k, v]) =>
    `<tr><td style="padding:10px 16px 10px 0;border-top:1px solid #e6e6e1;font-size:14px;color:#666666;vertical-align:top;white-space:nowrap;width:110px;">${esc(k)}</td>` +
    `<td style="padding:10px 0;border-top:1px solid #e6e6e1;font-size:15px;color:#0b0b0b;">${esc(v)}</td></tr>`;
  return shell(`<h1 style="margin:0 0 20px;font-size:22px;line-height:1.3;">${esc(title)}</h1>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;border-bottom:1px solid #e6e6e1;">${rows.filter(([, v]) => v).map(row).join('')}</table>
${button(esc(link), esc(label))}
<p style="margin:16px 0 24px;font-size:13px;line-height:1.5;color:#777777;">Sent by the bergeronmaps.com payment system.</p>`,
  'Bergeron Maps orders');
}

/**
 * GET /api/checkout-test. A plain form to try Checkout end to end with Stripe's test cards. It
 * exists only while the key is a test key, and it isn't linked from the site, so nothing public
 * offers online purchase before it's real (docs/SITE_CLAIMS.md).
 */
export function checkoutTestPage(request, env) {
  if (request.method !== 'GET' || !isTestKey(env.STRIPE_SECRET_KEY)) return new Response('Not found', { status: 404 });
  const state = new URL(request.url).searchParams.get('checkout');
  const notice = state === 'done'
    ? '<p class="note">Checkout finished. The order email goes to the company inbox within a minute.</p>'
    : state === 'canceled' ? '<p class="note">Checkout was canceled. Nothing was charged.</p>' : '';
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><title>Checkout test</title>
<style>
body{margin:0;background:#f2f2ef;color:#0b0b0b;font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
main{max-width:440px;margin:40px auto;padding:24px;background:#fff;border:1px solid #dcdcd6}
h1{font-size:22px;font-weight:700;margin:0 0 4px}p{margin:0 0 16px;color:#444}
label{display:block;font-weight:600;margin:12px 0 4px}input{width:100%;box-sizing:border-box;padding:10px;font:inherit;border:1px solid #b8b8b0;border-radius:4px}
button{margin-top:20px;padding:12px 20px;font:inherit;font-weight:600;color:#fff;background:#0b0b0b;border:0;border-radius:4px;cursor:pointer}
.note{padding:12px;background:#f7f7f4;border-left:3px solid #0b0b0b}#error{color:#a00000}
</style></head><body><main>
<h1>Checkout test</h1>
<p>Test mode only. Pay with card 4242 4242 4242 4242, any future date and any CVC.</p>
${notice}
<form id="f">
<label for="company">Company</label><input id="company" required maxlength="200" value="Company">
<label for="name">Your name</label><input id="name" required maxlength="200">
<label for="email">Email</label><input id="email" type="email" required>
<label for="locations">Locations</label><input id="locations" type="number" min="1" max="${MAX_LOCATIONS}" value="1" required>
<button type="submit">Continue to payment</button>
<p id="error" role="alert"></p>
</form></main>
<script>
document.getElementById('f').addEventListener('submit', async (e) => {
  e.preventDefault();
  const v = (id) => document.getElementById(id).value;
  const err = document.getElementById('error');
  err.textContent = '';
  const res = await fetch('/api/checkout', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ company: v('company'), name: v('name'), email: v('email'), locations: Number(v('locations')) }) });
  const out = await res.json().catch(() => ({}));
  if (out.url) location.href = out.url; else err.textContent = out.error || 'Something went wrong.';
});
</script></body></html>`;
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } });
}
