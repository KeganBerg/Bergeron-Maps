# Load test: very large sites

Run on 2026-11-19 against the production build (`vite preview`) in headless Chromium.
"Slow laptop" and "phone" use Chrome's CPU throttling at 4x; the phone also uses a
Pixel 7 screen and touch. Times are in milliseconds and include the next two frames
being drawn. Runs vary by about 15%, so small differences are noise.

## The sites (synthetic, made by `scripts/loadtest/sites.ts`)

| Site | Floors | Spaces | Objects | Map file |
| --- | --- | --- | --- | --- |
| tower: the biggest quick-lot garage (12 x 26 rows x 80) | 12 | 24,960 | 25,166 | 5.4 MB |
| sprawl: one surface lot, three blocks side by side, 300 lights/signs/trees | 1 | 6,240 | 6,588 | 1.4 MB |
| campus: 6 levels x 1,000 spaces, 250 extra symbols per level | 6 | 6,000 | 7,586 | 1.6 MB |

The map logic itself is quick even on the tower (Node, desktop CPU): reading the file 45,
search 16, a route from the ground-floor entrance to the far corner of level 12 is 133
(72 with Avoid stairs).

## What was slow, and what changed

1. **Maps were drawn 3 to 4 times when they opened.** react-konva adds the layers before it
   applies the stage's size, position and visibility, and Konva draws a layer the moment it
   is added, so a big floor was drawn once at a made-up 360 x 640 size, then again after
   every resize. Now layers and resizes ask for one drawing on the next frame
   (`src/render/konvaSetup.ts`). Opening draws the floor once.
2. **The route's draw-in animation redrew the whole floor every frame** (about 25 frames).
   On a phone with a big floor that froze the screen while the line drew. The route now has
   its own layer, so each frame redraws only the line (`src/viewer/ViewerPage.tsx`).
3. **Saving a version in browser-only mode (no account) read every saved version back**, up to
   50 automatic ones, to find which to delete. On the tower that is about 270 MB read every
   10 minutes, and the Versions list did the same. Version ids now carry their time and
   reason, and what is known about each version is remembered, so neither reads old maps
   (`src/storage/indexedDbRepository.ts`). Saving also stopped making an extra full copy.
4. **The viewer's hidden tap map is redrawn a moment after the picture** (when the phone is
   idle, or at once when a finger comes down), so a tapped space lights up before that work.

Guard tests: `e2e/large-site.spec.ts` (one drawing on open in the editor and the viewer; the
floor isn't redrawn while the route draws in) and `src/storage/indexedDbRepository.test.ts`.

## Before and after (main, then this change)

| | Desktop | Slow laptop / phone (4x) |
| --- | --- | --- |
| Editor reopen, tower | 735 → 568 | 3,537 → 2,609 |
| Editor reopen, sprawl | 1,780 → 1,304 | 8,477 → 6,071 |
| Editor reopen, campus | 580 → 364 | 2,099 → 1,927 |
| Viewer open, tower | 714 → 631 | 2,754 → 2,399 |
| Viewer open, sprawl | 1,778 → 1,339 | 6,520 → 4,898 |
| Directions to the far corner, tower | 548 → 454 | 2,273 → 1,639 |
| Directions, sprawl | 650 → 349 | 1,709 → 1,003 |
| Publish, tower | 455 → 346 | 1,459 → 1,216 |
| Longest freeze, sprawl viewer | 1,022 → 605 | 4,548 → 3,374 |

Unchanged (already fine): zoom and pan steps (80 to 200 desktop), select all and move a whole
floor (under 0.6 s desktop), search (under 0.4 s desktop), autosave (about 0.6 s after the
0.8 s pause), floor switch on desktop (about 0.25 s).

## Still open

- **Phones on extreme floors.** On a 4x-throttled phone, switching floors on the tower takes
  about 1 s, a tap about 0.3 to 0.6 s, and opening the 6,240-space lot about 5 s. The cost is
  making and drawing thousands of shapes. The next step would be drawing a zoomed-out floor
  from a cached picture, or leaving out numbers too small to read. Real sites are far
  smaller: the largest real map so far has about 770 objects and is fast everywhere.
- **Online saves send the whole map.** Each autosave sends the full drawing to Supabase: about
  185 bytes a space, so 0.6 MB for a 3,000-space garage and 5.4 MB for the tower. Fine on
  Wi-Fi; slow on a weak phone signal. Sending only what changed would fix it.
- Not tested here: the live Supabase database (this environment can't reach it).

## Running it

```
npm run loadtest                 # builds the three sites into loadtest-out/ and times the map logic
npm run build && npx vite preview --port 4180 &
npm run loadtest:browser         # or: npm run loadtest:browser -- tower
```
