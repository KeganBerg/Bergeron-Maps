# Site claims: everything on the website must be true in the app

Rule (Kegan, 2026-11-23): nothing on the marketing site (`site/`, bergeronmaps.com) may claim
or show something the app can't do today. That covers page copy, industry pages, captions,
screenshots, drawings and animations, alt text, titles, meta descriptions, link previews
(og/twitter tags and images) and structured data.

When a claim isn't true yet, either build it (if it's small and clearly valuable) or reword
or remove the claim. Bigger gaps go to Kegan as a build-or-cut choice. Planned work that
isn't live (online payment, white-label subdomains, notification emails other than the access email,
self-serve sign-up, "Use my location") must not be implied. A finished section that waits
for launch stays in an HTML comment.

`src/siteClaims.test.ts` fails the build on the most common slips. It doesn't replace
reading the copy.

## Checklist for any change to the site or the app

Before merging a PR that touches `site/`, `scripts/site-pages.mjs`, `scripts/site-demo.ts`,
`site/build-drawings.py` or `scripts/industry-shots/`:

- [ ] Every feature named in the copy can be done in the app today, by the role the copy
      names (owner, regional manager, site manager, employee, public visitor).
- [ ] Numbers are real: library size comes from `ASSETS.length`, site-code length from the
      database, quick-lot questions from `QUICK_LOT_LIMITS`. No invented statistics; the
      calculators use the visitor's own numbers.
- [ ] Screenshots come from the running app (`scripts/industry-shots/shoot.mjs`,
      `scripts/og-shots.mjs`), and drawings are generated from app code
      (`scripts/site-demo.ts`). A hand-made picture must say it is an illustration.
- [ ] The editor demo on the home page still matches the app's top bar and Add panel. It is
      a copy built from the app's symbols, so re-check it after any editor UI change.
- [ ] Nothing implies payment, white-label domains, emails the app doesn't send, live
      tracking, GPS, occupancy, offline use or an API.
- [ ] Meta descriptions, og/twitter text and og images say the same true things as the page.
- [ ] Sample sites are labelled as samples, with no client names.
- [ ] Font and spacing rules in docs/TYPOGRAPHY.md still hold.

And before merging an app PR that removes or renames a feature, search `site/` and
`scripts/site-pages.mjs` for it.

## Claim ledger (audit of 2026-11-23)

Where each claim is backed in the app. Update this when the site or the app changes.

| Site claim | Where it lives in the app |
| --- | --- |
| Trace over a photo of your sketch | Layers > Upload site plan or aerial photo (`src/editor/LayersPanel.tsx`), curve handles to match it |
| Answer four questions and the builder lays out rows, lanes and ramps | New map > Build it for me (`src/model/quickLot.ts`: floors, rows, spaces per row, accessible spaces) |
| Add people by email and they get an email telling them how to sign in, or a six-character site code | Team page > Give access (`add_member`), then the access email (`sendAccessEmail` in `src/cloud/TeamPage.tsx`, Worker `/api/access`, PR #109); site join code (`get_join_code`, Join site needs 6 characters) |
| Edits stay in draft until you publish | Editor Publish and Preview, viewer shows the published version |
| Employees see the update within a minute, without reloading | Viewer checks the publish time every minute and when the page is shown again, and loads the new version (`src/viewer/ViewerPage.tsx`); the public link reloads when someone comes back after 5 minutes |
| Search lights a space up on the right floor | `src/model/search.ts`, viewer search |
| Walking directions from an entrance, stairs, elevator or valet stand; Avoid stairs | `src/model/route.ts` (`startPlaces`), viewer Directions |
| Every floor has its own color; All floors side view | `src/theme.ts` floor colors, `src/viewer/SideView.tsx` (PR #89); the site drawing is rendered by the same component |
| 458 objects, hundreds of standard symbols | `ASSETS.length` (8 of them are marked "Next stage" in the app) |
| Thousands of icons for zones | Symbol picker (Google Material symbols), `src/editor/SymbolPicker.tsx` |
| Color, opacity and border on anything; reshape zones and buildings | Style fields and Shape fields in `src/editor/PropertiesPanel.tsx` |
| Automatic numbering: A1, B01, A-01 or your own format | Row dialog prefix, digits, suffix (`src/model/numbering.ts`) |
| Floors, building interiors, layers for structure, spaces, landmarks and labels | `src/model/interiors.ts`, `src/model/layers.ts`; tap a building in the viewer to go inside |
| Saved versions to go back to | Versions dialog, backups |
| Regional managers see and edit every site in the company; site managers their own sites; employees view only | Team page access levels (`src/cloud/TeamPage.tsx`) and RLS |
| Reserved and accessible spaces are marked | Reserved, accessible and other space variants |
| List view, keyboard use, contrast, 44 px targets (accessibility page) | Viewer list of spaces and places, docs/ACCESSIBILITY.md |
| "We'll build the first map with you" | A service the team provides, not an app feature |
