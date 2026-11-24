#!/usr/bin/env bash
# Nightly database backup (docs/RECOVERY.md, "Nightly database backup").
# Dumps the app's tables (schema `public`, structure and data) and the sign-in accounts
# (schema `auth`, data only), then encrypts both with a passphrase so the file is safe to keep
# as a GitHub Actions artifact. Usage:
#   DATABASE_URL=... BACKUP_PASSPHRASE=... scripts/db-backup.sh <output dir>
# Writes <output dir>/bergeron-maps-db-<UTC time>.tar.gpg and prints its name.
# With PICTURES_URL set (the public address of the map-images bucket), the map pictures in file
# storage go in too, under backup/map-images/<company id>/<file>.
set -euo pipefail
out="${1:?output directory}"
: "${DATABASE_URL:?DATABASE_URL is not set}"
: "${BACKUP_PASSPHRASE:?BACKUP_PASSPHRASE is not set}"
PG_DUMP="${PG_DUMP:-pg_dump}"
PSQL="${PSQL:-psql}"

stamp=$(date -u +%Y-%m-%dT%H%MZ)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
mkdir -p "$work/backup" "$out"

"$PG_DUMP" "$DATABASE_URL" --format=custom --no-owner --no-privileges --schema=public \
  --file="$work/backup/public.dump"
"$PG_DUMP" "$DATABASE_URL" --format=custom --no-owner --no-privileges --schema=auth --data-only \
  --file="$work/backup/auth-data.dump"

# Map pictures live in Supabase Storage, not in the tables, so they are copied file by file.
pictures=0
if [ -n "${PICTURES_URL:-}" ]; then
  names=$("$PSQL" "$DATABASE_URL" -Atc "select name from storage.objects where bucket_id = 'map-images' order by name" 2>/dev/null || true)
  while IFS= read -r name; do
    [ -n "$name" ] || continue
    # Names are <uuid>/<sha256>.<ext>; anything else is skipped rather than trusted as a path.
    [[ "$name" =~ ^[0-9a-f-]{36}/[0-9a-f]{64}\.(png|jpg|webp|gif)$ ]] || continue
    mkdir -p "$work/backup/map-images/${name%/*}"
    curl -fsS --retry 3 -o "$work/backup/map-images/$name" "${PICTURES_URL%/}/$name"
    pictures=$((pictures + 1))
  done <<< "$names"
fi

# A short note inside the file so whoever opens it knows what it is and how to restore it.
cat > "$work/backup/README.txt" <<NOTE
Bergeron Maps database backup, taken $stamp.
public.dump    = the app's tables, structure and data (pg_restore format)
auth-data.dump = sign-in accounts, data only
map-images/    = map pictures from file storage ($pictures files), by company
How to restore: docs/RECOVERY.md in the repository, section "Nightly database backup".
NOTE

# The app's tables must hold something, or the dump is not worth keeping.
size=$(stat -c %s "$work/backup/public.dump")
if [ "$size" -lt 2000 ]; then
  echo "public.dump is only $size bytes; refusing to keep an empty backup" >&2
  exit 1
fi

file="bergeron-maps-db-$stamp.tar.gpg"
tar -C "$work" -cf - backup \
  | gpg --batch --yes --symmetric --cipher-algo AES256 --passphrase-fd 3 \
      --output "$out/$file" 3<<<"$BACKUP_PASSPHRASE"
echo "$file"
