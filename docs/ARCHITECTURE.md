# Architecture

## Stack (and why)

| Piece | Choice | Reason |
|---|---|---|
| App | React 18 + TypeScript, built with Vite | Mainstream, fast to build, easy to hire for |
| Map canvas | Konva via react-konva (MIT) | Handles thousands of shapes smoothly; built-in resize/rotate handles; works with touch |
| Editor state | Zustand + Immer | Small, predictable; whole-document snapshots make undo/redo simple and reliable |
| Browser-only storage | Browser IndexedDB | Used when there is no account ("Try it without an account") and in most tests |
| Backend | Supabase: Postgres, Auth, row-level security | Authorization enforced in the database, not the UI; free plan today |
| Hosting | Cloudflare Workers (static files, plus `/api/*` routes in `worker/`: contact form, access email, Stripe Checkout and its webhook, which open and pause paid accounts, and a daily cron for grace-period reminders, all in `docs/STRIPE.md`) | See `docs/HOSTING.md` |
| Tests | Vitest (unit), Playwright (browser, desktop + phone), Vitest against real Postgres (database) | |
| Code style | TypeScript strict mode, ESLint, Prettier | Run in CI; see "Code size and structure" below |

## Layout

```
src/
  model/      Pure map logic, no UI: types, row generation and numbering, snapping,
              alignment, copy/paste, floors, layers, duplicates, search, migrations,
              walking directions (route.ts + route/), side view
  assets/     Built-in symbol library (original artwork drawn in code)
  storage/    MapRepository interface + IndexedDB implementation, map files
  render/     Konva shapes shared by the editor and the viewer
  editor/     Desktop editor: store (state + undo), canvas, panels, autosave, keyboard
  viewer/     Phone-first, read-only view with search and directions
  home/       Maps list, new map, recently deleted (browser-only and online)
  cloud/      Online mode: Supabase client, SupabaseRepository, sign-in, team, admin pages
              (All accounts: AdminPage holds the companies list, AdminCompanyPane one company, AdminTools setup and backups;
              its search and pane choice are in model/adminAccounts.ts)
  ui/         Shared UI pieces: dialogs, fields, icons, brand, motion (useMotion: admin pages ease in/out)
  errors/     Friendly error messages and optional error reports
supabase/
  migrations/ The database schema, in order (source of truth)
  tests/      Database tests against a real Postgres
e2e/          Playwright tests (e2e/online/: online mode against a mock Supabase)
site/         Marketing site, and Bergeron Maps University (site/university/: training videos,
              common questions, help) written by scripts/site-university.mjs
docs/         Architecture, runbooks, rules
```

## Data model

One `MapDocument` per facility, containing ordered `floors`. Each floor has its own ordered `layers` (bottom to top), `objects`, row settings (`rows`) and an optional `background` image tied to a layer.

Objects are `space` (parking space: identifier, row membership), `asset` (library symbol or stretchable area such as a wall or drive lane, with optional floor connections), or `text`. All positions are centers in world units; rotation is in degrees.

A generated row is a set of ordinary space objects plus a `RowSpec` (count, numbering, size, gap, direction). Editing row settings rebuilds the row from its first space, reusing space ids, so a row can be moved/rotated freely and still be edited later.

`schemaVersion` plus `model/migrate.ts` keeps older saved maps opening after the format changes.

Every space has a stable id that survives renumbering, so vehicle-location records (Part 17) can reference spaces later without changing this model.

## Key behaviours

- **Undo/redo:** each committed change pushes the previous document onto a 200-step history. Drags and transforms are one step each (`beginGesture` / `endGesture`).
- **Autosave:** 0.8 s after the last change. Failed saves retry after 5, 10, 20, then every 30 s, and at once when the browser comes back online. Recovery points are written every 10 minutes and on manual save.
- **Unsaved copy in this browser** (`src/storage/unsavedBackup.ts`): written when a save fails, when a save is still running after 1.5 s (so a tab crash mid-save loses nothing), on every change while saves are failing, and when the page closes. Small maps go to `localStorage`; maps too big for it (photo backgrounds) go to IndexedDB. The copy records the revision it was based on. On open it is offered back unless it matches what's stored; if the map was saved since, recovering first puts the stored version in Version history. "Not now" also moves the copy into Version history.
- **Bad connections:** a save that hasn't answered in 60 s counts as failed so it can't block later saves. Each editor remembers what it sent since its last confirmed save; a "conflict" whose stored copy is one of those is its own save whose answer was lost, so it is adopted, not shown as someone else's change.
- **Concurrent edits:** each save sends the revision it was based on. If the stored revision moved on, the save is rejected, autosave pauses, and the user chooses which version to keep; the other one is saved to version history. An editor with nothing unsaved checks the stored revision every 30 s and when its window gets focus, and loads a newer save made elsewhere, so a second manager doesn't carry on from an old copy. Publishing warns if what went live includes someone else's save made moments before. Database races (two saves from one revision, a save racing a delete, two maps for the last slot, two publishes for the last live place) are tested on real concurrent connections in `supabase/tests/concurrency.test.ts`.
- **Selection:** clicking a space selects its whole row (like a group in drawing apps); double-click enters the row to select one space. Locked and hidden layers are never selectable.
- **New-object layer:** "Automatic" by default (spaces → Parking spaces, columns → Structure, booths → Landmarks, …). Choosing a layer makes it the target.

## Online mode

- `src/cloud/client.ts` turns on online mode when the build has `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (set in `.github/workflows/cloudflare.yml`; the anon key is public by design). Without them, or after "Try it without an account", the app runs in browser-only mode with `IndexedDbRepository`.
- Sign-in is an emailed one-time link (PKCE). There is no role picker: access comes only from `memberships`, which admins and managers grant by email (`add_member`; invitations become memberships when the person first signs in).
- Access model: a Bergeron Maps admin (`platform_admins`, set in the SQL editor) creates each customer company and its sites. Each site has a **site link** (`#/site/<id>`) for its managers. The link narrows the view to that site, but grants nothing by itself. Employees join one site with its 6-character code and only see published maps.
- Map pictures (background images, imported pictures) live in Supabase Storage: public `map-images` bucket, `<company id>/<sha256>.<type>`, uploads limited by policy to the company's owners and managers. Maps keep only the address; map files and backup files carry the pictures inside. Pictures still inside older published copies and saved versions move out on their own, one copy per request, the first time an admin opens All accounts (`runPictureMoveOnce`). See `src/cloud/mapImages.ts`.
- `SupabaseRepository` implements `MapRepository` against the tables in `supabase/migrations`. Saves are `update … where revision = base`: zero rows means someone else saved first (`ConflictError`). Row-level security enforces company and site separation on every request, so removed people lose access immediately.
- Public links: a published map marked public opens with no sign-in at `…/app/#/view/<site-link>` (`get_public_site`, `src/cloud/PublicSitePage.tsx`).
- Page frame: `AppHeader` (`src/home/HomePage.tsx`) draws the top bar across the window and the section links (Maps, Sites & people, All accounts). From 1024px wide they are a side bar and the page scrolls on its own beside it, like the map editor; narrower, they are tabs under the top bar. Pages with no sections (sign-in, public site, My Locations) keep one centred column. All accounts is a list and detail page: the companies list on the left, the chosen company or admin tool on the right, chosen by the link (`#/admin?company=<id>`, `#/admin?tool=backups`); under 900px it shows one pane at a time.
- Not yet built: live push updates (viewers refresh to get a newer publish), and a scheduled trash purge (`purge_expired_trash` exists; it needs a Supabase cron job).

## Database changes

- Every schema change is a new, dated file in `supabase/migrations/`. Never edit a migration that has already
  run on the live database; add a new one.
- `npm run test:db` builds a fresh database from all migrations in order (with a small shim for the Supabase
  parts, `supabase/tests/supabase-shim.sql`) and tests permissions, concurrency and backups against it. CI runs it.
- Migrations are not applied automatically. Each one is run on the live Supabase project by hand, in the SQL
  Editor, after review and before the app change that needs it is merged.

## Code size and structure

These keep the code readable for the next person. `src/codeSize.test.ts` and ESLint enforce the first two; files
  that were already too big are listed in that test and may only shrink.

- **Files stay under 600 lines** (tests and the symbol catalog data excepted). Big features are a
  small entry file plus a folder or set of files by job, e.g. `model/route.ts` + `model/route/`, or
  `editor/store.ts` + `objectActions.ts` / `structureActions.ts`. When a file gets close, split
  it by job, not by line count: a component per panel or sheet, a hook per concern, a module per step.
- **No `any`, no `@ts-ignore`.** Model the type instead.
- **Logic lives in `src/model/`**, with unit tests, not inside React components. Components show state and
  call model functions.
- **Facts about a symbol live on the symbol** (`src/assets/catalog/*`), not in lists elsewhere. For example,
  how walking directions treat a symbol is its `walk` property (and `entersBuilding` for building doors).
- **Docs change in the same pull request as the code** they describe.
