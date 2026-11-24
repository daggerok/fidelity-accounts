/// <reference types="bun" />
/// <reference types="node" />
/// <reference lib="esnext" />
import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { userscriptHeader } from './header';

test('header: markers, version, matches, grants; localhost only in the dev build; no secrets', () => {
  const h = userscriptHeader('1.2.3');
  expect(h.startsWith('// ==UserScript==')).toBe(true);
  expect(h).toContain('// ==/UserScript==');
  expect(h).toContain('@version      1.2.3');
  expect(h).toContain('@match        https://digital.fidelity.com/ftgw/digital/portfolio/*');
  expect(h).toContain('@match        https://digital.fidelity.com/prgw/digital/login/*');
  expect(h).toContain('@match        https://daggerok.github.io/fidelity-accounts/*');
  expect(h).toContain('@updateURL    https://daggerok.github.io/fidelity-accounts/fidelity-accounts-sync.user.js');
  expect(h).not.toContain('localhost');
  expect(userscriptHeader('1.2.3', true)).toContain('@match        http://localhost:1237/*');
  expect(h).not.toMatch(/token|secret|password/i);
  // every GM_* the code calls is granted
  const src = ['main.ts', 'gm.ts', 'sheets-gm.ts', 'inject.ts'].map((f) => readFileSync(join(__dirname, f), 'utf8')).join('\n');
  const used = Array.from(new Set(src.match(/\bGM_[A-Za-z]+/g) ?? []));
  used.forEach((g) => expect(h).toContain(`@grant        ${g}`));
});
