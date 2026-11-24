# Bergeron Maps: rules for contributors

- **Typography:** follow [docs/TYPOGRAPHY.md](docs/TYPOGRAPHY.md). The device's own UI font everywhere
  (`-apple-system, BlinkMacSystemFont, "Segoe UI", …`), no web fonts, weights 400/600/700 only, app sizes from the `--fs-*` tokens. No monospace or small
  uppercase letter-spaced labels; labels are sentence case. Themes change colour, never type.
  `src/typography.test.ts` enforces it.
- **Look:** no "AI-made" styling (glows, shimmer, bento grids, pinned scroll, pill buttons,
  mono eyebrows). It should read like an established enterprise SaaS product.
- **Names:** never put client names in the app, site, repo or copy. Use "Company" or "Site Name".
- **Logo:** never draw "BM" or the wordmark in a font; use the traced SVGs in `src/assets/brand/`.
- **Site claims:** nothing on the marketing site (`site/`) may claim or show something the app
  can't do today: copy, industry pages, screenshots, drawings, alt text, meta and link previews.
  Planned work (payment, white-label domains, emails, self-serve sign-up) must not be implied.
  Build the gap if it's small, otherwise reword or cut and ask Kegan about bigger ones.
  Follow the checklist in [docs/SITE_CLAIMS.md](docs/SITE_CLAIMS.md); `src/siteClaims.test.ts` enforces part of it.
- **Assets:** follow docs/ASSET_STYLE.md and record licenses in docs/ASSET_LICENSES.md.
- **Readable code:** a new engineer must be able to follow it. Follow "Code size and structure" in
  [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): app files under 600 lines (`src/codeSize.test.ts`), split by job
  when they get close; logic in `src/model/` with unit tests, not in components; facts about a symbol on the
  symbol, not in lists elsewhere; plain names; comments say why. No `any` or `@ts-ignore` (ESLint). Run
  `npm run lint` and `npm run typecheck` before pushing.
- **Docs move with the code:** update README.md, docs/ARCHITECTURE.md and docs/REQUIREMENTS.md in the same pull
  request when a change makes them wrong.
- **Database:** every schema change is a new file in `supabase/migrations/` with tests in `supabase/tests/`;
  never edit one that already ran on the live database.
