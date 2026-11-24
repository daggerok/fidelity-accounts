/// <reference lib="esnext" />
// What the owner picked in the interface, remembered per browser until reset (owner 2026-11-23: "if other tab was
// opened or dark theme was selected - we must use user selection until reset"): the account or group shown, the main
// tab, the positions sort, search and hidden columns. The theme and the language keep their own keys
import { createStore } from '../../shared/store';

export const MAIN_TABS = ['summary', 'positions'] as const;
export type MainTab = (typeof MAIN_TABS)[number];

// 'all', 'group:<name>' or 'account:<number>'
export type Scope = string;

export interface Prefs {
  scope: Scope;
  tab: MainTab;
  sort: { key: string; dir: 1 | -1 };
  search: string;
  hidden: string[]; // positions columns switched off
}

export const DEFAULT_PREFS: Prefs = { scope: 'all', tab: 'summary', sort: { key: 'todayGlPct', dir: -1 }, search: '', hidden: [] };
const KEY = 'fidelity-accounts.prefs';

export function loadPrefs(storage: Pick<Storage, 'getItem'> | undefined = globalThis.localStorage): Prefs {
  try {
    const raw = storage?.getItem(KEY);
    const p = raw ? (JSON.parse(raw) as Partial<Prefs>) : {};
    return {
      ...DEFAULT_PREFS,
      ...p,
      tab: (MAIN_TABS as readonly string[]).indexOf(String(p.tab)) >= 0 ? (p.tab as MainTab) : 'summary',
      hidden: Array.isArray(p.hidden) ? p.hidden : [],
      sort: p.sort && typeof p.sort.key === 'string' && (p.sort.dir === 1 || p.sort.dir === -1) ? p.sort : DEFAULT_PREFS.sort,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

export const prefs = createStore<Prefs>(loadPrefs());
prefs.subscribe(() => {
  try { globalThis.localStorage?.setItem(KEY, JSON.stringify(prefs.get())); } catch { /* private window */ }
});

export const setPrefs = (p: Partial<Prefs>): void => prefs.set({ ...prefs.get(), ...p });

/** every remembered choice back to its default (⚙️ Reset view); theme and language too */
export function resetPrefs(): void {
  prefs.set(DEFAULT_PREFS);
  try {
    ['fidelity-accounts-theme', 'fidelity-accounts.lang'].forEach((k) => globalThis.localStorage?.removeItem(k));
  } catch { /* private window */ }
}
