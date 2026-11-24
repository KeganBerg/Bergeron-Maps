# Emails

What the app and site send, and the one-time setup that makes those emails arrive and look right.

## What sends email today

| Email | Sent by | From | Notes |
| --- | --- | --- | --- |
| Sign-in link and code (existing person) | Supabase Auth, **Magic Link** template | Supabase's sender until custom SMTP is set up | The only email the app sends. |
| Sign-in link and code (first sign-in for an email) | Supabase Auth, **Confirm signup** template | same | Same flow; Supabase picks this template the first time an email signs in. |
| Contact form lead ("Get your map now") | The site's Worker (`worker/index.js`, `POST /api/contact`) through Resend | Bergeron Maps website &lt;noreply@bergeronmaps.com&gt; | Goes to bergeronmaps@gmail.com; press Reply to answer the visitor. Needs the `RESEND_API_KEY` secret in Cloudflare (section 5). |

| Access given ("You now have access to Site Name") | The site's Worker (`worker/index.js`, `POST /api/access`) through Resend, right after **Give access** on Sites and people | Bergeron Maps &lt;noreply@bergeronmaps.com&gt; | Says where to go (the site link for one site) and how to sign in. The Worker checks the manager's own sign-in and that the person is on their team, and writes the email itself. Uses the same `RESEND_API_KEY` as the form. |
| Order notices to the company ("New order paid: Company", payment failed, canceled, refund, dispute) | The site's Worker (`worker/stripe.js`, `POST /api/stripe-webhook`) on Stripe's signed events | Bergeron Maps orders &lt;noreply@bergeronmaps.com&gt; | Goes to bergeronmaps@gmail.com only, never to customers. Test-mode events start with "Test:". Setup in `docs/STRIPE.md`. |

Not sent by email (shown in the app only): manager access requests, access removed or moved (offboarding and
transfers), changes to someone's existing access, new account set up. **Copy invite message** on Sites and
people is still there for sending it another way, and is the fallback if the email can't be sent.

## 1. Send sign-in emails from bergeronmaps.com (required)

Supabase's built-in email only delivers to members of your Supabase team and only a few per hour, so
managers and employees outside the team never get a link. Use a sending service. Resend has a free plan
(3,000 emails a month) and works with Supabase:

1. Create a Resend account at resend.com with bergeronmaps@gmail.com.
2. **Domains → Add domain** → `bergeronmaps.com`. Resend shows 3–4 DNS records (a DKIM TXT record named
   `resend._domainkey`, and an MX and SPF TXT record on the `send` subdomain).
3. Add the records in Cloudflare (the domain's DNS moved there from Porkbun on 2026-11-24). If Resend offers
   **Auto configure** / **Sign in to Cloudflare**, use it. Otherwise: Cloudflare dashboard → **bergeronmaps.com →
   DNS → Records → Add record**, and copy each record's type, name and value exactly as Resend shows it (for
   the MX record also its priority). Leave the existing `fwd1/fwd2.porkbun.com` MX records and the
   `v=spf1 include:_spf.porkbun.com ~all` TXT record alone (they run your email forwarding; Resend's records
   are on the `send` subdomain, so nothing conflicts).
4. Back in Resend, press **Verify**. When it says Verified, go to **API Keys → Create API key** (sending access).
5. Supabase dashboard → **Authentication → Emails → SMTP Settings** → turn on **Enable custom SMTP**:
   - Sender email: `noreply@bergeronmaps.com`, Sender name: `Bergeron Maps`
   - Host `smtp.resend.com`, Port `465`, Username `resend`, Password: the API key from step 4.
6. **Authentication → Rate Limits**: raise **emails sent per hour** to about 60.

## 2. Add a DMARC record (recommended)

In Cloudflare → **DNS → Records → Add record**: type TXT, name `_dmarc`, content:

```
v=DMARC1; p=none; rua=mailto:bergeronmaps@gmail.com
```

Gmail and Outlook trust mail more from domains with DMARC. After a few weeks of clean reports you can change
`p=none` to `p=quarantine`.

## 3. Branded email templates

Do this **after the app update with "Finish signing in" is live** (the new links need it).

Supabase dashboard → **Authentication → Emails → Templates**:

- **Magic Link**: Subject `Your Bergeron Maps sign-in link`. Body: paste all of
  [`supabase/email-templates/magic-link.html`](../supabase/email-templates/magic-link.html).
- **Confirm signup**: Subject `Sign in to Bergeron Maps`. Body: paste all of
  [`supabase/email-templates/confirm-signup.html`](../supabase/email-templates/confirm-signup.html).

Then **Authentication → Providers → Email**: keep **Confirm email** on, and set **Email OTP Length** to `6`.

What the new emails fix:

- Work email systems (Outlook "Safe Links" and similar) open links to scan them, which used up the old
  one-time link before the person clicked it. The new link opens the app and waits for **Finish signing
  in**, so a scan doesn't use it.
- The link now works in any browser or device, not only the one that asked for it.
- Each email also has a 6-digit code to type on the "Check your email" screen, for when the link won't open.
- Our logo and name instead of Supabase's plain text, and no client names.

## 4. Check it

1. Sign in at bergeronmaps.com/app with a Gmail plus-address (e.g. `yourname+emailtest@gmail.com`) and an
   Outlook.com or Hotmail address.
2. Both should land in the inbox, from **Bergeron Maps &lt;noreply@bergeronmaps.com&gt;**, with the logo.
3. In Gmail open the email → **⋮ → Show original**: SPF, DKIM and DMARC should all say **PASS**.
4. Press **Sign in** in one email, and type the code from the other. Both should sign you in.

## 5. Contact form

The form on bergeronmaps.com posts to `/api/contact` on our own Worker, which emails the lead through Resend.
The Resend key is kept only in Cloudflare, once:

1. Resend → **API Keys → Create API key**: name `Website form`, **Sending access**, domain `bergeronmaps.com`.
   Copy the `re_…` key (it's shown once).
2. Cloudflare dashboard → **Workers & Pages → bergeron-maps → Settings → Variables and Secrets → Add**:
   type **Secret**, name `RESEND_API_KEY`, value the key. Press **Deploy**.
3. Send a test from bergeronmaps.com#contact. It arrives from "Bergeron Maps website" with the visitor as the
   reply-to address.

Until the secret exists, the form says it didn't go through and shows the email address instead. Deploys keep
the secret; it never goes in the repository or GitHub.
