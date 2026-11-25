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
  for now. Sign-in error messages that come from the server are English too.

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

The Spanish, Chinese, Tagalog and Vietnamese text was machine-drafted. Before it is promised to a
customer, a native speaker should read each file (about 120 short lines each) and fix anything that
sounds unnatural. Free options: a bilingual employee at a customer site, or a friend or family member.
