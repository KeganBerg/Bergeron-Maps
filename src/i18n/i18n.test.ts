import { describe, expect, it } from 'vitest';
import type { SignInProblem } from '../cloud/signInProblem';
import { ASSET_BY_KEY } from '../assets/library';
import { en, type Messages } from './en';
import { LANGUAGES, matchLanguage, pickLanguage } from './languages';
import { MESSAGES } from './useLanguage';

/** Every sentence a language can say, with a marker in each blank so we can check names and numbers come through. */
const SIGN_IN_PROBLEMS: SignInProblem[] = [
  ...(['link', 'badCode', 'unavailable', 'tooMany', 'sendFailed', 'noAccount', 'offline', 'enterEmail', 'enterCode'] as const).map((kind) => ({ kind })),
  { kind: 'wait', seconds: 42 },
  { kind: 'other', message: 'Server says no' },
];

function allTexts(t: Messages): { key: string; text: string; args: string[] }[] {
  const out: { key: string; text: string; args: string[] }[] = [];
  const add = (key: string, v: unknown) => {
    if (typeof v === 'string') out.push({ key, text: v, args: [] });
    else if (Array.isArray(v)) v.forEach((x, i) => add(`${key}[${i}]`, x));
    else if (typeof v === 'function') {
      // Names get a marker; numbers 1 and 7 cover singular and plural; ways and flags get real values.
      const args = Array.from({ length: v.length }, (_, i) => `QX${i}`);
      const call = (...a: unknown[]) => out.push({ key, text: v(...a), args: a.filter((x): x is string => typeof x === 'string' && x.startsWith('QX')) });
      if (key.endsWith('takeTo')) (['up', 'down', 'across'] as const).forEach((w) => call('QX0', w, 'QX2'));
      else if (key.endsWith('wayTo')) (['up', 'down', 'across'] as const).forEach((w) => call(w, 'QX1'));
      else if (key === 'noWay') [true, false].forEach((b) => call('QX0', b));
      else if (/^(manyResults|results|listCount|spaceCount|saySideView)$/.test(key)) [1, 7].forEach((n) => call(n));
      else if (key === 'routeSummary') call(120, 2, 'QX2');
      else if (key === 'walkLength') call('QX0', 120);
      else if (/words\.(parts|list)$/.test(key)) out.push({ key, text: v(['QX0', undefined, 'QX1']), args: ['QX0', 'QX1'] });
      else if (key === 'signInProblem') SIGN_IN_PROBLEMS.forEach((p) => out.push({ key, text: v(p), args: [] }));
      else if (key === 'sayRoute') { call('QX0', 120, 1, 1); call('QX0', 120, 3, 4); }
      else call(...args);
    } else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) if (k !== 'symbol') add(`${key ? `${key}.` : ''}${k}`, x);
  };
  add('', t);
  return out.map((x) => ({ ...x, key: x.key.replace(/^\./, '') }));
}

describe('languages', () => {
  it('lists the five most spoken languages in the US, English first', () => {
    expect(LANGUAGES.map((l) => l.code)).toEqual(['en', 'es', 'zh', 'tl', 'vi']);
    expect(Object.keys(MESSAGES).sort()).toEqual(['en', 'es', 'tl', 'vi', 'zh']);
  });

  it('starts in the link’s language, then the saved one, then the phone’s, then English', () => {
    expect(pickLanguage('es', 'vi', ['zh-CN'])).toBe('es');
    expect(pickLanguage(null, 'vi', ['zh-CN'])).toBe('vi');
    expect(pickLanguage(null, null, ['fr-FR', 'zh-TW'])).toBe('zh');
    expect(pickLanguage('xx', 'nonsense', ['de'])).toBe('en');
    expect(matchLanguage('es-MX')).toBe('es');
    expect(matchLanguage('fil-PH')).toBe('tl');
    expect(matchLanguage('vi_VN')).toBe('vi');
  });
});

describe.each(LANGUAGES.map((l) => [l.english, MESSAGES[l.code]] as const))('%s', (_, t) => {
  const texts = allTexts(t);

  it('has every sentence English has', () => {
    expect(texts.map((x) => x.key).filter((k, i, a) => a.indexOf(k) === i).sort())
      .toEqual(allTexts(en).map((x) => x.key).filter((k, i, a) => a.indexOf(k) === i).sort());
  });

  it('says something for every sentence, and keeps every name and number in it', () => {
    for (const { key, text, args } of texts) {
      expect(text.trim(), key).not.toBe('');
      for (const a of args) expect(text, key).toContain(a);
    }
  });

  it('follows the copy rules: no middle dots, em or en dashes, or arrows', () => {
    for (const { key, text } of texts) expect(text, key).not.toMatch(/[·—–→]|undefined|NaN/);
  });

  it('names only symbols that exist, and the same ones in every language', () => {
    const named = Object.keys(ASSET_BY_KEY).filter((k) => t.words.symbol(k));
    if (t === en) return expect(named).toEqual([]);
    expect(named.length).toBeGreaterThan(50);
    const spanish = Object.keys(ASSET_BY_KEY).filter((k) => MESSAGES.es.words.symbol(k));
    expect(named).toEqual(spanish);
    for (const k of named) expect(t.words.symbol(k)!.trim(), k).not.toBe('');
    // Every symbol a viewer can tap or see in a list has a name. Only the editor's own tools are left out.
    const EDITOR_ONLY = ['Background and reference', 'Drawing elements', 'Custom and reusable', 'Text and labels'];
    const unnamed = Object.values(ASSET_BY_KEY).filter((d) => !EDITOR_ONLY.includes(d.category) && !t.words.symbol(d.key)).map((d) => d.key);
    expect(unnamed).toEqual([]);
  });
});
