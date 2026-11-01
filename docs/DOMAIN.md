# Pointing bergeronmaps.com at the site

The GitHub Pages deployment (`.github/workflows/pages.yml`) publishes:

- the marketing site from `site/` at the root, and
- the app under `/app/`.

Once the steps below are done, `bergeronmaps.com` shows the marketing site and `bergeronmaps.com/app/` is the app.
Old links to `keganberg.github.io/Bergeron-Maps/` redirect to the new domain automatically, and old app links
(`…/#/site/…`, `…/#/view/…`) are forwarded to `/app/`.

The domain is registered with **Porkbun**.

## 1. Porkbun DNS (about 5 minutes)

1. Sign in at porkbun.com → **Account → Domain Management**.
2. Next to `bergeronmaps.com`, click **DNS** (under "Details").
3. Delete Porkbun's default parking records: the **ALIAS** record for `bergeronmaps.com` and the **CNAME** for
   `*.bergeronmaps.com`, both pointing to `pixie.porkbun.com`. Leave any MX or TXT records alone.
4. Add these records (leave **Host** blank for the root domain; TTL can stay at the default 600):

   | Type  | Host  | Answer                  |
   |-------|-------|-------------------------|
   | A     | (blank) | 185.199.108.153       |
   | A     | (blank) | 185.199.109.153       |
   | A     | (blank) | 185.199.110.153       |
   | A     | (blank) | 185.199.111.153       |
   | AAAA  | (blank) | 2606:50c0:8000::153   |
   | AAAA  | (blank) | 2606:50c0:8001::153   |
   | AAAA  | (blank) | 2606:50c0:8002::153   |
   | AAAA  | (blank) | 2606:50c0:8003::153   |
   | CNAME | www   | keganberg.github.io     |

   The AAAA rows are optional (IPv6); the A rows and the `www` CNAME are required.

## 2. GitHub Pages

1. github.com/KeganBerg/Bergeron-Maps → **Settings → Pages**.
2. Under **Custom domain**, type `bergeronmaps.com` and **Save**. GitHub runs a DNS check; it can take from a few
   minutes up to an hour after step 1 to pass.
3. When the check passes, tick **Enforce HTTPS** (the box becomes clickable once GitHub has issued the
   certificate, usually within 15–30 minutes).

Recommended: also verify the domain so nobody else can claim it on GitHub: your GitHub profile →
**Settings → Pages → Add a domain**, then add the TXT record it shows you in Porkbun.

## 3. Supabase sign-in links

Email sign-in links must point at the new address. In the Supabase dashboard → **Authentication → URL
Configuration**:

- **Site URL:** `https://bergeronmaps.com/app/`
- **Redirect URLs:** add `https://bergeronmaps.com/app/**` (keep the existing `keganberg.github.io` entry until
  the switch is done).

## Things to know

- Maps saved only in a browser (not signed in) are tied to the web address. After the move to
  bergeronmaps.com, use **Download map file** on the old address and **Import map file** on the new one to bring
  browser-only maps across. Maps saved online are unaffected.
- Optional: Porkbun offers free email forwarding (**Email → Forwarding**) so an address like
  `hello@bergeronmaps.com` can forward to bergeronmaps@gmail.com.
