# Stripe payments (Get Your Map Now)

How a buyer pays online, what the code does, and the steps in the Stripe and Cloudflare dashboards.
Code: `worker/stripe.js`, `worker/accounts.js` (opening and pausing accounts), `worker/grace.js` (daily reminders),
tests in `src/cloud/stripe-worker.test.ts` and `src/cloud/accounts-worker.test.ts`, database part in
`supabase/migrations/20261124030000_paid_accounts.sql`.

## What happens

1. On the purchase page, `/get-your-map/` (`site/get-your-map/`), the buyer picks the number of
   locations (1 to 20; more goes through a conversation with Alex) and a 6 or 12 month term (same
   price), then fills in company, name and email. The page posts that to `POST /api/checkout` with
   `term` and `returnPath: '/get-your-map/'`, and Stripe sends the buyer back there with
   `?checkout=done` or `?checkout=canceled`. The page isn't linked from the site, is `noindex` and
   isn't in the sitemap until sales go live (`src/siteClaims.test.ts` checks this).
2. The Worker starts a Stripe Checkout page in subscription mode with two lines, both times the number
   of locations:
   - **Map setup**, one-time, $2,500: charged today.
   - **Map subscription**, $500 a month: starts 30 days later (a 30-day trial on the subscription, so
     Stripe's page says "30 days free, then $500.00 per month" next to the setup fee due today).
   Stripe's page collects the card or bank account, billing address and phone, and (once turned on) the
   "I agree to the terms" box. Payment methods are chosen in the Stripe Dashboard, not in code.
3. Stripe sends signed events to `POST /api/stripe-webhook`. The Worker checks the signature and emails
   bergeronmaps@gmail.com about each one it acts on:

   | Stripe event | Email |
   | --- | --- |
   | `checkout.session.completed` | New order paid (or, for a bank payment, order placed and bank payment pending) |
   | `checkout.session.async_payment_succeeded` | Bank payment cleared, order paid |
   | `checkout.session.async_payment_failed` | Bank payment failed |
   | `invoice.payment_failed` | A monthly payment failed (Stripe retries it by itself) |
   | `customer.subscription.updated` | Only when the status changes: overdue (10-day grace period started), grace period over (unpaid), or paid again |
   | `customer.subscription.deleted` | Subscription canceled |
   | `charge.refunded` | Refund issued |
   | `charge.dispute.created` | Card dispute opened, with the respond-by date |
   | `radar.early_fraud_warning.created` | Fraud warning on a payment |

   Monthly renewals, retries of failed cards and receipts are Stripe Billing's job; nothing in our code
   runs them. Stripe's Customer portal lets customers change their card or cancel.

Each order records `term_months` (6 or 12) and `assisted_setup` (`yes` for 5 or more locations: the
team helps build the first maps) in the Checkout and subscription metadata, and the order email shows
both. Stripe bills monthly either way; the term is for the agreement.

Not built yet (on purpose, waiting on decisions in the onboarding plan): the terms page, sales tax and
white-label ($5,000).

## Opening and pausing accounts

- **Opening.** As soon as Checkout finishes (even while a bank payment is still clearing), the Worker
  opens a company named after the order, with one site called "First location", room for as many
  sites as were bought and the contract term on record. The buyer's email becomes the owner (invited,
  if they have never signed in) and gets a "Your Bergeron Maps account is open" email. Its button
  is a one-time sign-in link (Supabase's admin `generate_link`, carried on the app's own
  `?token_hash=…&auto=1` address), so it signs them straight in; it lasts as long as Supabase's email
  link setting, 1 hour by default, and after that they sign in with their email as usual. A repeated
  webhook never opens a second company: the Stripe customer ID is the key.
- **Pausing.** A failed bank payment, the end of the grace period (subscription unpaid) or a canceled
  subscription pauses the whole company: nobody in it can open its maps, everyone is signed out, and
  its public map links stop working. Nothing is deleted. The billing contact gets "Your service is
  paused" with a link to pay, and people who sign in see why their maps are gone.
- **Resuming.** Once the payment goes through (subscription active again), everyone gets their access
  back exactly as it was.
- The order email says what happened under "Bergeron Maps account". Until the
  `SUPABASE_SERVICE_ROLE_KEY` secret is set, the Worker changes nothing and that line says to do it by
  hand in All accounts.

`GET /api/checkout-test` is a bare test form that only works with a test key and isn't linked from the site.

## Referral codes (1 month free)

Every paid order gets a referral code such as `BM-7KQ2MX`, saved on the Stripe customer
(metadata `referral_code`) and shown in the order email so it can be passed to the customer.
When a new buyer enters someone's code, the order is marked `referred_by` that customer, and once
the new order is paid the referrer gets one month free: a credit equal to one month of their own
subscription, which Stripe takes off their next invoice. The new buyer pays normal prices. A code
can't be used on your own email, and a repeated webhook never credits twice (idempotency key per
Checkout page). Code: `worker/referrals.js`.

## The 10-day grace period

Stripe retries a failed monthly payment by itself. Set the retries to end after 10 days (step 8);
then the subscription becomes **unpaid**, the order inbox gets "Grace period over", and the account
pauses by itself.

Every day of those 10 days, at 15:00 UTC (10 AM Eastern in winter), the Worker's cron
(`wrangler.jsonc` "triggers") emails each customer with an overdue payment: how many days are left,
the amount, a **Pay now** button to Stripe's page for the invoice (where they can use another card),
and that the service will be halted when the days run out. The days count from the first failed
attempt. The order inbox keeps getting its own alerts.

## Safety rules in the code

- Live keys (`sk_live_`/`rk_live_`) refuse to sell until the `CHECKOUT_LIVE` secret is `true`.
- Only bergeronmaps.com, its workers.dev test and preview addresses and localhost may start a Checkout.
- Webhooks with a wrong or missing signature, or older than five minutes, are refused.
- If the order email fails the Worker answers 500, so Stripe sends the event again (up to three days).
- No card details ever touch our servers; Stripe's page collects them.

## Steps for Kegan (test mode first)

Never paste keys in chat. They go straight from Stripe into Cloudflare.

1. **Use test data.** In the Stripe Dashboard, open the account menu (top left) and switch to a
   **sandbox** (Stripe's test environment; create one called "Bergeron Maps test" if there isn't one).
   Everything below is done there first.
2. **Products.** Product catalog → **Add product**:
   - Name **Map setup**, one-off price **$2,500.00 USD**. Save, open the price, copy its ID (`price_…`).
   - Name **Map subscription**, recurring price **$500.00 USD monthly**. Copy its price ID too.
3. **Restricted key.** Developers → API keys → **Create restricted key**, name it "bergeronmaps.com
   website". Set **Checkout Sessions: Write**, **Customers: Write**, **Subscriptions: Read**,
   **Invoices: Read**, **Products: Read** and **Prices: Read**; leave everything else at None. (Customers and
   Subscriptions are for referral codes and credits; Invoices for the pay link in reminders.) Create it and keep the `rk_test_…` value on screen for step 5.
4. **Webhook.** Developers → Webhooks → **Add destination** → your account → choose these events:
   the nine in the table above. Endpoint URL `https://bergeronmaps.com/api/stripe-webhook`. After saving,
   reveal the **Signing secret** (`whsec_…`).
5. **Cloudflare secrets.** Cloudflare → Workers & Pages → **bergeron-maps** → Settings → Variables and
   Secrets → **Add**. Pick type **Secret** for every one (plain text variables are wiped by each deploy):
   - `STRIPE_SECRET_KEY`: the `rk_test_…` key from step 3
   - `STRIPE_WEBHOOK_SECRET`: the `whsec_…` from step 4
   - `STRIPE_SETUP_PRICE`: the Map setup price ID
   - `STRIPE_MONTHLY_PRICE`: the Map subscription price ID
   - `SUPABASE_SERVICE_ROLE_KEY`: Supabase → Project Settings → API Keys → the **secret** key
     (`sb_secret_…`, or the older `service_role` key). It lets the Worker open and pause accounts, so
     it lives only here.
6. **Emails Stripe sends to customers.** Settings → Customer emails: turn on successful payments,
   refunds, and failed payment and expiring card reminders. Settings → Billing → **Customer portal**:
   activate the no-code login link (free).
7. **Try it.** Open `https://bergeronmaps.com/api/checkout-test`, pay with card 4242 4242 4242 4242, any
   future date and any CVC. Within a minute bergeronmaps@gmail.com should get "Test: New order paid".
   In Stripe, the customer should show a paid $2,500 per location and a subscription whose trial ends in
   30 days.

8. **Grace period.** Settings → Billing → **Revenue recovery** (Manage failed payments): use a custom
   retry schedule whose last retry is on day 10, and set "If all retries for a payment fail" to
   **Mark the subscription as unpaid**. Also turn on the email to customers about failed payments.

## Before taking real money

- A terms page on the site, then the `STRIPE_TERMS` secret set to `required` and the terms link added in
  Stripe → Settings → Business → Public details.
- Sales tax: decide with an accountant. Stripe Tax costs extra per transaction, so it stays off until then.
- Link the purchase page from the site (the "Get your map now" buttons) and add it to the sitemap only
  once it works end to end in live mode, and remove the "nothing links to the purchase page" test then.
- Live mode: repeat steps 2 to 5 outside the sandbox with live values, then set `CHECKOUT_LIVE` to `true`.
- Large or custom deals: send a Stripe invoice from the Dashboard (Invoicing), no code needed.

## Costs

Stripe has no monthly fee. Each payment pays Stripe's processing fee (cards about 2.9% + 30¢, so about
$73 on a $2,500 setup; US bank payments (ACH) 0.8% capped at $5), and Stripe Billing adds a small
percentage on subscription charges. Check stripe.com/pricing for today's numbers. Turning on US bank
account payments in Settings → Payment methods saves most of the card fee on large setup payments.
