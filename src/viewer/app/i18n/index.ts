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

export function t(text: string, params?: Record<string, string | number>): string {
  let out = lang.get() === 'ru' ? RU[text] ?? text : text;
  if (params) Object.keys(params).forEach((k) => { out = out.split(`{${k}}`).join(String(params[k])); });
  return out;
}
