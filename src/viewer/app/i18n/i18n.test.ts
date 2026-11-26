/// <reference types="bun" />
/// <reference types="node" />
/// <reference lib="esnext" />
import { expect, test } from 'bun:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { lang, ruPlural, t } from '.';
import { THEME_MODES, themeTitle } from '../../../shared/theme';
import { RU } from './ru';

const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  if (p === __dirname) return []; // this folder explains t() in comments
  return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f) ? [p] : [];
});
const SRC = join(__dirname, '..', '..');
// t('...'), t("...") and t(`...`) with a plain literal as the first argument
const KEYS = /\bt\(\s*(['"`])((?:\\.|(?!\1).)*)\1/g;
const unescape = (s: string) => s.replace(/\\(['"`\\])/g, '$1');

test('every t() text in src has a Russian line, and no key is built at run time', () => {
  const missing: string[] = [];
  const dynamic: string[] = [];
  files(SRC).forEach((f) => {
    const src = readFileSync(f, 'utf8');
    let m: RegExpExecArray | null;
    KEYS.lastIndex = 0;
    while ((m = KEYS.exec(src))) {
      const key = unescape(m[2]!);
      if (m[1] === '`' && key.includes('${')) { dynamic.push(`${f}: ${key}`); continue; }
      if (!(key in RU)) missing.push(`${f.slice(SRC.length + 1)}: ${key}`);
    }
  });
  expect(dynamic).toEqual([]);
  expect(missing).toEqual([]);
});

test('placeholders are filled in both languages; a missing Russian line falls back to English', () => {
  RU['Beat {cmp} in {n}'] = 'Лучше {cmp} в {n}';
  lang.set('en');
  expect(t('Beat {cmp} in {n}', { cmp: 'SPY', n: 3 })).toBe('Beat SPY in 3');
  lang.set('ru');
  expect(t('Beat {cmp} in {n}', { cmp: 'SPY', n: 3 })).toBe('Лучше SPY в 3');
  expect(t('no such line')).toBe('no such line');
  lang.set('en');
  delete RU['Beat {cmp} in {n}'];
});

test('Russian plural forms: 1 выплата, 2 выплаты, 5 выплат', () => {
  expect([1, 2, 4, 5, 11, 12, 14, 21, 22, 25, 101, 111, 0].map(ruPlural)).toEqual([0, 1, 1, 2, 2, 2, 2, 0, 1, 2, 0, 2, 2]);
  lang.set('ru');
  expect(t('{n} payouts', { n: 1 })).toBe('1 выплата');
  expect(t('{n} payouts', { n: 2 })).toBe('2 выплаты');
  expect(t('{n} payouts', { n: 5 })).toBe('5 выплат');
  lang.set('en');
  expect(t('{n} payouts', { n: 3 })).toBe('3 payouts');
});

test('the theme button titles of shared/theme have Russian lines', () => {
  const titles = THEME_MODES.flatMap((m) => [themeTitle(m, true), themeTitle(m, false)]);
  expect(titles.filter((s) => !(s in RU))).toEqual([]);
});

test('Russian lines keep the placeholders of their English text', () => {
  // a placeholder may repeat in the plural forms of a line, so each counts once
  const ph = (s: string) => Array.from(new Set(s.match(/\{\w+\}/g) ?? [])).sort().join(',');
  const wrong = Object.keys(RU).filter((k) => ph(k) !== ph(RU[k]!));
  expect(wrong).toEqual([]);
});
