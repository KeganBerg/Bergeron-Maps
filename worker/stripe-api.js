// One small helper for calling Stripe's API over fetch, shared by the checkout, the webhook
// and the referral code. Stripe takes form-encoded bodies and answers JSON.

const STRIPE_API = 'https://api.stripe.com/v1';
// Pinned so a Stripe-side upgrade can't change what these calls return.
export const STRIPE_VERSION = '2026-11-18.endive';

export class StripeError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/**
 * Calls Stripe with the Worker's restricted key. `params` is an object of form fields (or a
 * URLSearchParams); `idempotencyKey` makes a retried POST safe. Throws StripeError with
 * Stripe's own message when the call fails.
 */
export async function stripeCall(env, send, method, path, params, idempotencyKey) {
  const headers = { authorization: `Bearer ${(env.STRIPE_SECRET_KEY || '').trim()}`, 'stripe-version': STRIPE_VERSION };
  const init = { method, headers };
  if (params) {
    headers['content-type'] = 'application/x-www-form-urlencoded';
    init.body = (params instanceof URLSearchParams ? params : new URLSearchParams(params)).toString();
  }
  if (idempotencyKey) headers['idempotency-key'] = idempotencyKey;
  const res = await send(`${STRIPE_API}${path}`, init);
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new StripeError(res.status, body?.error?.message || `Stripe answered ${res.status}`);
  return body;
}
