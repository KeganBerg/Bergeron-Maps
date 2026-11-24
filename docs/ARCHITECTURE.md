# Architecture

## Stack (and why)

| Piece | Choice | Reason |
|---|---|---|
| App | React 18 + TypeScript, built with Vite | Mainstream, fast to build, easy to hire for |
| Map canvas | Konva via react-konva (MIT) | Handles thousands of shapes smoothly; built-in resize/rotate handles; works with touch |
| Editor state | Zustand + Immer | Small, predictable; whole-document snapshots make undo/redo simple and reliable |
| Phase 1 storage | Browser IndexedDB | Lets the editor, autosave, versions, trash and conflict handling be built and tested before a server exists |
| Phase 2 backend (proposed) | Supabase: Postgres, Auth, Storage, row-level security | Authorization enforced in the database, not the UI; fits the ~$50/month backend budget |
| Tests | Vitest (unit), Playwright (browser, desktop + phone) | |

## Layout

```
src/
  model/      Pure map logic, no UI: types, row generation and numbering, snapping,
              alignment, copy/paste, floors, layers, duplicates, search, migrations
  assets/     Built-in symbol library (original artwork)
  storage/    MapRepository interface + IndexedDB implementation
  render/     Konva shapes shared by the editor and the viewer
  editor/     Desktop editor: store (state + undo), canvas, panels, autosave, keyboard
  viewer/     Phone-first, read-only employee view with search
  home/       Maps list, new map, recently deleted
e2e/          Playwright tests
docs/         Requirements matrix, architecture, asset licenses
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

## Phase 2 plan (server)

1. Supabase project: tables `companies`, `facilities`, `maps` (draft JSON + revision), `map_versions`, `published_maps`, `memberships(user, company/facility, role)`, `audit_log`.
2. Row-level security on every table: users only see rows for companies/facilities they belong to; only managers can write, publish, or manage members. Public maps are readable through a separate published-snapshot table with an explicit `is_public` flag, never by guessing ids.
3. `SupabaseRepository` implements the existing `MapRepository`; the editor code does not change.
4. Done 2026-11-24: background images and imported pictures live in Supabase Storage (public `map-images` bucket, `<company id>/<sha256>.<type>`, uploads limited to the company's owners and managers by policy); maps keep only the address. See `src/cloud/mapImages.ts`.
5. Publish = copy the current draft into `published_maps`; viewers always load the latest published snapshot.
6. Daily database backups (Supabase), plus version history and trash for user-level recovery.

## Online mode (Phase 2)

- `src/cloud/client.ts` turns on online mode when the build has `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (set in `.github/workflows/pages.yml`; the anon key is public by design). Without them, or after "Try it without an account", the app runs in browser-only mode with `IndexedDbRepository`.
- Sign-in is an emailed one-time link (PKCE). There is no role picker: access comes only from `memberships`, which admins and managers grant by email (`add_member`; invitations become memberships when the person first signs in).
- Access model: a Bergeron Maps admin (`platform_admins`, set in the SQL editor) creates each customer company and its sites. Each site has a **site link** (`#/site/<id>`) for its managers. The link narrows the view to that site, but grants nothing by itself. Employees join one site with its 6-character code and only see published maps.
- `SupabaseRepository` implements `MapRepository` against the tables in `supabase/migrations`. Saves are `update … where revision = base`: zero rows means someone else saved first (`ConflictError`). Row-level security enforces company and site separation on every request, so removed people lose access immediately.
- Not yet built: public (no sign-in) links, live push updates, server-side pruning of automatic versions, and scheduled trash purge (`purge_expired_trash` exists; it needs a Supabase cron job).
