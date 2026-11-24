#!/usr/bin/env bash
# Smoke check of a deployed copy of the site: pages answer, the app loads, unknown pages are
# real 404s, and the security and caching headers are on. Usage: scripts/check-deploy.sh <base url>
set -uo pipefail
base="${1%/}"
fail=0
check() { # name, ok?
  if [ "$2" = ok ]; then echo "ok    $1"; else echo "FAIL  $1"; fail=1; fi
}
status() { curl -s -o /dev/null -w '%{http_code}' --retry 3 --retry-all-errors "$base$1"; }

for path in / /industries/valet/ /accessibility/ /app/; do
  [ "$(status "$path")" = 200 ] && check "$path answers 200" ok || check "$path answers 200" no
done
[ "$(status /no-such-page)" = 404 ] && check "unknown page is a 404" ok || check "unknown page is a 404" no
[ "$(curl -s -o /dev/null -w '%{redirect_url}' "$base/app")" = "$base/app/" ] && check "/app redirects to /app/" ok || check "/app redirects to /app/" no

headers=$(curl -s -D - -o /dev/null "$base/" | tr -d '\r')
for h in 'strict-transport-security: max-age=31536000' "content-security-policy: frame-ancestors 'none'" 'x-content-type-options: nosniff'; do
  grep -qi "^$h" <<<"$headers" && check "header $h" ok || check "header $h" no
done

app=$(curl -s "$base/app/")
asset=$(grep -o 'assets/index-[^"]*\.js' <<<"$app" | head -n1)
if [ -n "$asset" ]; then
  curl -s -D - -o /dev/null "$base/app/$asset" | tr -d '\r' | grep -qi '^cache-control: public, max-age=31536000, immutable' \
    && check "app files cached for a year" ok || check "app files cached for a year" no
else
  check "app page links its script" no
fi
[ "$(status /_headers)" = 404 ] && check "_headers file is not served" ok || check "_headers file is not served" no

exit $fail
