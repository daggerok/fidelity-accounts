/// <reference lib="esnext" />
// English and Russian (the mykplan-adp way, pattern i18n-en-ru): the key IS the English text, so English needs no
// dictionary and a missing Russian line falls back to English. A flag button switches, the choice is remembered.
// Placeholders: t('{n} positions', { n }). Keys must be plain literals: i18n.test.ts checks every t('...') in src
import { createStore } from '../../../shared/store';
import { RU } from './ru';

export type Lang = 'en' | 'ru';
export const LANG_FLAGS: Record<Lang, string> = { en: '🇺🇸', ru: '🇷🇺' };
const KEY = 'fidelity-accounts.lang';

const read = (): Lang => {
  try { return globalThis.localStorage?.getItem(KEY) === 'ru' ? 'ru' : 'en'; } catch { return 'en'; }
};

export const lang = createStore<Lang>(read());

export function setLang(next: Lang): void {
  try { globalThis.localStorage?.setItem(KEY, next); } catch { /* private window: this session only */ }
  try { document.documentElement.lang = next; } catch { /* tests */ }
  lang.set(next);
}

/** the Russian plural form of a count: 0 for 1, 21, 101 (выплата), 1 for 2-4, 22-24 (выплаты), 2 for the rest (5, 11-14: выплат) */
export function ruPlural(n: number): 0 | 1 | 2 {
  const a = Math.abs(Math.trunc(n));
  const ten = a % 10;
  const hundred = a % 100;
  if (ten === 1 && hundred !== 11) return 0;
  if (ten >= 2 && ten <= 4 && (hundred < 12 || hundred > 14)) return 1;
  return 2;
}

// A Russian line may hold its three plural forms split by | ('{n} выплата|{n} выплаты|{n} выплат'): the count in {n}
// picks one. English keys never hold a |
export function t(text: string, params?: Record<string, string | number>): string {
  let out = lang.get() === 'ru' ? RU[text] ?? text : text;
  if (out.includes('|') && typeof params?.n === 'number') out = out.split('|')[ruPlural(params.n)] ?? out;
  if (params) Object.keys(params).forEach((k) => { out = out.split(`{${k}}`).join(String(params[k])); });
  return out;
}
