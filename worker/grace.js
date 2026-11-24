// The daily grace-period reminder (Kegan, 2026-11-24): every day while a monthly payment is
// overdue, the customer gets an email saying how many of the 10 days are left, with a link to
// pay, and that the service will be halted when they run out. Runs from the Worker's daily cron
// (wrangler.jsonc "triggers"). Stripe itself retries the card and, after the last retry on day
// 10, marks the subscription unpaid, which pauses the account (worker/accounts.js).

import { esc, shell, button, sendEmail, para } from './shared.js';
import { stripeCall } from './stripe-api.js';

export const GRACE_DAYS = 10;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Days left for an overdue invoice, counted from when Stripe first tried to collect it
 * (finalized): 10 on the day it failed, 1 on the last day, 0 once the grace period is over.
 */
export function graceDaysLeft(invoice, now = Date.now()) {
  const startedSeconds = invoice?.status_transitions?.finalized_at || invoice?.created;
  if (!startedSeconds) return 0;
  const elapsedDays = Math.floor((now - startedSeconds * 1000) / DAY_MS);
  return Math.max(0, Math.min(GRACE_DAYS, GRACE_DAYS - elapsedDays));
}

const money = (cents, currency = 'usd') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase() }).format((cents || 0) / 100);

/** The reminder for one overdue subscription, as a Resend message, or null when none is due. */
export function reminderFor(subscription, now = Date.now()) {
  const invoice = subscription?.latest_invoice;
  if (!invoice || typeof invoice !== 'object' || invoice.status !== 'open') return null;
  const to = subscription.customer?.email || invoice.customer_email;
  const left = graceDaysLeft(invoice, now);
  if (!to || left < 1) return null;
  const company = subscription.metadata?.company || subscription.customer?.name || 'your company';
  const days = `${left} day${left === 1 ? '' : 's'}`;
  const amount = money(invoice.amount_remaining, invoice.currency);
  const pay = invoice.hosted_invoice_url || '';
  const html = shell(`<h1 style="margin:0 0 20px;font-size:22px;line-height:1.3;">Payment overdue: ${days} left</h1>
${para(`We could not collect the monthly payment of ${esc(amount)} for ${esc(company)}'s Bergeron Maps service.`)}
${para(`<strong>If it isn't paid within ${days}, your service will be halted.</strong> Your maps, sign-ins and public map links stop working until the payment goes through. Nothing is deleted.`)}
${pay ? button(esc(pay), 'Pay now') : ''}
<p style="margin:16px 0 24px;font-size:14px;line-height:1.5;color:#555555;">You can pay with a different card on that page. Already paid? Thank you, you can ignore this email. Questions? Reply to it.</p>`);
  return {
    to: [to],
    subject: `Payment overdue: ${days} left before your Bergeron Maps service is halted`,
    html,
    text: [
      `We could not collect the monthly payment of ${amount} for ${company}'s Bergeron Maps service.`,
      `If it isn't paid within ${days}, your service will be halted: maps, sign-ins and public map links stop working until the payment goes through.`,
      pay && `Pay here: ${pay}`,
    ].filter(Boolean).join('\n\n'),
  };
}

/** The daily run: emails every customer whose monthly payment is overdue. Answers how many were sent. */
export async function sendGraceReminders(env, send = fetch, now = Date.now()) {
  if (!(env.STRIPE_SECRET_KEY || '').trim() || !env.RESEND_API_KEY) return 0;
  let sent = 0;
  let after = '';
  for (let page = 0; page < 20; page++) {
    const list = await stripeCall(env, send, 'GET',
      `/subscriptions?status=past_due&limit=100&expand[]=data.latest_invoice&expand[]=data.customer${after ? `&starting_after=${after}` : ''}`);
    for (const sub of list?.data || []) {
      const message = reminderFor(sub, now);
      if (message && await sendEmail(env, send, message)) sent++;
    }
    if (!list?.has_more || !list.data?.length) break;
    after = list.data[list.data.length - 1].id;
  }
  console.log(`Grace reminders sent: ${sent}`);
  return sent;
}
