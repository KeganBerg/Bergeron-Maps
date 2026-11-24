// Opens and pauses Bergeron Maps accounts from Stripe events (Alex's rules, 2026-11-24): an order
// opens the account at once, and an account whose payment fails for good is paused, with nobody
// able to use its maps and its public links dark, until it pays again. The database does the
// work (supabase/migrations/20261124030000_paid_accounts.sql); this file decides when, and calls
// it with the Supabase service role key (Cloudflare secret SUPABASE_SERVICE_ROLE_KEY).

import { esc, shell, button, sendEmail, para } from './shared.js';
import { stripeCall } from './stripe-api.js';

export const APP_URL = 'https://bergeronmaps.com/app/';

/**
 * What a Stripe event means for the customer's account: {open: {...}}, {pause: customerId},
 * {resume: customerId}, or null. A monthly payment that is only overdue (past_due) changes
 * nothing: that is the 10-day grace period, and the daily reminders cover it.
 */
export function accountChange(event) {
  const o = event?.data?.object || {};
  switch (event?.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded': {
      // A bank payment still clearing opens the account too; if it fails, the account pauses.
      const m = o.metadata || {};
      const term = Number(m.term_months);
      return {
        open: {
          customer: o.customer, subscription: o.subscription || '', company: m.company || o.customer_details?.name || 'Company',
          email: o.customer_details?.email || o.customer_email || '', locations: Number(m.locations) || 1,
          term: term === 6 || term === 12 ? term : null,
        },
      };
    }
    case 'checkout.session.async_payment_failed':
      return { pause: o.customer };
    case 'customer.subscription.updated': {
      const was = event.data?.previous_attributes?.status;
      if (!was || was === o.status) return null;
      if (o.status === 'unpaid' || o.status === 'canceled') return { pause: o.customer };
      if (o.status === 'active' && (was === 'past_due' || was === 'unpaid')) return { resume: o.customer };
      return null;
    }
    case 'customer.subscription.deleted':
      return { pause: o.customer };
    default:
      return null;
  }
}

/** Calls a database function as the service role. Throws with the database's message on failure. */
async function rpc(env, send, name, args) {
  const key = (env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const headers = { apikey: key, 'content-type': 'application/json' };
  // Older keys are JWTs and also go in Authorization; the newer sb_secret_ keys go in apikey only.
  if (key.startsWith('eyJ')) headers.authorization = `Bearer ${key}`;
  const res = await send(`${env.SUPABASE_URL}/rest/v1/rpc/${name}`, { method: 'POST', headers, body: JSON.stringify(args) });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`Supabase ${name} answered ${res.status}: ${body?.message || ''}`);
  return body;
}

/**
 * Applies the change and answers one line for the order email, such as "Opened, owner invited".
 * Without the service role key nothing changes and the line says it must be done by hand. Throws
 * when the database call fails, so the webhook answers 500 and Stripe retries (both calls are
 * safe to repeat).
 */
export async function applyAccountChange(env, send, change) {
  if (!change) return '';
  const target = change.open?.customer || change.pause || change.resume;
  if (!target) return '';
  if (!(env.SUPABASE_SERVICE_ROLE_KEY || '').trim()) {
    return 'Not changed: SUPABASE_SERVICE_ROLE_KEY isn\'t set in Cloudflare, so do it by hand in All accounts';
  }
  if (change.open) {
    const o = change.open;
    const rows = await rpc(env, send, 'provision_paid_account', {
      p_customer: o.customer, p_subscription: o.subscription, p_company: o.company,
      p_email: o.email, p_locations: o.locations, p_term: o.term,
    });
    const created = Boolean(rows?.[0]?.created);
    if (created) await welcomeEmail(env, send, o);
    return created ? `Opened, ${o.email} is the owner and got a welcome email` : 'Already open';
  }
  const paused = Boolean(change.pause);
  const company = await rpc(env, send, 'set_account_paused', { p_customer: target, p_paused: paused });
  if (!company) return 'No Bergeron Maps account belongs to this customer';
  if (paused) await pausedEmail(env, send, target);
  return paused ? 'Paused: nobody can open its maps and its public links are off until it pays' : 'Resumed: everyone has their access back';
}

function welcomeEmail(env, send, o) {
  const html = shell(`<h1 style="margin:0 0 20px;font-size:22px;line-height:1.3;">Your Bergeron Maps account is open</h1>
${para(`Thank you for your order. The account for ${esc(o.company)} is ready, with room for ${o.locations} location${o.locations === 1 ? '' : 's'}.`)}
${para(`Sign in with this email address (${esc(o.email)}). We email you a sign-in link, so there is no password to remember.`)}
${button(esc(APP_URL + '?email=' + encodeURIComponent(o.email)), 'Sign in to Bergeron Maps')}
<p style="margin:16px 0 24px;font-size:14px;line-height:1.5;color:#555555;">Your first location is called "First location". Rename it and start your first map, or reply to this email and we'll help.</p>`);
  return sendEmail(env, send, {
    to: [o.email],
    subject: 'Your Bergeron Maps account is open',
    html,
    text: `Your Bergeron Maps account for ${o.company} is open. Sign in with ${o.email} at ${APP_URL}`,
  });
}

/**
 * The customer's email and the Stripe page where they can pay what's owed (with a new card if
 * needed): the oldest open invoice. Either can be empty when Stripe has nothing.
 */
export async function billingContact(env, send, customerId) {
  const customer = await stripeCall(env, send, 'GET', `/customers/${customerId}`);
  const open = await stripeCall(env, send, 'GET', `/invoices?customer=${customerId}&status=open&limit=1`);
  return { email: customer?.email || '', payUrl: open?.data?.[0]?.hosted_invoice_url || '' };
}

/** Tells the billing contact why the maps stopped, with the link to pay. */
async function pausedEmail(env, send, customerId) {
  let contact = { email: '', payUrl: '' };
  try {
    contact = await billingContact(env, send, customerId);
  } catch (e) {
    console.error('Could not look up the customer for the pause email', e.message);
  }
  if (!contact.email) return;
  const html = shell(`<h1 style="margin:0 0 20px;font-size:22px;line-height:1.3;">Your Bergeron Maps service is paused</h1>
${para('We could not collect your payment, so your service is halted: your maps, sign-ins and public map links are paused. Nothing has been deleted.')}
${para('Everything comes back as soon as the payment goes through.')}
${button(esc(contact.payUrl || APP_URL), contact.payUrl ? 'Pay now' : 'Open Bergeron Maps')}
<p style="margin:16px 0 24px;font-size:14px;line-height:1.5;color:#555555;">Questions, or think this is a mistake? Reply to this email.</p>`);
  await sendEmail(env, send, {
    to: [contact.email],
    subject: 'Your Bergeron Maps service is paused',
    html,
    text: `We could not collect your payment, so your Bergeron Maps service is paused. Nothing has been deleted; it comes back as soon as the payment goes through.${contact.payUrl ? ` Pay here: ${contact.payUrl}` : ''}`,
  });
}
