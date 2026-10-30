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
- **Autosave:** 0.8 s after the last change. Failed saves retry every 5 s and a copy is kept in `localStorage`, offered back on next open. Recovery points are written every 10 minutes and on manual save.
- **Concurrent edits:** each save sends the revision it was based on. If the stored revision moved on, the save is rejected, autosave pauses, and the user chooses which version to keep; the other one is saved to version history. The Phase 2 server will apply the same check in a single SQL `UPDATE … WHERE revision = $base`.
- **Selection:** clicking a space selects its whole row (like a group in drawing apps); double-click enters the row to select one space. Locked and hidden layers are never selectable.
- **New-object layer:** "Automatic" by default (spaces → Parking spaces, columns → Structure, booths → Landmarks, …). Choosing a layer makes it the target.

## Phase 2 plan (server)

1. Supabase project: tables `companies`, `facilities`, `maps` (draft JSON + revision), `map_versions`, `published_maps`, `memberships(user, company/facility, role)`, `audit_log`.
2. Row-level security on every table: users only see rows for companies/facilities they belong to; only managers can write, publish, or manage members. Public maps are readable through a separate published-snapshot table with an explicit `is_public` flag, never by guessing ids.
3. `SupabaseRepository` implements the existing `MapRepository`; the editor code does not change.
4. Background images move to Supabase Storage with signed URLs scoped by the same policies.
5. Publish = copy the current draft into `published_maps`; viewers always load the latest published snapshot.
6. Daily database backups (Supabase), plus version history and trash for user-level recovery.
