# Monitoring: hearing about problems before customers call

Two parts, both free:

1. **Uptime check** (built, runs on GitHub). Every 15 minutes it checks that the
   website, the app, sign-in and the database answer. When something is still
   down after 3 tries, it opens a GitHub issue called "Live site problem (uptime
   check)", and GitHub emails the repository owner. It closes the issue with a
   note once everything answers again. Files: `.github/workflows/uptime.yml`,
   `scripts/uptime-check.mjs`.
2. **Error reports** (built, switched off until an error-tracking account
   exists). When something breaks for a person in the app, the app sends a short
   report to Sentry, which emails you and groups repeats of the same problem.

## What counts as a problem

| Where (`where` tag) | What happened |
| --- | --- |
| `crash` | A page failed to draw and the "Something went wrong" screen showed. The person sees a code (for example `7F3A9C2B`) they can send you; it matches the `code` tag in Sentry. |
| `unhandled`, `unhandled-promise` | An error no screen caught. |
| `database` | Supabase answered with a server error, or with "table/column/function doesn't exist". The second one almost always means a SQL step wasn't run before the app that needs it went live. `extra.path` says which table or function. |
| `sign-in` | The sign-in service failed, or answered 429: the sign-in email limit was hit, so people stop getting sign-in links (Supabase's built-in email allows only a few per hour; a custom SMTP sender fixes it). |
| `stale-code` | After a new version went live, the app reloaded once to pick it up and the code files were still missing: the deploy is broken. |

Not reported, because the page already explains them and they aren't bugs:
"you don't have permission", duplicates, messages our SQL raises for people,
expired sign-ins, people who are offline, browser extensions, and the first
"code file missing" after a deploy (the app reloads into the new version by
itself, except in the editor, where it offers a Reload button so unsaved changes
aren't lost).

## Privacy: what a report contains

Reports are built in `src/errors/report.ts`, without a vendor SDK, so everything
sent is written in that one file:

- the error type, message and code stack, with email addresses, sign-in tokens,
  long keys and every web address's `?query` and `#fragment` removed;
- the page as a shape only: `#/edit/:id`, `#/team`, `#/:link` (site link names
  are often the customer's name, so they are never sent);
- for database problems: status, error code, method and path (for example
  `/rest/v1/rpc/set_site_limit`), never the query or the data;
- the app version (commit), and the browser's user agent, which every web
  request carries anyway.

Never sent: names, emails, user ids, company or site names, map contents, IP
addresses (the report tells Sentry not to work it out, and the setup below also
turns IP storage off). A page sends at most 20 reports and each problem once.
Tests in `src/errors/report.test.ts` check this.

## Turning error reports on (needs Kegan's OK: it's a sign-up)

1. Create a free Sentry account with bergeronmaps@gmail.com (Developer plan:
   free, 5,000 errors a month, email alerts, one user). Choose the US or EU
   region; either works.
2. Create a project: platform **Browser JavaScript**, name `bergeron-maps-app`.
   Skip the SDK install step: the app already has its own reporter.
3. Project **Settings > Security & Privacy**: turn on **Prevent Storing of IP
   Addresses**, and leave **Data Scrubber** and **Use Default Scrubbers** on.
4. Project **Settings > Client Keys (DSN)**: copy the DSN (it looks like
   `https://abc123@o123.ingest.us.sentry.io/456`). It is public by design, like
   the Supabase anon key.
5. In GitHub: **Settings > Secrets and variables > Actions > Variables > New
   repository variable**, name `SENTRY_DSN`, value the DSN.
6. Re-run the "Deploy preview to GitHub Pages" workflow (or merge anything).
   The build adds the Sentry host to the page's security policy by itself.
7. Alerts: Sentry's default rule emails you the first time each new problem
   appears. Add "a problem happens more than 10 times in an hour" if wanted.

To turn it off, delete the `SENTRY_DSN` variable and redeploy.

## Uptime check details

- GitHub runs scheduled workflows only from the repository's **default
  branch**, and can start them a few minutes late. The default branch must be
  `main` (Settings > General > Default branch).
- To check the email reaches you: Actions > Uptime check > Run workflow, tick
  "Open a test alert issue". It opens and closes a test issue.
- Email for new issues depends on GitHub notification settings: Settings >
  Notifications > "Watching", with Email on, and the repository watched (it is
  by default for its owner).
- Optional: a second, independent checker such as UptimeRobot's free plan
  (5-minute checks, email alerts) watching `https://bergeronmaps.com/app/`
  covers the case where GitHub itself is down. Also a sign-up.

## When an alert arrives

- **Website or App down**: check https://www.githubstatus.com (Pages), then the
  latest "Deploy preview to GitHub Pages" run. A failed deploy keeps the old
  version live; a missing code file means a broken deploy: re-run it.
- **Sign-in service or Database down**: check https://status.supabase.com and
  the project dashboard. "project paused" means the free project was paused for
  inactivity: restore it from the dashboard.
- **Error report**: the `where` tag and the table above say what kind. For
  `database` errors about something missing, run the SQL step that came with
  the latest change.
