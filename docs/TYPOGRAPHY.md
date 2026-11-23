# Typography

Bergeron Maps is an enterprise product. Type should look calm, consistent and
deliberate, the way a serious B2B tool does. These rules cover the app (`src/`),
the marketing site (`site/`), printed signs and anything new.

## The rule

**Use the device's own interface font, everywhere.** That is San Francisco on
iPhone and Mac, Segoe UI on Windows, and Roboto or Noto on Android. GitHub, the
Stripe dashboard, Shopify admin, Atlassian (Jira, Confluence) and Zendesk all do
this. It is the most common choice in established enterprise SaaS, and it is not
what AI-generated apps reach for (those load Inter or Geist plus a monospace).
It also means no font files to download, so pages draw at once.

One stack, the same in every place:

`-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif`

| Where | Token |
| --- | --- |
| App CSS | `--font` (src/styles.css) |
| Map canvas, printed signs, viewer print | `MAP_FONT` (src/theme.ts) |
| Marketing site and its product demo | `--font-sans` (site/src/input.css) |

**Never add a web font** (`@font-face`, `@fontsource`, Google Fonts) and never
name another family. Don't add `system-ui` to the stack either: with it in the
map's canvas font, the Safari (WebKit) click tests timed out in CI.

### Weights

Only three: **400** regular, **600** semibold, **700** bold. Every system UI font
has them. No 300, 500, 800, 900 or odd values like `font-[760]`.
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

The marketing site keeps its larger editorial sizes (Tailwind classes), in the same font.

### Line spacing

Text must never look stacked on top of itself.

- Running text uses `--lh-body` (1.45), set once on `body`.
- One-line names and titles use `--lh-tight` (1.3). Nothing goes below 1.2, except a
  label drawn on the map itself.
- A small label over its value ("Company" over the company name, "Floor 1" under
  a title) keeps `--stack-gap` (3px) between them. Form labels keep 6px above their field.

### Themes change colour, never type

Classic, Night and Level signage share the same family, sizes and weights.
A theme rule must not set `font-family`, `font-size`, `font-weight`,
`letter-spacing` or `text-transform`.

## What reads as "AI-made" and is not allowed

- **Monospace for anything that isn't code.** No mono labels, captions, eyebrows or numbers.
- **Small uppercase letter-spaced labels** ("PROJECT", "ON THIS MAP", "STEP 01") above content.
  Write labels in sentence case, semibold, muted colour: "Project", "On this map".
- **Mixing display faces** (condensed, slab, serif) with the body face for flavour.
- **Zero-padded index numbers** ("01", "02", "03") above cards or steps. Leave them out.
- **Positive letter-spacing on words.** Only negative tracking on big headings
  (−0.02em at 32px and up) is allowed.

### Allowed exceptions

- **Codes people type** (join codes, site codes) may be uppercase and letter-spaced for legibility.
- **The logo.** The "BERGERON MAPS" wordmark is the traced artwork
  (`src/assets/brand/wordmark.svg`, `site/wordmark.svg`), never live text in a font.
- **Sign and stencil text drawn inside map artwork** (EXIT, ENTER, drawing notes on the
  site's plan drawings) may be uppercase, like the real paint. Asset SVGs that become
  images use `SIGN_FONT` (Arial), which every device has.
- **Printed sign headlines** ("YOU ARE HERE") may be uppercase, like a real wall sign.

## Checks

`src/typography.test.ts` fails the build if anything adds a web font or another
family, monospace labels, zero-padded index numbers, a theme that changes type,
a raw font size in the app, or an unsupported weight.
