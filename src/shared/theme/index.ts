/// <reference lib="esnext" />
// Theme modes of the toolbar button: light -> dark -> system -> light.
// system follows matchMedia('(prefers-color-scheme: dark)'). Pattern of theme-utils in daggerok/youtube,
// with its clock-based "auto" replaced by the OS setting. The inline script in src/index.html
// repeats isDarkTheme(readThemeMode(...)) in a few lines; tests/theme-inline.test.ts keeps both in step.
export const THEME_MODES = ['light', 'dark', 'system'] as const;
export type ThemeMode = (typeof THEME_MODES)[number];
export const THEME_KEY = 'fidelity-accounts-theme';
export const DEFAULT_THEME_MODE: ThemeMode = 'system';
export const DARK_QUERY = '(prefers-color-scheme: dark)';

export const isThemeMode = (v: unknown): v is ThemeMode => typeof v === 'string' && (THEME_MODES as readonly string[]).indexOf(v) >= 0;

export const nextThemeMode = (m: ThemeMode): ThemeMode => (m === 'light' ? 'dark' : m === 'dark' ? 'system' : 'light');

export const isDarkTheme = (m: ThemeMode, systemDark: boolean): boolean => (m === 'system' ? systemDark : m === 'dark');

// The icon is the theme in use, like every icon switch of the app (owner 2026-11-25: "if I see some button it should
// represent what is enabled"; a sun on the dark page read as "light" while a click went to the system mode): a sun for
// light, a moon for dark, and for system the one the system shows now with an "A" badge. The title says what a click does
export const themeIcon = (m: ThemeMode, systemDark: boolean): { icon: string; auto: boolean } =>
  m === 'system' ? { icon: systemDark ? '🌙' : '☀', auto: true } : { icon: m === 'dark' ? '🌙' : '☀', auto: false };

export const themeTitle = (m: ThemeMode, systemDark: boolean): string =>
  m === 'light'
    ? 'Light theme. Click: dark theme'
    : m === 'dark'
      ? 'Dark theme. Click: system theme'
      : `System theme, now ${systemDark ? 'dark' : 'light'}. Click: light theme`;

type KeyValue = Pick<Storage, 'getItem' | 'setItem'>;

export function readThemeMode(storage: KeyValue | undefined): ThemeMode {
  try {
    const v = storage?.getItem(THEME_KEY);
    return isThemeMode(v) ? v : DEFAULT_THEME_MODE;
  } catch {
    return DEFAULT_THEME_MODE;
  }
}

export function saveThemeMode(storage: KeyValue | undefined, m: ThemeMode): void {
  try {
    storage?.setItem(THEME_KEY, m);
  } catch {
    // private window or blocked storage: the choice lives until reload
  }
}

// Color palettes (owner 2026-11-24, like gex's Color palette): the accent of the whole app, the logo, card titles,
// chips, pills, buttons and focus rings; gains and losses keep their green and red. Fidelity green is ours, Indigo Desk
// the violet of gex and options-desk, Ocean blue the blue of investments (ETFs, Stocks, fidelity-reports). Each palette
// is a set of CSS variables on html[data-palette] (src/viewer/index.css); the inline script of src/viewer/index.html sets
// the attribute before the first paint, theme-inline.test.ts keeps it in step with readPalette
export const PALETTES = ['green', 'indigo', 'blue'] as const;
export type Palette = (typeof PALETTES)[number];
export const PALETTE_KEY = 'fidelity-accounts-palette';
export const DEFAULT_PALETTE: Palette = 'green';

export const isPalette = (v: unknown): v is Palette => typeof v === 'string' && (PALETTES as readonly string[]).indexOf(v) >= 0;

export function readPalette(storage: KeyValue | undefined): Palette {
  try {
    const v = storage?.getItem(PALETTE_KEY);
    return isPalette(v) ? v : DEFAULT_PALETTE;
  } catch {
    return DEFAULT_PALETTE;
  }
}

export function savePalette(storage: KeyValue | undefined, p: Palette): void {
  try {
    storage?.setItem(PALETTE_KEY, p);
  } catch {
    // private window or blocked storage: the choice lives until reload
  }
}
