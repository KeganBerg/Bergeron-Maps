# Bergeron Maps: rules for contributors

- **Typography:** follow [docs/TYPOGRAPHY.md](docs/TYPOGRAPHY.md). The device's own UI font everywhere
  (`-apple-system, BlinkMacSystemFont, "Segoe UI", …`), no web fonts, weights 400/600/700 only, app sizes from the `--fs-*` tokens. No monospace or small
  uppercase letter-spaced labels; labels are sentence case. Themes change colour, never type.
  `src/typography.test.ts` enforces it.
- **Look:** no "AI-made" styling (glows, shimmer, bento grids, pinned scroll, pill buttons,
  mono eyebrows). It should read like an established enterprise SaaS product.
- **Names:** never put client names in the app, site, repo or copy. Use "Company" or "Site Name".
- **Logo:** never draw "BM" or the wordmark in a font; use the traced SVGs in `src/assets/brand/`.
- **Assets:** follow docs/ASSET_STYLE.md and record licenses in docs/ASSET_LICENSES.md.
