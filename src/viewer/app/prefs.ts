/// <reference lib="esnext" />
// What the owner picked in the interface, remembered per browser until reset (owner 2026-11-23: "if other tab was
// opened or dark theme was selected - we must use user selection until reset"): the account or group shown, the main
// tab, the positions sort, column filters and hidden columns. The theme and the language keep their own keys
import { ALL_PERIODS, periodAlias, type Period } from '../../shared/history';
import { createStore } from '../../shared/store';
import { cleanFilters, cleanTypes, type ColumnType } from '../../shared/typed-columns';
import { NEW_COLUMNS_BY_V, NEW_COLUMN_KEYS } from './position-columns';
import { ACCOUNT_SORTS, asDivWindow, asKind, type AccountSort, type DivWindow, type Kind } from './derive';

export const MAIN_TABS = ['summary', 'positions'] as const;
export type MainTab = (typeof MAIN_TABS)[number];

// 'all', 'none', 'group:<name>', 'account:<number>' or 'set:<number>,<number>'
export type Scope = string;

export interface Prefs {
  scope: Scope;
  tab: MainTab;
  sort: { key: string; dir: 1 | -1 };
  search: string; // the filter of the Symbol column (symbol or name)
  filters: Record<string, string>; // the filters of the other positions columns, by column key (src/shared/typed-columns.ts)
  types: Record<string, ColumnType>; // column types the owner set with the header badge; the rest are detected
  hidden: string[]; // positions columns switched off
  columnsV: number; // the columns list version seen: the columns added after it start hidden once (COLUMNS_V)
  columns: string[]; // the owner's order of the positions columns (src/viewer/app/columns.ts)
  period: Period; // the balance chart's period
  views: Record<string, 'bars' | 'pie'>; // each allocation card its own view (owner 2026-11-23: not one global switch)
  moversBy: 'pct' | 'usd'; // top and bottom movers by % or $
  moversOf: Kind; // the movers of every security, only ETFs or only stocks
  incomeOf: Kind; // the income of every security, only ETFs or only stocks
  dividendsOf: Kind; // the upcoming ex-dividend dates of every security, ETFs or stocks
  dividendsWindow: DivWindow; // how far the upcoming dividends look ahead
  accountSort: AccountSort; // the Accounts card order
  accountOrder: string[]; // the owner's own order of accounts (dragged in the accounts bar)
  groupOrder: string[]; // the owner's own order of groups (dragged as a whole)
  collapsed: string[]; // folded groups in the accounts bar, '*' = All accounts folded
  merge: boolean; // Positions of several accounts as one line per ticker (app/merge.ts)
}

export const DEFAULT_PREFS: Prefs = { scope: 'all', tab: 'summary', sort: { key: 'todayGlPct', dir: -1 }, search: '', filters: {}, types: {}, hidden: NEW_COLUMN_KEYS.slice(), columnsV: 5, columns: [], period: '1Y', views: {}, moversBy: 'pct', moversOf: 'all', incomeOf: 'all', dividendsOf: 'all', dividendsWindow: 'MTD', accountSort: 'mine', accountOrder: [], groupOrder: [], collapsed: [], merge: false };
const KEY = 'fidelity-accounts.prefs';

export function loadPrefs(storage: Pick<Storage, 'getItem'> | undefined = globalThis.localStorage): Prefs {
  try {
    const raw = storage?.getItem(KEY);
    const p = raw ? (JSON.parse(raw) as Partial<Prefs>) : {};
    return {
      ...DEFAULT_PREFS,
      ...p,
      scope: typeof p.scope === 'string' ? p.scope : 'all',
      search: typeof p.search === 'string' ? p.search : '',
      filters: cleanFilters(p.filters),
      types: cleanTypes(p.types),
      tab: (MAIN_TABS as readonly string[]).indexOf(String(p.tab)) >= 0 ? (p.tab as MainTab) : 'summary',
      // the columns added later start hidden once, for a choice saved before them (owner 2026-11-24: all of Fidelity's
      // columns, the table keeps the owner's view)
      hidden: withNewColumns(Array.isArray(p.hidden) ? p.hidden.filter((x): x is string => typeof x === 'string') : [], p.columnsV),
      columnsV: COLUMNS_V,
      columns: Array.isArray(p.columns) ? p.columns.filter((x): x is string => typeof x === 'string') : [],
      period: (ALL_PERIODS as readonly string[]).indexOf(periodAlias(String(p.period))) >= 0 ? (periodAlias(String(p.period)) as Period) : '1Y',
      views: p.views && typeof p.views === 'object' && !Array.isArray(p.views) ? p.views : {},
      moversBy: p.moversBy === 'usd' ? 'usd' : 'pct',
      moversOf: asKind(p.moversOf),
      incomeOf: asKind(p.incomeOf),
      dividendsOf: asKind(p.dividendsOf),
      dividendsWindow: asDivWindow(p.dividendsWindow),
      accountSort: (ACCOUNT_SORTS as readonly string[]).indexOf(String(p.accountSort)) >= 0 ? (p.accountSort as AccountSort) : 'mine',
      accountOrder: Array.isArray(p.accountOrder) ? p.accountOrder.filter((x): x is string => typeof x === 'string') : [],
      groupOrder: Array.isArray(p.groupOrder) ? p.groupOrder.filter((x): x is string => typeof x === 'string') : [],
      collapsed: Array.isArray(p.collapsed) ? p.collapsed.filter((x): x is string => typeof x === 'string') : [],
      merge: p.merge === true,
      sort: p.sort && typeof p.sort.key === 'string' && (p.sort.dir === 1 || p.sort.dir === -1) ? p.sort : DEFAULT_PREFS.sort,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

/** the version of the Positions columns list; a lower stored one hides the columns that came after it */
export const COLUMNS_V = 5;
export function withNewColumns(hidden: string[], v: unknown): string[] {
  const seen = typeof v === 'number' ? v : 1;
  const added = Object.keys(NEW_COLUMNS_BY_V).map(Number).filter((n) => n > seen).reduce<string[]>((all, n) => all.concat(NEW_COLUMNS_BY_V[n]!), []);
  return hidden.concat(added.filter((k) => hidden.indexOf(k) < 0));
}

export const prefs = createStore<Prefs>(loadPrefs());
prefs.subscribe(() => {
  try { globalThis.localStorage?.setItem(KEY, JSON.stringify(prefs.get())); } catch { /* private window */ }
});

export const setPrefs = (p: Partial<Prefs>): void => prefs.set({ ...prefs.get(), ...p });

// what "Reset view" clears: the look and the remembered choices, never the setup (owner 2026-11-23)
export const VIEW_KEYS = [KEY, 'fidelity-accounts.strip-scroll', 'fidelity-accounts-theme', 'fidelity-accounts-palette', 'fidelity-accounts.lang', 'fidelity-accounts-panel-settings', 'fidelity-accounts-settings-sections', 'fidelity-accounts-badge-minimized'];

/** Reset view: account, tab, sort, columns, theme, language and open panels back to their defaults; the page reloads */
export function resetView(storage: Pick<Storage, 'removeItem'> | undefined = globalThis.localStorage, reload: () => void = () => location.reload()): void {
  try { VIEW_KEYS.forEach((k) => storage?.removeItem(k)); } catch { /* private window */ }
  reload();
}
