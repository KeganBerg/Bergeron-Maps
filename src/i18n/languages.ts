/**
 * The languages the map viewer speaks: the five most spoken at home in the US
 * (Census Bureau, American Community Survey): English, Spanish, Chinese,
 * Tagalog and Vietnamese. Each is listed by its own name, so people can find
 * theirs without reading English.
 */
export type LanguageCode = 'en' | 'es' | 'zh' | 'tl' | 'vi';

export interface Language {
  code: LanguageCode;
  /** Its own name, shown in the picker. */
  native: string;
  /** Its English name, for people helping someone else pick. */
  english: string;
  /** For the page's lang attribute (screen readers, fonts, hyphens). */
  htmlLang: string;
  /** For dates and numbers. */
  locale: string;
}

export const LANGUAGES: Language[] = [
  { code: 'en', native: 'English', english: 'English', htmlLang: 'en', locale: 'en-US' },
  { code: 'es', native: 'Español', english: 'Spanish', htmlLang: 'es', locale: 'es-US' },
  // Simplified characters, the form most US Chinese readers are taught today.
  { code: 'zh', native: '简体中文', english: 'Chinese', htmlLang: 'zh-Hans', locale: 'zh-CN' },
  { code: 'tl', native: 'Tagalog', english: 'Tagalog', htmlLang: 'tl', locale: 'fil-PH' },
  { code: 'vi', native: 'Tiếng Việt', english: 'Vietnamese', htmlLang: 'vi', locale: 'vi-VN' },
];

export const languageOf = (code: LanguageCode): Language => LANGUAGES.find((l) => l.code === code) ?? LANGUAGES[0];

const isCode = (s: string): s is LanguageCode => LANGUAGES.some((l) => l.code === s);

/** "es-MX" to "es", "fil" to "tl", "zh-TW" to "zh". Undefined when it isn't one of ours. */
export function matchLanguage(tag: string | null | undefined): LanguageCode | undefined {
  const base = (tag ?? '').trim().toLowerCase().split(/[-_]/)[0];
  if (base === 'fil') return 'tl';
  return isCode(base) ? base : undefined;
}

/**
 * The language to start in: one asked for in the link (a sign's QR code can
 * say ?lang=es), else the one picked before on this device, else the first
 * of the phone's own languages we have, else English.
 */
export function pickLanguage(link: string | null, saved: string | null, device: readonly string[]): LanguageCode {
  return matchLanguage(link) ?? matchLanguage(saved) ?? device.map(matchLanguage).find(Boolean) ?? 'en';
}
