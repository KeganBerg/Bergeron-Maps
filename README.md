# Bergeron Maps

A web app for mapping parking facilities (valet lots, garages, hotel and event parking). Managers draw maps with rows of numbered spaces, landmarks and multiple floors; employees open the map on a phone and search for a space like "B16".

## Status

**Phase 1 (core mapping) is built.** Maps are currently saved in the browser on the device where they were made. Accounts, sharing with employees, publishing and cloud backup are Phase 2. See [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) for the requirement-by-requirement status.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
```

## Test it

```bash
npm run typecheck
npm test           # unit tests (Vitest)
npm run test:e2e   # browser tests (Playwright, desktop + phone)
```

## Using the editor

- **Rows of spaces:** "Draw a row of spaces", then drag across the map; or "Add row by number". Pick the count, prefix and starting number. Click a row to select it and change its settings later. Double-click a space to edit just that one.
- **Landmarks:** search or browse the library on the left; click to add, or drag onto the map.
- **Floors:** tabs along the bottom. Double-click to rename, right-click (or ⋯) to duplicate, reorder or delete.
- **Layers:** Layers tab. Lock layers to protect them, hide them to declutter.
- **Shortcuts:** the usual ones: Ctrl/⌘ + C, V, X, D, Z, Y (or Shift+Z), A, S; Delete; Escape; arrow keys nudge. Hold Space and drag to pan; Ctrl/⌘ + scroll to zoom.
- **Preview** shows exactly what employees will see on a phone.

## Docs

- [Architecture and Phase 2 plan](docs/ARCHITECTURE.md)
- [Requirements traceability matrix](docs/REQUIREMENTS.md)
- [Asset licenses](docs/ASSET_LICENSES.md)
