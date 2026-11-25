import { LANGUAGES, type LanguageCode } from '../i18n/languages';
import { useLanguage, useLanguageInfo, useT } from '../i18n/useLanguage';
import { Icon } from './icons';

/**
 * Picks the language of the map viewer, public map links and sign-in. A native
 * select, so phones open their own list. Each language is listed by its own name.
 * The label always includes the English word too, so someone helping a
 * coworker can find it. `compact` shows only the globe (the viewer's top bar on a phone).
 */
export function LanguagePicker({ compact = false }: { compact?: boolean }) {
  const t = useT();
  const lang = useLanguageInfo();
  const setLanguage = useLanguage((s) => s.setLanguage);
  const label = lang.code === 'en' ? 'Language' : `${t.language} (Language)`;
  return (
    <label className={`lang-picker${compact ? ' compact' : ''}`} title={label}>
      <Icon name="globe" size={18} />
      {!compact && <span className="lang-name" aria-hidden="true">{lang.native}</span>}
      <select value={lang.code} aria-label={label} data-testid="language-picker"
        onChange={(e) => setLanguage(e.target.value as LanguageCode)}>
        {LANGUAGES.map((l) => (
          <option key={l.code} value={l.code} lang={l.htmlLang}>
            {l.code === 'en' ? l.native : `${l.native} (${l.english})`}
          </option>
        ))}
      </select>
    </label>
  );
}
