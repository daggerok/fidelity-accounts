/// <reference types="bun" />
/// <reference types="node" />
/// <reference lib="esnext" />
// The inline <head> script of src/index.html must agree with shared/theme for every stored value and OS setting
import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PALETTE_KEY, THEME_KEY, isDarkTheme, readPalette, readThemeMode } from '../shared/theme';

const html = readFileSync(join(__dirname, 'index.html'), 'utf8');
const code = html.match(/<script id="theme-boot">([\s\S]*?)<\/script>/)![1]!;

test('inline theme boot = shared/theme', () => {
  for (const stored of [null, 'light', 'dark', 'system', 'junk']) {
    for (const sys of [false, true]) {
      const classes = new Set<string>();
      const dataset: Record<string, string> = {};
      const store = { getItem: (k: string) => (k === THEME_KEY ? stored : null), setItem() {} };
      const fakeWindow = { matchMedia: () => ({ matches: sys }) };
      const fakeDocument = { documentElement: { classList: { toggle: (c: string, on: boolean) => (on ? classes.add(c) : classes.delete(c)) }, dataset } };
      new Function('localStorage', 'window', 'document', code)(store, fakeWindow, fakeDocument);
      const mode = readThemeMode(store);
      expect(classes.has('dark')).toBe(isDarkTheme(mode, sys));
      expect(dataset.themeMode).toBe(mode);
    }
  }
});

test('inline palette boot = shared/theme', () => {
  for (const stored of [null, 'green', 'indigo', 'blue', 'junk']) {
    const dataset: Record<string, string> = {};
    const store = { getItem: (k: string) => (k === PALETTE_KEY ? stored : null), setItem() {} };
    const fakeDocument = { documentElement: { classList: { toggle() {} }, dataset } };
    new Function('localStorage', 'window', 'document', code)(store, { matchMedia: () => ({ matches: false }) }, fakeDocument);
    expect(dataset.palette).toBe(readPalette(store));
  }
});
