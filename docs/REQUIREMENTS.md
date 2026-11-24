# Requirements traceability matrix

Every requirement from the product specification (the "Master Development Prompt", Parts 1–25) is tracked here with where it is implemented, how it is tested, and its honest status.

**Statuses:** Not started · In progress · Implemented (works, no automated test yet) · Tested (automated test covers it) · Blocked

**Test locations:** `unit:` = Vitest file under `src/`, `e2e:` = Playwright test under `e2e/`, `manual:` = checked by hand only.

Last updated: 2026-11-24. Rows marked Tested are covered by automated tests that run in CI on every change.

## Summary

| Phase | Scope | State |
|---|---|---|
| 1 | Core mapping platform | Implemented and tested (see notes for partial items) |
| 2 | Accounts, permissions, publishing, mobile | Implemented and tested: emailed sign-in, companies and sites, roles, join codes, online saving with conflict checks, publishing, public links, admin pages, backups |
| 3 | Refinement and expansion | Not started, except small items noted below |

**Storage:** signed-in users save to Supabase (`src/cloud/supabaseRepository.ts`). "Try it without an account" keeps maps in the browser (IndexedDB), which is not a backup and is not shared between devices. Both sit behind the same `MapRepository` interface.

## Part 3: Map creation and editing

| ID | Requirement | Implementation | Test | Status |
|---|---|---|---|---|
| 3.1-a | Top toolbar: save status, undo, redo, copy, paste, snapping, zoom, preview, publish | `editor/TopBar.tsx` | e2e: editor.spec (save status, undo, snapping) | Tested. Publish shows Publish / Publish changes / Published |
| 3.1-b | Left sidebar: asset library, space tools, layers, properties; collapsible | `editor/Sidebar.tsx` | e2e: editor.spec | Tested |
| 3.1-c | Center canvas with handles, alignment guides, zoom/pan, feedback | `editor/CanvasStage.tsx`, `render/panZoom.ts` (mouse wheel zooms, trackpad scroll pans, pinch zooms; on phones a finger drag pans and a selected object drags) | unit: snapping.test, panZoom.test; e2e: zoom.spec, zoom.mobile.spec | Tested |
| 3.1-d | Bottom floor tabs with obvious Add Floor | `editor/FloorTabs.tsx` | e2e: floors test | Tested |
| 3.2-a | Create and open maps | `home/HomePage.tsx` | e2e: all editor tests | Tested |
| 3.2-b | Add, select (single, multiple, marquee), move, resize, rotate | `CanvasStage.tsx` (custom drag + Konva Transformer) | unit: store.test; manual drag/resize/rotate | Implemented. Drag/resize/rotate are not yet covered by an automated test |
| 3.2-c | Duplicate, copy/paste, delete | `editor/store.ts`, `model/clipboard.ts` | unit: clipboard.test, store.test; e2e | Tested |
| 3.2-d | Edit identifiers and labels; visual properties | `editor/PropertiesPanel.tsx` | e2e: text label, row edit | Tested |
| 3.2-e | Align and distribute | `model/align.ts` | unit: align.test, store.test | Tested |
| 3.2-f | Move objects between layers | `PropertiesPanel` layer picker | e2e: layers test | Tested |
| 3.2-g | Predictable selection; background can't move by accident | Background layer locked by default; locked/hidden layers not selectable | unit: store.test; e2e: layers test | Tested |
| 3.3-a | Ctrl/⌘ C, V, Z, Y, Shift+Z, A, Delete/Backspace, Escape | `editor/useKeyboard.ts` | e2e: copy/paste/undo/redo/select-all | Tested |
| 3.3-b | Copy preserves dimensions, rotation, styling, relative positions; groups and rows | `model/clipboard.ts` | unit: clipboard.test | Tested |
| 3.3-c | Paste visible, keeps selection, repeatable, originals unchanged | `store.paste` (offset, or view center if originals off-screen) | unit: store.test, clipboard.test; e2e | Tested |
| 3.3-d | Warn on duplicate identifiers from paste; one-click sequential renumber | Paste notice + `renumberSpaces` | unit: clipboard.test, store.test; e2e | Tested |
| 3.3-e | Toolbar buttons for copy/paste | `TopBar.tsx` | manual | Implemented |
| 3.4 | Reliable undo/redo of move, resize, rotate, delete, duplicate, paste, label and property changes | Snapshot history (200 steps) in `store.ts`; one step per gesture/edit | unit: store.test; e2e | Tested (resize/rotate manual) |

## Part 4: Parking-space creation and numbering

| ID | Requirement | Implementation | Test | Status |
|---|---|---|---|---|
| 4.1 | Row generator: draw/position a row, set count and numbering, confirm | Row tool (drag on canvas) + `editor/RowDialog.tsx` + `model/rows.ts` | unit: rows.test; e2e: row test | Tested |
| 4.2 | Numbering 1,2,3 / A1 / B01 / custom prefix, suffix, digits, start, size, spacing, direction, orientation, label placement; sensible defaults | `model/numbering.ts`, RowDialog ("More options" hides advanced fields) | unit: numbering.test | Tested |
| 4.3 | Edit generated rows: move, spacing, resize, renumber, reverse, add/remove spaces, duplicate, copy/paste, consistent formatting | Row settings in PropertiesPanel → `regenerateRow` | unit: rows.test, store.test; e2e | Tested |
| 4.4 | Angled rows (75°, 60°, 45°, 30°, lean left or right) and per-space number size (40% to 300%, with reset), drawn the same in the viewer | `rowGeometry` in `model/rows.ts`, `AngleFields` in RowDialog, `NumberSizeField` in StyleFields, SpaceShape in `render/MapObjects.tsx` | unit: rows.test; e2e: angled-rows.spec | Tested |
| 4.4 | Duplicate-identifier warnings (floor and facility), renumber tools, allow nonstandard numbering | `model/duplicates.ts`; red dashed outline; Renumber buttons; any label allowed | unit: floors-layers.test, clipboard.test | Tested (facility-wide warnings are computed; surfacing them in a pre-publish check is Part 12) |

## Part 5: Alignment and snapping

| ID | Requirement | Implementation | Test | Status |
|---|---|---|---|---|
| 5.1 | Smart alignment guides for edges, centers, rows, equal spacing; align/distribute tools | `model/snapping.ts`, guides drawn in CanvasStage | unit: snapping.test, align.test | Tested |
| 5.2-a | Smart (default), Grid (configurable), Free modes; quick switching | TopBar snap selector, grid size field; remembered per browser | unit: snapping.test; e2e | Tested |
| 5.2-b | Free Placement applies no hidden alignment | `snapMove('free')` returns the raw move; rotation snaps also off | unit: snapping.test | Tested |

## Part 6: Layers

| ID | Requirement | Implementation | Test | Status |
|---|---|---|---|---|
| 6.1 | Create, rename, reorder, delete, show/hide, lock/unlock, move objects between layers, identify object's layer and active layer | `editor/LayersPanel.tsx`, `model/layers.ts` | unit: floors-layers.test, store.test; e2e: layers test | Tested |
| 6.2 | Layer list shows name, visibility, lock, selected/active; locked objects can't be modified; new objects go to active layer | Active-layer picker with "Automatic (by type)" default; dot marks layers holding the selection | unit: store.test | Tested |
| 6.3 | Sensible default layers; no setup needed; warn before deleting a non-empty layer and explain | Five default layers; delete dialog offers move-or-delete | unit: floors-layers.test | Tested |
| 6.4 | Each layer lists its objects (name, icon) like Figma or Photoshop; list and canvas select each other; per-object show/hide, lock, rename, delete; drag to reorder or move to another layer; Shift/Ctrl multi-select; fast with thousands of spaces | `editor/LayerTree.tsx`, `model/layerTree.ts`, `placeObjects` in `model/layers.ts`; rows of spaces grouped, long lists windowed | unit: layerTree.test; e2e: layer-tree.spec | Tested |

## Part 7: Multilevel garages

| ID | Requirement | Implementation | Test | Status |
|---|---|---|---|---|
| 7.1 | Add, rename, reorder, duplicate, delete floors; default names Floor 1, 2… | `FloorTabs.tsx`, store floor actions | unit: store.test, floors-layers.test; e2e: floors test | Tested |
| 7.2 | Spreadsheet-style tabs; obvious current floor; per-floor layout and layers | Each `Floor` has its own layers and objects | e2e | Tested |
| 7.3 | Ramps, stairs, elevators, walkways can name destination floors | "Connects to" checkboxes; viewer shows "Goes to …" | manual | Implemented |
| 7.4 | Duplicate preserves objects/layers/settings; copies are independent; confirm before delete | `model/floors.ts` (all-new ids) | unit: floors-layers.test; e2e | Tested |

## Part 8: Asset library and landmarks

| ID | Requirement | Implementation | Test | Status |
|---|---|---|---|---|
| 8.1 | Categories listed in the spec | 32 assets in `assets/library.ts` covering every listed category | manual | Implemented |
| 8.2 | Search, categories, previews, recently used, favorites, consistent naming | `editor/AssetLibrary.tsx`, `searchAssets` | manual | Implemented (no automated test for favorites/recent yet) |
| 8.3 | Recognizable symbols that survive resize/rotation | SVG symbols and stretchable patterned areas | manual | Implemented |
| 8.4 | Licensing verified and documented | All symbols are original work, see `docs/ASSET_LICENSES.md` | n/a | Implemented |

## Part 9: Background images

| ID | Requirement | Implementation | Test | Status |
|---|---|---|---|---|
| 9-a | Upload, move, resize, transparency, lock, hide, replace; own layer | `LayersPanel` background section; locked "Background image" layer | manual | Implemented. Not yet covered by an automated test |
| 9-b | Respect map-provider licensing; maps work without a background | No map-provider integration; uploader reminds users to use authorized images | n/a | Implemented |

## Part 10: Object identification and readability

| ID | Requirement | Implementation | Test | Status |
|---|---|---|---|---|
| 10.1 | Labels for spaces, rows, sections, floors, landmarks; readable on mobile | Upright labels that stay readable when rotated; text labels; auto-sized space numbers | manual | Implemented |
| 10.2 | Click/tap shows name or identifier (e.g. "Stairway 17") | Auto-naming of landmarks; editor shows a name chip and properties; viewer shows an info card | unit: store.test (auto-naming); e2e: mobile viewer | Tested |
| 10.3 | Visual clarity, sensible defaults | Default sizes, contrast, no decorative effects | manual | Implemented |

## Part 11: Templates

| ID | Requirement | Implementation | Test | Status |
|---|---|---|---|---|
| 11-a | Templates for lot, single-level, multilevel, hotel valet, event | — | — | Not started (Phase 3) |
| 11-b | Copy an existing map as a starting point | "Copy" on the maps page | manual | Implemented |

## Part 12: Map validation

| ID | Requirement | Implementation | Test | Status |
|---|---|---|---|---|
| 12 | Pre-publish checks (duplicates, missing labels, empty floors, broken connections, out-of-area objects, unsaved/unpublished changes) | Duplicate detection exists (`model/duplicates.ts`); the check list is not built | — | Not started (Phase 3; needs publishing) |

## Part 13: Saving, versions, recovery

| ID | Requirement | Implementation | Test | Status |
|---|---|---|---|---|
| 13.1 | Autosave with Saving / Saved / Save failed / conflict status; never silently discard work | `editor/useAutosave.ts` (debounced save, retry, local backup copy on failure, recovery prompt) | e2e: reload test; unit: indexedDbRepository.test | Tested. "Offline" state is not shown because Phase 1 storage is local and works offline |
| 13.2 | Manual save; warn before leaving with unsaved work | Save button and Ctrl/⌘+S; `beforeunload` guard | e2e (save) | Tested |
| 13.3 | Version history: review, timestamps, restore without destroying newer work, who changed | `VersionsDialog.tsx`; current state saved before every restore; automatic recovery points every 10 minutes | unit: indexedDbRepository.test; e2e: version test | Tested. Online versions record who saved them (`map_versions.created_by`) |
| 13.4 | Recently deleted with retention; confirm destructive actions | 30-day trash on the maps page | unit: indexedDbRepository.test; e2e: reload/trash test | Tested |
| 13.5 | Reliable, protected backups | Nightly encrypted database backup (`.github/workflows/db-backup.yml`), per-company backup and restore on All accounts (`src/cloud/backup.ts`, `RestoreFromBackup.tsx`), including bringing back a map deleted forever or a deleted site into a company that still exists; runbook in `docs/RECOVERY.md` | db: backups.test, restore-drill.test; e2e: backups.online.spec | Tested |

## Part 14: Publishing and live updates

| ID | Requirement | Implementation | Test | Status |
|---|---|---|---|---|
| 14.1 | Save / preview / publish; draft vs published | `MapRepository.publishMap`/`getPublishedMap`; employees' view loads only the published copy; Preview shows the draft; publish adds a version | unit: indexedDbRepository.test (publishing); e2e: editor.spec (published only) | Tested (browser storage); server side in `publish_map` + RLS, db tests |
| 14.2 | Viewers get latest published version without new link | Same `#/view/:id` link always loads the newest published copy; refresh button | e2e: editor.spec (published only) | Implemented (live push updates arrive with online saving) |
| 14.3 | Show facility, floor, last-updated, loading/error state | Viewer header; clear error and retry when a map can't load | e2e: mobile viewer | Tested |

## Part 15: Accounts, dashboards, permissions

| ID | Requirement | Status |
|---|---|---|
| 15.1–15.5 | Individual accounts, dashboard of authorized maps, manager access controls, companies/facilities separation, public/private maps | Tested. Emailed sign-in, memberships by email, site links, roles (see "White-label roles" below), row-level security on every table (`supabase/tests/rls.test.ts`, `white-label.test.ts`, `accounts-audit.test.ts`; e2e: access.online.spec) |

## Part 16: Mobile viewer

| ID | Requirement | Implementation | Test | Status |
|---|---|---|---|---|
| 16.1 | Fast, smooth zoom/pan, floor selection, readable labels, identification, search, reset view, no admin controls | `viewer/ViewerPage.tsx` (pinch, drag, wheel zoom via `render/panZoom.ts`, floor pills, info card) | e2e: viewer.mobile.spec, zoom.mobile.spec | Tested |
| 16.2 | Search B16 → floor, navigate, highlight, show identifier; disambiguate multiple; explain no result | `model/search.ts` (ignores case, spaces, dashes) | unit: search.test; e2e: viewer.mobile.spec | Tested |
| 16.3 | Same data for desktop and mobile | Viewer reads the same `MapDocument` | e2e | Tested |
| 16.4 | Walking directions: from an entrance, elevator, stairs, a "you are here" link (`?from=<object id>`) or a tapped spot to the selected space or place, across floors and into building interiors; steps per floor; step-free option | `model/route.ts` (cost grid per floor: walkways cheapest, aisles and open ground next, grass costly; spaces, walls, buildings blocked; doors, entrances and connectors open them; A* / Dijkstra; floors joined by connectors' "Connects to" floors, older maps by neighbouring floors), `viewer/RouteOverlay.tsx`, Directions panel in `viewer/ViewerPage.tsx`. Editors steer routes with walkway/sidewalk/footpath assets, doors and connector floors; nothing new to draw | unit: route.test (incl. 12 floors x 2,080 spaces in under a second); e2e: directions.spec (Chrome, Safari, Firefox), directions.mobile.spec | Tested |
| 16.4a | Side view of every floor ("All floors" in the viewer's floor bar): floors stacked in their colors, ramps, stairs and elevators where they really are (from "Connects to"), parked stretches, the found space with its floor and nearest named stairs or elevator, the route across floors; tap a floor to open it. Basements (B1, P-1, Lower level…) go under the ground line; no button on one-floor maps. The website's "Every floor. One search." drawing is rendered by the same component | `model/sideView.ts`, `viewer/SideView.tsx`, `scripts/site-demo.ts` | unit: sideView.test; e2e: side-view.spec, side-view.mobile.spec | Tested |
| 16-auth | Access to authorized maps only | Row-level security; employees see only published maps of their sites; public links only for maps marked public | db: rls.test; e2e: access.online.spec, public-viewer.online.spec | Tested |

## Part 17: Vehicle-location readiness

| ID | Requirement | Status |
|---|---|---|
| 17 | Data model allows a later vehicle↔space link without rebuilding | Implemented as a design constraint: every space has a stable id (`SpaceObject.id`) that survives renumbering, row edits and moves, so a future `vehicle_locations(space_id, …)` table can reference it. No vehicle features built, as specified |

## Part 18: Concurrent editing

| ID | Requirement | Implementation | Test | Status |
|---|---|---|---|---|
| 18 | Detect conflicting edits, keep recoverable versions, tell the user, clear resolution | Revision check on every save; autosave pauses; "Keep mine" / "Use the other version", the loser is saved to version history | unit: indexedDbRepository.test; e2e: conflict test (two windows) | Tested, across devices too: online saves are `update … where revision = base` (db: concurrency.test; e2e: save-stress.online.spec) |

## Part 19: Exporting and sharing

| ID | Requirement | Status |
|---|---|---|
| 19 | Share links, PDF, high-res image, printable floors, per-floor export, permission-aware | Built: share links (`?at=`), map file download/import (`storage/mapFile.ts`), floor as a PNG of the whole floor at 3,200 px and Print or save as PDF (`editor/view.ts`), the viewer's own browser Print shows the whole floor with any route (`render/printPicture.ts`, print CSS), and printed "You are here" QR signs in card, letter and poster sizes (`model/qr.ts`, `editor/qrSign.ts`, `editor/SignDialog.tsx`; the code holds the public link with the map id when the map is public, and warns when the map is unpublished, private or the object is newer than the last publish) | unit: mapFile.test, qr.test (decoded with jsQR); e2e: pro-editing.spec (image, print), qr-signs.spec (each size decoded off the printed page and opened to the right floor and spot; viewer Print), qr-signs.online.spec (public link, two maps, visitor scan) | Tested |

## Part 20: Performance

| ID | Requirement | Implementation | Status |
|---|---|---|---|
| 20 | Responsive with large lots, many floors/spaces/assets | Canvas rendering (Konva), memoized shapes, only the current floor is drawn, snapping candidates computed once per drag; the selection box re-measures once per change, not once per selected object; drags of more than 150 objects move the drawn objects directly and save once on release; zoom, pan and viewer search skip re-checking unchanged objects | Load-tested 2026-11-12 on the largest quick lot (12 floors x 2,080 spaces, up to 6,300 objects on one floor): every edit, undo, drag step and zoom step under 0.7s. `e2e/big-lot.spec.ts` guards it |

## Part 21: Security and privacy

| ID | Requirement | Status |
|---|---|---|
| 21 | Server-side authorization, private maps, company separation, secure sessions, input validation, audit logs, backup access control | Done in the database (`supabase/migrations`, tested in `supabase/tests/rls.test.ts` against Supabase's default grants): row-level security on every table, company and site separation, draft vs published, audit log, join-code guess limit, document size limits, admin rights need a confirmed email. Third audit (2026-11-10) closed a join-code privilege escalation, trimmed default grants and added an optional hook that refuses password sign-ins. Open: no backups/export policy beyond map files |

## Part 22: Testing and traceability

| ID | Requirement | Status |
|---|---|---|
| 22 | This matrix; automated tests of key workflows; re-run after changes | Done: about 285 unit tests, 190 browser tests (each in Chrome, Safari and Firefox) and 105 database tests run in CI on every push |

## Part 23: Usability testing

| ID | Requirement | Status |
|---|---|---|
| 23.5 | Test with people who have no mapping experience | Not started. Needs real managers and valet staff |

## Asset library redesign (Kegan, 2026-11-01)

| ID | Requirement | Status |
|---|---|---|
| A1 | All listed assets in 18 categories | Every listed item has a library tile; all but 8 work now. Not built yet, shown in the library as "Next stage": freeform line, polygon, custom shape, custom polygon zone, PDF reference, grouped objects, saved templates, company assets |
| A2 | Cartoon-realistic, top-down, consistent style standard | Done: `docs/ASSET_STYLE.md`, `src/assets/style.ts`, `src/assets/draw.ts` |
| A3 | Fill color with an opacity slider on anything that has a fill | Done for spaces, assets, text boxes and imported images (Style panel) |
| A4 | Editable border color and thickness in px, including no border | Done, with 0 / 1 / 2 / 3 px presets and Reset |
| A5 | Icons and arrows keep their aspect ratio; labels fit or wrap | Done (`icon()` in `style.ts`, `render/fitLabel.ts`) |
| A6 | Standard Bergeron Maps logo in the app | Done: favicon, home header, editor home button |

## Known gaps (to keep honest)

- Drag, resize and rotate on the canvas, background-image editing, and asset favorites have been checked by hand but have no automated test yet.
- Editor touch support is basic (desktop-first by spec); the viewer is the phone experience.
- Online, background images and imported pictures are kept in Supabase Storage and maps hold only their address (`cloud/mapImages.ts`). In browser-only mode, and in map files and backup files, they are kept inside so those work on their own.

## Added during Phase 2 (from Kegan's feedback)

| ID | Requirement | Where | Tests | Status |
|---|---|---|---|---|
| K-1 | Managers won't map lots by hand: build a lot from a few numbers | `model/quickLot.ts`, `home/NewMapDialog.tsx` | unit: quickLot.test; e2e: quick lot builder | Tested |
| K-2 | Organization: maps grouped by site, publish status on every map | `home/HomePage.tsx` | e2e: editor.spec | Implemented |
| K-3 | Simple, centered layout; Level signage look by default | `styles.css`, `theme.ts` | screenshots | Implemented |
| K-4 | Phones: dialogs fit the screen (no iOS zoom) | `styles.css` (16px inputs) | manual on iPhone | Implemented |

## White-label roles and site workflow (2026-11-12)

| Spec item | Where |
|---|---|
| Company (tenant) with contracted site limit, account lead, site addresses | `setup_company`, `set_site_limit`, `set_site_address`, `add_contract_site` (admins only); All accounts page |
| Regional manager: every site in the company | membership with role manager and no site list |
| No role self-selection; email decides access | emailed sign-in links; access only from memberships |
| Request Manager Status with one-tap approve/deny | `request_manager_access`, `decide_manager_request`; My Locations, Sites & people, All accounts |
| Remove manager ends sessions at once | `remove_member` ends `auth.sessions`; the app re-checks access every minute and on focus |
| Transfer between sites | `move_member`; Move button on Sites & people |
| Maps tied to the site, not the manager | `maps.facility_id` |
| Employee My Locations, join with 6-character code, leave a site | `my_locations`, `join_site`, `leave_site` |
| Public link with no sign-in | `get_public_site`; `…/app/#/view/<site-link>`; Make public on a published map |
| Delete companies, sites (only once empty), people | `admin_delete_company` (type the name), `admin_delete_site`, `remove_member` |
| Back up and restore whole companies (a deleted client that comes back) | All accounts → Download backup / Restore from backup: `src/cloud/backup.ts` (`.bmbackup.json`), `admin_restore_company` + `admin_restore_versions` (migration 20261112020000); tests `supabase/tests/backups.test.ts`, `e2e/online/backups.online.spec.ts` |
| Restore a map deleted forever or a deleted site into a company that still exists | Same dialog: `findMissing` + `restoreMissing` in `src/cloud/backup.ts`, `admin_restore_missing` (migration 20261124000000, step 15); same tests |
| Hear about live problems (operations) | Uptime check every 15 min opens a GitHub issue: `.github/workflows/uptime.yml`, `scripts/uptime-check.mjs`; error reports without personal data: `src/errors/report.ts` (off until `SENTRY_DSN` is set); see `docs/MONITORING.md` |

Still deferred, waiting on Kegan: Stripe setup fee and per-site billing; custom client domains (needs the move to Cloudflare); email alerts for manager requests (needs an email sender).
