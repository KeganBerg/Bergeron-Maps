// Referral codes: every paying customer gets one, and when a new customer buys with it the
// customer who referred them gets one month free (a credit of one month of their own
// subscription, taken off their next invoice). Everything lives in Stripe, so there is no
// database table: the code is stored on the Stripe customer as metadata.referral_code, and the
// new customer's Checkout page carries metadata.referred_by (the referrer's customer ID).

import { stripeCall } from './stripe-api.js';

// No 0/O or 1/I, so a code read out over the phone can't be mistyped.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const CODE = /^BM-[A-HJ-NP-Z2-9]{6}$/;

export function newReferralCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return `BM-${[...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join('')}`;
}

/** Cleans what a buyer typed: "bm-abc234 " becomes "BM-ABC234". Empty or malformed gives ''. */
export function readReferralCode(value) {
  const code = String(value ?? '').trim().toUpperCase().replace(/^BM(?!-)/, 'BM-');
  return CODE.test(code) ? code : '';
}

/**
 * Finds the customer who owns a referral code. Answers {id, email} or null. Stripe's customer
 * search can lag about a minute behind a brand-new code, which is fine for referrals.
 */
export async function findReferrer(env, send, code) {
  const query = `metadata['referral_code']:'${code}'`;
  const found = await stripeCall(env, send, 'GET', `/customers/search?query=${encodeURIComponent(query)}&limit=1`);
  const c = found?.data?.[0];
  return c ? { id: c.id, email: String(c.email || '').toLowerCase() } : null;
}

/**
 * After a paid order: gives the new customer their own code (once), and credits the referrer
 * one month free. The credit uses an idempotency key tied to the Checkout page, so a webhook
 * that Stripe sends twice never credits twice. Answers {code, reward} for the order email.
 */
export async function settleReferral(env, send, session) {
  const result = { code: '', reward: 0 };
  if (session.customer) {
    const customer = await stripeCall(env, send, 'GET', `/customers/${session.customer}`);
    result.code = customer?.metadata?.referral_code || '';
    if (!result.code) {
      result.code = newReferralCode();
      await stripeCall(env, send, 'POST', `/customers/${session.customer}`, { 'metadata[referral_code]': result.code });
    }
  }
  const referrer = session.metadata?.referred_by;
  if (referrer && referrer !== session.customer) {
    const subs = await stripeCall(env, send, 'GET', `/subscriptions?customer=${referrer}&limit=3`);
    // One month of what the referrer pays: each recurring line's price times its quantity.
    const monthly = (subs?.data || []).flatMap((s) => s.items?.data || [])
      .filter((i) => i.price?.recurring)
      .reduce((sum, i) => sum + (i.price.unit_amount || 0) * (i.quantity || 1), 0);
    if (monthly > 0) {
      await stripeCall(env, send, 'POST', `/customers/${referrer}/balance_transactions`, {
        amount: String(-monthly),
        currency: 'usd',
        description: `Referral reward: 1 month free for referring ${session.metadata?.company || 'a new customer'}`,
      }, `referral-${session.id}`);
      result.reward = monthly;
    }
  }
  return result;
}
