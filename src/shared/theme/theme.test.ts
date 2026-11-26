/// <reference types="bun" />
/// <reference types="node" />
/// <reference lib="esnext" />
import { describe, expect, test } from 'bun:test';
import { DEFAULT_PALETTE, DEFAULT_THEME_MODE, PALETTES, PALETTE_KEY, THEME_KEY, isDarkTheme, isThemeMode, nextThemeMode, readPalette, readThemeMode, savePalette, saveThemeMode, themeIcon, themeTitle } from './index';

const memory = (init: Record<string, string> = {}) => {
  const m = new Map(Object.entries(init));
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
};

describe('theme', () => {
  test('cycles light -> dark -> system -> light', () => {
    expect(nextThemeMode('light')).toBe('dark');
    expect(nextThemeMode('dark')).toBe('system');
    expect(nextThemeMode('system')).toBe('light');
  });

  test('dark only for dark, or system when the OS is dark', () => {
    expect(isDarkTheme('light', true)).toBe(false);
    expect(isDarkTheme('dark', false)).toBe(true);
    expect(isDarkTheme('system', true)).toBe(true);
    expect(isDarkTheme('system', false)).toBe(false);
  });

  test('icon shows the theme in use, system shows the current one with A', () => {
    expect(themeIcon('light', true)).toEqual({ icon: '☀', auto: false });
    expect(themeIcon('dark', false)).toEqual({ icon: '🌙', auto: false });
    expect(themeIcon('system', true)).toEqual({ icon: '🌙', auto: true });
    expect(themeIcon('system', false)).toEqual({ icon: '☀', auto: true });
  });

  test('title names the next mode', () => {
    expect(themeTitle('light', false)).toContain('Click: dark');
    expect(themeTitle('dark', false)).toContain('Click: system');
    expect(themeTitle('system', true)).toContain('now dark');
  });

  test('storage: default system, junk ignored, throwing storage is safe', () => {
    expect(readThemeMode(undefined)).toBe(DEFAULT_THEME_MODE);
    expect(readThemeMode(memory({ [THEME_KEY]: 'auto' }))).toBe('system');
    expect(readThemeMode(memory({ [THEME_KEY]: 'dark' }))).toBe('dark');
    const boom = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    expect(readThemeMode(boom)).toBe('system');
    expect(() => saveThemeMode(boom, 'dark')).not.toThrow();
    const s = memory();
    saveThemeMode(s, 'light');
    expect(s.m.get(THEME_KEY)).toBe('light');
    expect(isThemeMode('nope')).toBe(false);
  });
});

describe('palette', () => {
  test('Fidelity green by default, a stored palette is kept, junk falls back', () => {
    expect(readPalette(memory())).toBe(DEFAULT_PALETTE);
    expect(DEFAULT_PALETTE).toBe('green');
    expect(readPalette(memory({ [PALETTE_KEY]: 'indigo' }))).toBe('indigo');
    expect(readPalette(memory({ [PALETTE_KEY]: 'pink' }))).toBe('green');
    expect(readPalette(undefined)).toBe('green');
    expect(PALETTES).toEqual(['green', 'indigo', 'blue']);
  });

  test('saves the choice', () => {
    const s = memory();
    savePalette(s, 'blue');
    expect(s.m.get(PALETTE_KEY)).toBe('blue');
    expect(readPalette(s)).toBe('blue');
  });
});
