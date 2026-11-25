# Languages

The map viewer, public map links and the sign-in page come in the five languages most spoken at
home in the US (Census Bureau, American Community Survey): English, Spanish, Chinese (simplified
characters), Tagalog and Vietnamese. Many of the people who use the viewer every day (valets,
attendants, security) read another language first.

## How it works

- The globe button in the viewer's top bar (and under the sign-in card, and beside a public site's
  name) is a plain select: phones open their own list. Each language is listed by its own name.
- First visit: the phone's own language, if it is one of the five, else English. A pick is kept on
  the device (`localStorage`, key `bm.language`).
- A link can ask for a language: `…/app/#/view/<site-link>?lang=es`. Useful for signs printed in
  one language. It isn't saved; the picker is.
- Names typed on the map (map, floor, space numbers, "Entrance", "North stairs") are never
  translated. Only the words around them are. A symbol nobody named ("Elevator") is shown in the
  reader's language.
- The editor, admin pages, emails, the marketing site and Bergeron Maps University are English only
  for now. Sign-in errors are translated too: `src/cloud/signInProblem.ts` turns the server's
  English error into a reason, and each language says it (`signInProblem`). Only an error that
  matches no known reason shows the server's English, and only to English readers.

## Code

- `src/i18n/en.ts` holds every sentence, and its type. `es.ts`, `zh.ts`, `tl.ts`, `vi.ts` must have
  the same keys or TypeScript fails. Sentences with a name or number are functions, so each
  language can order the words and handle plurals its own way.
- `src/model/words.ts` is the part map logic uses (space names, route steps, floor list headings).
  `findRoute`, `floorListing`, `searchMap` and `startPlaces` take it, English by default.
- `src/i18n/useLanguage.ts`: the chosen language (`useT()` for the words, `useLanguageInfo()` for
  the locale and `lang` attribute). Translated pages set `lang` on their own root element, not on
  `<html>`, because the rest of the app is English.
- `src/i18n/i18n.test.ts` checks that every language has every sentence, keeps every name and number,
  and follows the copy rules (no em dashes, arrows or middle dots).

## Adding a sentence

Add it to `en.ts`, then to the four other files. Keep it plain and short: readers may be new to
English and new to apps.

## Review needed

The Spanish, Chinese, Tagalog and Vietnamese text was machine-drafted, then given a second review
pass for grammar, plurals and consistent terms (2026-11-25). Software can't promise native-level
accuracy, so each language needs a professional native speaker's sign-off before it is promised to
customers. The review sheets (one spreadsheet per language: English beside the translation, with
where each line appears, an OK column, a correction column and a sign-off block) are in the project
files under `translations/`. Copy the reviewer's corrections into the matching file in `src/i18n/`.

Points worth a reviewer's attention:

- Tagalog: "puwesto" for a parking space (some workers may say "slot"), and whether counts take the
  "na" linker ("7 na item").
- Spanish: US Latin American usage ("elevador", "autos", formal "usted").
- Chinese: simplified characters only. Traditional (common with Cantonese speakers) would be a
  sixth language.
