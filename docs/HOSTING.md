# Hosting on Cloudflare

bergeronmaps.com (the marketing site at the root and the app under `/app/`) moves from GitHub Pages to
Cloudflare. Supabase stays the database and sign-in service. Why, and the costs: the hosting plan doc
from 2026-11-24.

How it works:

- `scripts/build-deploy.sh --cloudflare` builds everything into `_site/` (same build GitHub Pages used).
- `wrangler.jsonc` describes a Cloudflare Worker that only serves those files. Unknown addresses get the
  site's `404.html` with a real 404 status; `/app` redirects to `/app/`.
- `deploy/cloudflare/_headers` adds security headers (HTTPS only, no framing by other sites, no camera,
  microphone or payment access) and long caching for the app's hashed files.
- `.github/workflows/cloudflare.yml` deploys `main` on every merge, and gives every pull request its own
  preview address (`pr-<number>-bergeron-maps.<account>.workers.dev`). Until the two secrets below exist it
  skips itself with a note, so checks stay green.

The address, links, saved sign-ins and maps saved in a browser stay the same, because the site stays on
bergeronmaps.com.

## Steps for Kegan

### A. Before the switch (nothing changes for visitors)

1. **Supabase on Pro.** supabase.com → the organization → **Billing**. If the plan says Free, change it to
   Pro ($25 a month). Free has no backups and pauses after a quiet week.
2. **Cloudflare account.** Sign up at dash.cloudflare.com with the company email. Free plan.
3. **Account ID.** Cloudflare dashboard → **Workers & Pages**. The **Account ID** is in the right-hand
   column. Copy it.
4. **API token.** Top-right profile icon → **My Profile → API Tokens → Create Token** → template
   **Edit Cloudflare Workers** → **Use template**. Under Account Resources pick your account; under Zone
   Resources pick **All zones** → **Continue to summary → Create Token**. Copy the token (it is shown once).
5. **Give both to GitHub.** github.com/KeganBerg/Bergeron-Maps → **Settings → Secrets and variables →
   Actions → New repository secret**:
   - `CLOUDFLARE_API_TOKEN` = the token
   - `CLOUDFLARE_ACCOUNT_ID` = the account ID
6. **First deploy.** **Actions → Deploy to Cloudflare → Run workflow** (branch `main`). When it is green,
   the site is live at the test address shown at the end of the deploy log
   (`https://bergeron-maps.<something>.workers.dev`). Tell Claude the address so it can be checked.
7. **Let sign-in links work on the test address.** Supabase dashboard → **Authentication → URL
   Configuration → Redirect URLs → Add URL**: `https://*-bergeron-maps.*.workers.dev/**` and
   `https://bergeron-maps.*.workers.dev/**`. Leave **Site URL** as `https://bergeronmaps.com/app/`.

### B. Move the domain's DNS to Cloudflare (visitors still reach GitHub Pages)

8. Cloudflare dashboard → **Add a domain** → `bergeronmaps.com` → Free plan. Cloudflare copies the
   current DNS records. Check that the list includes the **MX** records (`fwd1.porkbun.com`,
   `fwd2.porkbun.com`) and the **TXT** record starting `v=spf1`: they carry the company email forwarding.
   Add any that are missing by hand, copied from Porkbun's DNS page.
9. **SSL/TLS → Overview**: set the mode to **Full (strict)**.
10. Cloudflare shows two nameservers. Porkbun → **Domain Management** → bergeronmaps.com →
    **Authoritative Nameservers → Edit**, replace Porkbun's with Cloudflare's two, save. Cloudflare emails
    you when it is active (minutes to a few hours). The site keeps coming from GitHub Pages meanwhile.

### C. Switch (pick a quiet evening; about 10 minutes)

11. Cloudflare → bergeronmaps.com → **DNS → Records**: delete the four **A** records, the **AAAA**
    records for `bergeronmaps.com`, and the **CNAME** for `www` (the GitHub Pages ones). Leave MX and TXT.
12. **Workers & Pages → bergeron-maps → Settings → Domains & Routes → Add → Custom domain**:
    `bergeronmaps.com`. Then again for `www.bergeronmaps.com`.
13. **Rules → Redirect Rules → Create rule → template "Redirect from WWW to root"** → Deploy.
14. Tell Claude. It checks every page, sign-in, saving, publishing and public links on bergeronmaps.com.

Undo during steps 11 to 14: remove the custom domains from the Worker and add back the GitHub Pages
records from `docs/DOMAIN.md`.

### D. After a week with no problems

15. github.com/KeganBerg/Bergeron-Maps → **Settings → Pages** → unpublish. Claude then removes
    `.github/workflows/pages.yml`. Old `keganberg.github.io/Bergeron-Maps/` links stop redirecting at that
    point; bergeronmaps.com links are unaffected.
