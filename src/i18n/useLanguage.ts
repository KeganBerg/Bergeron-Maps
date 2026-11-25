import { create } from 'zustand';
import { en, type Messages } from './en';
import { es } from './es';
import { tl } from './tl';
import { vi } from './vi';
import { zh } from './zh';
import { type LanguageCode, languageOf, matchLanguage, pickLanguage } from './languages';

/** The reader's language for the viewer, public links and sign-in, kept on this device. */
const KEY = 'bm.language';

export const MESSAGES: Record<LanguageCode, Messages> = { en, es, zh, tl, vi };

// Guarded: the site's build scripts draw some viewer parts in Node, with no window.
const inBrowser = typeof window !== 'undefined';

function linkLanguage(): string | null {
  if (!inBrowser) return null;
  const fromHash = new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('lang');
  return fromHash ?? new URLSearchParams(window.location.search).get('lang');
}

function savedLanguage(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

const device = typeof navigator === 'undefined' ? [] : navigator.languages ?? [navigator.language];
const first = pickLanguage(linkLanguage(), inBrowser ? savedLanguage() : null, device);

export const useLanguage = create<{ code: LanguageCode; setLanguage: (code: LanguageCode) => void }>((set) => ({
  code: first,
  setLanguage: (code) => {
    try {
      localStorage.setItem(KEY, code);
    } catch {
      /* private browsing: the choice lasts until the page closes */
    }
    set({ code });
  },
}));

// A link that asks for a language (a sign printed in Spanish, ?lang=es) switches to it when it
// opens, even inside an open app. It isn't saved: picking one in the picker is.
if (inBrowser) {
  window.addEventListener('hashchange', () => {
    const asked = matchLanguage(linkLanguage());
    if (asked) useLanguage.setState({ code: asked });
  });
}

/** The words for the reader's language. */
export const useT = (): Messages => MESSAGES[useLanguage((s) => s.code)];

/**
 * The reader's language: its locale for dates, and its lang attribute. Pages that are
 * translated put that on their own root element, not on <html>, because the rest of the
 * app (the editor, admin pages) is still English.
 */
export const useLanguageInfo = () => languageOf(useLanguage((s) => s.code));
