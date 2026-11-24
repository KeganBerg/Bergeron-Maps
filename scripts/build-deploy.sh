#!/usr/bin/env bash
# Builds what goes live into _site/: the marketing site at the root and the app under /app/.
# Used by both deploy workflows (Cloudflare and, until it is retired, GitHub Pages), so the two
# can never drift apart. The app reads VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_SENTRY_DSN
# and VITE_RELEASE from the environment.
set -euo pipefail
cd "$(dirname "$0")/.."

# Regenerate the marketing site's drawings and product demo from the current app code,
# so counts and labels on the site never fall behind the app.
npm run build:site

# Relative asset paths, so the app works under /app/ on any host.
npx vite build --base=./

rm -rf _site
mkdir -p _site/app
cp -r site/. _site/
# Build inputs stay in the repo, not on the public site.
rm -rf _site/src _site/build-drawings.py
cp -r dist/. _site/app/

if [ "${1:-}" = "--cloudflare" ]; then
  # Response headers (security and caching). Cloudflare reads this file and does not serve it.
  cp deploy/cloudflare/_headers _site/_headers
fi
