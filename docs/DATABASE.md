# Is the live database the same as the code?

The live Supabase database was built by pasting `setup.sql` and the `stepN` files into the SQL Editor by hand,
so nothing records exactly what ran. `supabase/schema-fingerprint.sql` answers that question in one paste.

## Check it

1. Supabase dashboard → the project → **SQL Editor** → New query.
2. Paste all of `supabase/schema-fingerprint.sql` and press **Run**. It only reads; it changes nothing.
3. Copy the one result cell and give it to Claude (or compare it yourself with
   `supabase/schema-fingerprint.expected.txt`).

The result starts with:

- `scheduled jobs: …` — the pg_cron jobs. `purge-expired-trash; 0 4 * * *` should be there (it empties Recently
  deleted after 30 days; see RECOVERY.md C3 step 4).
- `N objects, fingerprint xxxxxxxxxxxx` — if the fingerprint equals the one in the expected file, the live
  database matches `supabase/migrations` exactly: every table, column, function, policy, index, trigger and
  who may call each function.

Then one line per object. Any line that differs from the expected file is drift: something that ran differently
on live, or never ran. Fix it with a new migration (and a new `stepN` file to paste), never by editing live by hand.

## Keeping it current

`supabase/tests/schema-fingerprint.test.ts` (run by `npm run test:db` in CI) fails when a migration changes the
schema and the expected file wasn't refreshed. Refresh it with:

```
UPDATE_FINGERPRINT=1 npm run test:db -- schema-fingerprint
```

Compare with live after each new `stepN` file has been run.
