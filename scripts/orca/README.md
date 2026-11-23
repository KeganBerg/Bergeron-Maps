# Screen reader runs (Orca)

These scripts drive the real Orca screen reader (GNOME, version 46) against Chromium, and print what Orca
said after each step. They were used for the 2026-11-19 pass in `docs/ACCESSIBILITY.md`.

- `setup.sh` installs Orca and starts a headless desktop (Xvfb, D-Bus, AT-SPI).
- Each scenario starts Chromium with accessibility on, starts Orca with a debug log, sends real key
  presses with `xdotool` (so Orca's own keys, like H for headings, work), and writes `out/<name>.txt`:
  each step, then every line Orca spoke.
- `viewer.mjs` (headings, reading the page, Tab order), `search.mjs` (search, card, directions),
  `list.mjs` (floor list, floors, Escape), `signin.mjs` (online sign-in), `site.mjs` (bergeronmaps.com).

Orca runs on Ubuntu (`/usr/bin/orca` needs the system Python 3.12). Text typed into fields is sent with
Playwright rather than `xdotool`, so Orca's one-letter browse keys don't swallow it.

Known Orca 46 quirk with this Chromium: reading line by line with the arrow keys skips text boxes on every
page (a plain `<input>` too), so that isn't a bug in our pages. Tab and the landmark key (M) do reach them.
