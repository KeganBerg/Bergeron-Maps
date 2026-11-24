# Recovery runbook

What to do when data is lost, from one bad edit to the whole Supabase project being gone. Written after the
restore drill of 2026-11-19 (see the end of this page).

## First: which situation is it?

| What happened | Use | Data lost |
| --- | --- | --- |
| A map was edited badly | The map's **Versions** in the editor | Nothing |
| A map was deleted in the last 30 days | Site's maps → **Recently deleted** → Restore | Nothing |
| A whole company was deleted | **All accounts → Restore from backup** (below, A) | Changes since the backup file was made |
| A map was **deleted forever**, or a site was deleted, but the company still exists | **All accounts → Restore from backup** (below, B) | Changes to that map since the backup |
| The Supabase project is broken, paused for good, or deleted | See C | Changes since the last backup |

Before you start any restore, download a fresh **Download backup of all accounts** if the app still works. It
costs nothing and means a restore can never leave you worse off than you are now.

## What backups exist

1. **Backup files from the app.** On All accounts, **Download backup** (one company) or **Download backup of all
   accounts** (everything). These are `.bmbackup.json` files on your own computer. Nothing makes them
   automatically: someone has to click the button. The delete-company dialog also offers one before it deletes.
2. **Supabase's own backups.** These exist only on a paid plan. The **Free plan has no backups at all**, and a
   Free project that sees little use for 7 days is paused (it can be resumed for 90 days after that).
   - **Pro** ($25 a month): one backup a day, the last 7 days, restored from the dashboard.
   - **Point-in-time recovery** (Pro add-on, about $100 a month and up): restore to any second in the last 7+ days.
   - If the project itself is deleted, Supabase deletes its backups too.

   Check which plan the project is on: Supabase dashboard → the organization → **Billing**.
3. **Nightly database backup (free).** `.github/workflows/db-backup.yml` copies the whole database every night
   at 07:17 UTC: the app's tables (structure and data), the sign-in accounts and the map pictures. The copy is encrypted with a
   passphrase and kept for 90 days under **Actions → Nightly database backup → a run → Artifacts**. It holds
   more than a backup file from the app (the audit log, pending manager requests and sign-ins too), and nobody
   has to remember to click anything. Restore it with C4.

   **Setup (once, about 5 minutes):**
   1. Supabase dashboard → the project → **Connect** (top of the page) → **Session pooler** → copy the URI. It
      looks like `postgresql://postgres.ysebxeokxpnmckwdtimj:[YOUR-PASSWORD]@aws-0-….pooler.supabase.com:5432/postgres`.
      Put the database password in place of `[YOUR-PASSWORD]`. (Forgot it? Project Settings → Database → **Reset
      database password**; the app doesn't use it, so resetting is safe.) Use the Session pooler, not the
      Direct connection: GitHub can't reach the direct one.
   2. Make up a long passphrase (for example five random words) and save it in your password manager. Without
      it the backups can't be opened, by anyone, including you.
   3. github.com/KeganBerg/Bergeron-Maps → **Settings → Secrets and variables → Actions → New repository
      secret**: `SUPABASE_DB_URL` = the URI from step 1, and `BACKUP_PASSPHRASE` = the passphrase.
   4. **Actions → Nightly database backup → Run workflow**, and check it goes green.

   GitHub emails the repository owner if a night's backup fails.

### The routine

- The nightly database backup runs on its own (3 above). Glance at **Actions** once a week to see it's green.
- Until real customers are on the app: download **all accounts** every Friday.
- Once a paying customer is on it: move the project to **Pro**, and still download all accounts weekly.
- Keep at least the last 4 weekly files, in two places (for example your computer and a cloud drive you own).
  The file holds customers' maps and email addresses, so don't put it anywhere public.
- Always download all accounts before running any new SQL in Supabase.

## A. A company was deleted

1. Sign in as an admin, open **All accounts**.
2. **Restore from backup…**, choose the newest backup file that has the company.
3. Tick the company and press **Restore**. Companies that still exist can't be ticked: a restore never overwrites
   anything.
4. Read the result. It lists how many sites, people, maps and versions came back, and any **site link that
   changed** (only if another site took that link in the meantime). Send the customer the new link if one changed.
5. Check it (see "After any restore").

What comes back: the company, its site limit, every site with the same link, address and join code (so printed QR
signs keep working), everyone's access and role, every map in its slot (including Recently deleted), what
employees see, unpublished changes, and the newest 200 saved versions of each map.

People who still have a sign-in get access back straight away. Anyone else gets it the next time they sign in
with the same email.

## B. A map deleted forever, or a site deleted (company still exists)

1. **The map is still in Recently deleted** → restore it there (30 days). Nothing else needed.
2. Otherwise: **All accounts → Restore from backup…**, choose the newest backup file (or nightly backup, see C4)
   made before the map or site was lost.
3. The company shows as **Still in All accounts. Brings back only what it's missing: …** with what it lost since
   the backup, and is ticked. Press **Restore**.
4. Only what's missing comes back, with the same ids: a deleted site with its link, address and join code, the
   people who lost access with it, and each map with its slot, what employees saw and its saved versions. Map links
   and QR signs keep working. Nothing the company has now is changed, so edits made after the backup are kept.
5. A map that no longer fits in its site's 5 slots goes to Recently deleted; a map that was in Recently deleted
   in the backup goes back there with at least a day left.

Needs the step 15 SQL (`supabase/migrations/20261124000000_restore_missing.sql`), run once.

If no backup file or nightly backup has it but the project is on Pro and it happened within 7 days, a Supabase
daily backup brings it back, but that rolls **the whole project** back to that day (C1).

## C. The whole Supabase project is lost

### C1. Pro plan and the project still exists

Supabase dashboard → **Database → Backups** → pick the newest backup from before the problem → **Restore**. The
app is offline while it restores. Everything after that backup is lost, so afterwards restore anything newer from
backup files if you have them (A).

### C2. The project is paused

Free projects are paused after a quiet week. Supabase dashboard → the project → **Resume project**. Nothing is
lost. After 90 days paused it can't be resumed; the dashboard then offers its last backup as a download, which
Claude can restore into a new project.

### C3. Rebuild in a new project (the project is gone, or none of the above worked)

This is what the 2026-11-19 drill rehearsed. Budget about an hour.

1. **New project.** supabase.com → New project, in the region closest to most customers. Save the database password somewhere safe.
2. **Database.** SQL Editor → run each file in `supabase/migrations/` in name order, one at a time (they are the
   same as `setup.sql` and the `stepN` files in the project files, in order). Each should say "Success".
   Run any newer `stepN` file that hasn't been added to `supabase/migrations/` yet.
3. **Admins.** In the SQL Editor:
   `insert into public.platform_admins (email) values ('keganbergeron@gmail.com'), ('tiptopaxle@gmail.com');`
4. **Trash clean-up** (Recently deleted empties after 30 days). Database → Extensions → enable `pg_cron`, then:
   `select cron.schedule('purge-expired-trash', '0 4 * * *', 'select public.purge_expired_trash()');`
5. **Sign-in settings** (Authentication):
   - URL Configuration: Site URL `https://bergeronmaps.com/app/`, Redirect URLs `https://bergeronmaps.com/app/**`
     (see `docs/DOMAIN.md`).
   - Sign In / Providers → Email: keep **Confirm email** on.
   - Emails: SMTP settings and email wording, if they had been changed in the old project.
   - Hooks (optional, as before): Custom Access Token → `public.block_password_sign_in`.
6. **Point the app at the new project.** Project Settings → API: copy the Project URL and the `anon` public key.
   Put them in `.github/workflows/cloudflare.yml` and `.github/workflows/pages.yml` (`VITE_SUPABASE_URL`,
   `VITE_SUPABASE_ANON_KEY`), and in `.github/workflows/uptime.yml`, and merge. The site
   redeploys in a few minutes. (Claude can do this step.)
7. **Restore the data.** Open bergeronmaps.com/app, sign in as an admin (this creates your sign-in in the new
   project), All accounts → **Restore from backup…** → the newest all-accounts file → everything ticked → Restore.
   Map pictures come back too: the file holds them, and they are uploaded to the new project's file storage.
8. **Tell customers.** Everyone signs in again with the same email address and gets their old access back
   automatically. Site links, map links and printed QR signs keep working.
9. Check it (below).

### C4. Restore from a nightly database backup

Brings back everything as of that night, sign-ins included, so nobody has to be invited again. Claude can do
these steps with you; they need a computer with PostgreSQL's command-line tools (version 17).

1. **Get the file.** github.com/KeganBerg/Bergeron-Maps → **Actions → Nightly database backup** → the newest
   green run from before the problem → **Artifacts** → download it, and unzip the download.
2. **Open it** (asks for the passphrase):
   `gpg -d bergeron-maps-db-<time>.tar.gpg | tar -xf -` → a `backup/` folder with `public.dump`,
   `auth-data.dump` and a README.
3. **Get an empty database with the app's structure.** Into the same project after a bad change: first take a
   fresh backup of the current state (Run workflow), then empty it the way Claude suggests for that case. Into a
   new project: do C3 steps 1 to 6.
4. **Load the data**, with the new project's Session pooler URI in `DB`:
   ```
   export PGOPTIONS="-c session_replication_role=replica"
   pg_restore --data-only --no-owner --no-privileges -d "$DB" backup/auth-data.dump
   pg_restore --data-only --no-owner --no-privileges -d "$DB" backup/public.dump
   ```
   The `PGOPTIONS` line lets the rows load in any order. Skip C3 step 7 (the backup file restore): this
   already brought everything back except the map pictures.
5. **Map pictures.** They are files, not table rows: `backup/map-images/<company id>/<file>`. Into the same
   project they are usually still there. Into a new project, upload them to a public bucket named `map-images`
   at the same paths (step 16 SQL creates it), then have Claude point the maps at the new project's address
   (the maps still name the old one). Claude can do both.
6. Check it (below).

## After any restore

- All accounts shows each restored company with the right number of sites, maps and people.
- Open one site link and one public map link from before the problem: both load.
- Scan or open one QR "you are here" link: it opens on the right floor.
- Sign in as (or ask) a manager: they see their own sites only, and can edit and publish.
- A map with a background image or imported picture shows it.
- The result said "0 saved versions couldn't be restored". If not, run the same restore again: versions already
  back are skipped, so it only adds what's missing.

## What a backup file doesn't hold

- **Sign-ins.** Passwords and sessions live in Supabase, not the file; people simply sign in again by email.
- **The activity log** and **pending manager requests** (people ask again).
- **Map dates.** A restored map shows the restore date as its created and edited date; saved versions keep
  their own dates.
- **Saved versions beyond the newest 200** of a map.
- **Project settings** (sign-in URLs, email setup, hooks, scheduled jobs): redo them as in C3.
- **Maps saved only in someone's browser** (not signed in). Those never reach the database; use Download map file.

## Restore drill

`supabase/tests/restore-drill.test.ts` rehearses C3 on two throwaway databases, never the live one: it builds an
old project with three companies (sites, managers, employees, invitations, a 1,200-space garage with a photographed
sketch behind it, published and unpublished maps, Recently deleted, saved versions), makes a backup of all
accounts with the app's own backup code, restores it into a brand-new project built from `supabase/migrations`,
and checks every site, link, join code, access, map, published map and version matches. It runs in CI with the
other database tests (`npm run test:db`).

2026-11-19 result: everything matched. The 11.6 MB backup file was made in about 0.2 s and restored in about
0.3 s on a local database. One fix came out of it: the backup now reads saved versions in a fixed order, so
versions saved at the same moment can't be skipped or read twice between pages.
