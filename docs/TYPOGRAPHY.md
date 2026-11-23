# Typography

Bergeron Maps is an enterprise product. Type should look calm, consistent and
deliberate, the way a serious B2B tool does. These rules cover the app (`src/`),
the marketing site (`site/`), printed signs and anything new.

## The rule

**One family everywhere: Overpass.** App, marketing site, map labels, printed
QR signs and the product demo on the site all use it. Overpass comes from the
lettering on US highway signs, so it suits wayfinding without being decorative.

| Where | Token | Value |
| --- | --- | --- |
| App CSS | `--font` (src/styles.css) | `'BM Dot', 'Overpass', system-ui, …, sans-serif` |
| Map canvas, print windows | `MAP_FONT` (src/theme.ts) | `Overpass, system-ui, …, sans-serif` |
| Marketing site | `--font-sans` (site/src/input.css) | `"BM Dot", "Overpass", system-ui, …, sans-serif` |

`BM Dot` only supplies the middle dot (·), because Overpass draws it with no space after.

### Weights

Only three: **400** regular, **600** semibold, **700** bold. Those are the only
files we ship. No 300, 500, 800, 900 or odd values like `font-[760]`.
App CSS uses `--fw-regular`, `--fw-semibold` and `--fw-bold`.

### Sizes (app)

Use the tokens in `src/styles.css`, never a raw `px` value:

| Token | Size | Use |
| --- | --- | --- |
| `--fs-xs` | 11px | tile captions, counts |
| `--fs-sm` | 12px | hints, meta, field labels |
| `--fs-md` | 13px | dense controls |
| `--fs-base` | 14px | body |
| `--fs-lg` | 16px | phone body; inputs on touch screens (stops iOS zoom) |
| `--fs-xl` | 18px | card and page titles |
| `--fs-2xl` | 24px | the one big name or number on a screen |

The marketing site keeps its larger editorial sizes (Tailwind classes), still in Overpass.

### Themes change colour, never type

Classic, Night and Level signage share the same family, sizes and weights.
A theme rule must not set `font-family`, `font-size`, `font-weight`,
`letter-spacing` or `text-transform`.

## What reads as "AI-made" and is not allowed

- **Monospace for anything that isn't code.** No mono labels, captions, eyebrows or numbers.
- **Small uppercase letter-spaced labels** ("PROJECT", "ON THIS MAP", "STEP 01") above content.
  Write labels in sentence case, semibold, muted colour: "Project", "On this map".
- **Mixing display faces** (condensed, slab, serif) with the body face for flavour.
- **Positive letter-spacing on words.** Only negative tracking on big headings
  (−0.02em at 32px and up) is allowed.

### Allowed exceptions

- **Codes people type** (join codes, site codes) may be uppercase and letter-spaced for legibility.
- **The logo.** The "BERGERON MAPS" wordmark is the traced artwork
  (`src/assets/brand/wordmark.svg`, `site/wordmark.svg`), never live text in a font.
- **Sign and stencil text drawn inside map artwork** (EXIT, ENTER, drawing notes on the
  site's plan drawings) may be uppercase, like the real paint. Asset SVGs that become
  images use `SIGN_FONT` (Arial) because an SVG image can't load a web font.
- **Printed sign headlines** ("YOU ARE HERE") may be uppercase, like a real wall sign.

## Checks

`src/typography.test.ts` fails the build if CSS brings back another family,
monospace labels, a theme that changes type, a raw font size in the app,
or an unsupported weight.
