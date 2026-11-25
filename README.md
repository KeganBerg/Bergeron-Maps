# Bergeron Maps

A web app for mapping parking facilities (valet lots, garages, hotel and event parking). Managers draw maps
with rows of numbered spaces, landmarks and multiple floors; employees open the map on a phone, search for a
space like "B16" and get walking directions to it.

Live: the marketing site is <https://bergeronmaps.com> and the app is <https://bergeronmaps.com/app/>.

## What's in this repo

| Folder | What it is |
|---|---|
| `src/` | The app: React 18 + TypeScript, built with Vite. Map drawing uses Konva (react-konva). |
| `src/model/` | Pure map logic with no UI: data types, rows and numbering, snapping, floors, search, walking directions. Most bugs and features start here. |
| `src/editor/` | The desktop map editor: state and undo (`store.ts`), canvas, panels, autosave, keyboard. |
| `src/viewer/` | The phone-first, read-only map employees and the public see. |
| `src/cloud/` | Online mode: Supabase sign-in, saving, accounts and admin pages. |
| `src/storage/` | The `MapRepository` interface and the browser-only (IndexedDB) version of it. |
| `src/assets/` | The built-in symbol library (all original artwork, drawn in code). |
| `src/render/` | Konva shapes shared by the editor and the viewer. |
| `supabase/migrations/` | The database: tables, row-level security and functions, in order. The source of truth for the schema. |
| `supabase/tests/` | Database tests (permissions, concurrency, backups) run against a real Postgres. |
| `e2e/` | Playwright browser tests (Chrome, Safari, Firefox; desktop and phone). `e2e/online/` runs the online app against a mock Supabase. |
| `site/` | The marketing site (plain HTML, Tailwind). Built by `npm run build:site`. Includes Bergeron Maps University (`site/university/`), the training hub with the tutorial videos, common questions and how to get help. |
| `scripts/` | Build, deploy, screenshot, load-test and uptime scripts, and the tutorial videos (`scripts/tutorials/`). |
| `docs/` | Architecture, runbooks and rules (see below). |

## Run it

Needs Node 22.

```bash
npm install
npm run dev        # http://localhost:5173
```

Without Supabase settings the app runs in **browser-only mode**: maps are saved in the browser and there are
no accounts. To run online mode locally, put `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in a `.env.local`
file (the values are in `.github/workflows/cloudflare.yml`; the anon key is public by design).

## Check it

```bash
npm run typecheck
npm run lint       # ESLint
npm run format     # Prettier check (npm run format:fix to fix)
npm test           # unit tests (Vitest)
npm run test:e2e   # browser tests (Playwright); run `npx playwright install` once first
npm run test:db    # database tests; needs DATABASE_URL pointing at a Postgres 16 you can create databases on
```

CI (`.github/workflows/ci.yml`) runs all of these on every push and pull request.

## Deploy

Merging to `main` deploys the site and the app to Cloudflare (`.github/workflows/cloudflare.yml`); every pull
request gets its own preview address. Details in [docs/HOSTING.md](docs/HOSTING.md).

Database changes are not deployed automatically: a new file in `supabase/migrations/` must also be run on
the live Supabase project. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#database-changes).

## Docs

- [Contributor rules](CLAUDE.md): typography, look, naming, site claims, code size. Read these first.
- [Architecture](docs/ARCHITECTURE.md): data model, saving, online mode, access model
- [Requirements matrix](docs/REQUIREMENTS.md): every product requirement, where it lives and how it's tested
- [Hosting](docs/HOSTING.md), [domain](docs/DOMAIN.md), [monitoring](docs/MONITORING.md), [recovery runbook](docs/RECOVERY.md), [emails](docs/EMAIL.md)
- [Typography](docs/TYPOGRAPHY.md), [asset style](docs/ASSET_STYLE.md), [asset licenses](docs/ASSET_LICENSES.md), [accessibility](docs/ACCESSIBILITY.md)
- [Site claims checklist](docs/SITE_CLAIMS.md), [load test](docs/LOAD_TEST.md)

## Using the editor

- **Rows of spaces:** "Draw a row of spaces", then drag across the map; or "Add row by number". Pick the count, prefix and starting number. Click a row to select it and change its settings later. Double-click a space to edit just that one.
- **Landmarks:** search or browse the library on the left; click to add, or drag onto the map.
- **Floors:** tabs along the bottom. Double-click to rename, right-click (or ⋯) to duplicate, reorder or delete.
- **Layers:** Layers tab. Lock layers to protect them, hide them to declutter.
- **Shortcuts:** the usual ones: Ctrl/⌘ + C, V, X, D, Z, Y (or Shift+Z), A, S; Delete; Escape; arrow keys nudge. Hold Space and drag to pan; Ctrl/⌘ + scroll to zoom.
- **Preview** shows exactly what employees will see on a phone.
