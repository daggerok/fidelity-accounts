/// <reference lib="esnext" />
// Numbers the screens show for the chosen scope (all accounts, a group, one account), computed from the dataset only
import type { Account, Dataset, Position } from '../../shared/model';
import type { Scope } from './prefs';

export interface Group { name: string; accounts: Account[]; balance: number }

/** groups in the site's order (the order the accounts came in) */
export function groupsOf(ds: Dataset): Group[] {
  const out: Group[] = [];
  ds.accounts.forEach((a) => {
    let g = out.find((x) => x.name === a.group);
    if (!g) { g = { name: a.group, accounts: [], balance: 0 }; out.push(g); }
    g.accounts.push(a);
    g.balance += a.balance ?? 0;
  });
  return out;
}

export function accountsIn(ds: Dataset, scope: Scope): Account[] {
  if (scope.startsWith('group:')) return ds.accounts.filter((a) => a.group === scope.slice(6));
  if (scope.startsWith('account:')) return ds.accounts.filter((a) => a.number === scope.slice(8));
  if (scope.startsWith('set:')) { const set = new Set(scope.slice(4).split(',')); return ds.accounts.filter((a) => set.has(a.number)); }
  if (scope === 'none') return [];
  return ds.accounts;
}

/** any set of accounts as the shortest scope: none = 'none', all of them = 'all', exactly a group = 'group:', one = 'account:' */
export function scopeOf(ds: Dataset, numbers: string[]): Scope {
  const set = new Set(numbers.filter((n) => ds.accounts.some((a) => a.number === n)));
  if (!set.size) return 'none';
  if (set.size === ds.accounts.length) return 'all';
  if (set.size === 1) return `account:${Array.from(set)[0]}`;
  const group = groupsOf(ds).find((g) => g.accounts.length === set.size && g.accounts.every((a) => set.has(a.number)));
  if (group) return `group:${group.name}`;
  return `set:${ds.accounts.filter((a) => set.has(a.number)).map((a) => a.number).join(',')}`;
}

/** the account checkbox (owner 2026-11-23: "only Elena and Elena ROTH IRA"): adds or removes one account */
export function toggleAccount(ds: Dataset, scope: Scope, number: string): Scope {
  const now = accountsIn(ds, scope).map((a) => a.number);
  return scopeOf(ds, now.includes(number) ? now.filter((n) => n !== number) : now.concat(number));
}

/** a scope that no longer exists (account closed, other data) falls back to all accounts */
export function validScope(ds: Dataset | null, scope: Scope): Scope {
  if (!ds || scope === 'all') return 'all';
  if (scope === 'none') return 'none';
  return accountsIn(ds, scope).length ? scope : 'all';
}

export interface Totals { balance: number; todayGl: number; todayGlPct: number | null; totalGl: number; totalGlPct: number | null; costBasis: number; estAnnualIncome: number; cash: number; pending: number }

const sum = <T>(xs: T[], f: (x: T) => number | undefined) => xs.reduce((s, x) => s + (f(x) ?? 0), 0);

export function totalsOf(accounts: Account[]): Totals {
  const balance = sum(accounts, (a) => a.balance);
  const todayGl = sum(accounts, (a) => a.todayGl);
  const totalGl = sum(accounts, (a) => a.totalGl);
  const costBasis = sum(accounts, (a) => a.costBasis);
  const start = balance - todayGl;
  return {
    balance, todayGl, totalGl, costBasis,
    todayGlPct: start > 0 ? (todayGl / start) * 100 : null,
    totalGlPct: costBasis > 0 ? (totalGl / costBasis) * 100 : null,
    estAnnualIncome: sum(accounts, (a) => a.estAnnualIncome),
    cash: sum(accounts, (a) => a.cash),
    pending: sum(accounts, (a) => a.pending),
  };
}

export function positionsIn(ds: Dataset, accounts: Account[]): Position[] {
  const set = new Set(accounts.map((a) => a.number));
  return ds.positions.filter((p) => set.has(p.account));
}

export const securities = (ps: Position[]): Position[] => ps.filter((p) => p.kind === 'position');

/**
 * Top and bottom movers of today by % or by $ (owner 2026-11-23: two modes, different tickers by $). One symbol held in
 * several accounts counts once, its dollars summed. The top list goes from the best down; the bottom list ends with the
 * one that lost most, so the worst sits at the very bottom of the card
 */
export function movers(ps: Position[], n = 5, by: 'pct' | 'usd' = 'pct'): { top: Position[]; bottom: Position[] } {
  const bySymbol = new Map<string, Position>();
  securities(ps).forEach((p) => {
    const cur = bySymbol.get(p.symbol);
    if (!cur) bySymbol.set(p.symbol, { ...p });
    else bySymbol.set(p.symbol, { ...cur, todayGl: (cur.todayGl ?? 0) + (p.todayGl ?? 0), currentValue: (cur.currentValue ?? 0) + (p.currentValue ?? 0) });
  });
  const key = (p: Position) => (by === 'usd' ? p.todayGl : p.todayGlPct) ?? 0;
  const list = Array.from(bySymbol.values()).filter((p) => typeof (by === 'usd' ? p.todayGl : p.todayGlPct) === 'number');
  list.sort((a, b) => key(b) - key(a));
  return { top: list.slice(0, n).filter((p) => key(p) > 0), bottom: list.slice(-n).filter((p) => key(p) < 0) };
}

export const ACCOUNT_SORTS = ['value', 'todayUsd', 'todayPct', 'totalUsd', 'totalPct'] as const;
export type AccountSort = (typeof ACCOUNT_SORTS)[number];

/** the Accounts card order (owner 2026-11-23): by value, or by today's or total P&L in $ or %; largest first */
export function sortAccounts(accounts: Account[], by: AccountSort): Account[] {
  const v = (a: Account): number => (by === 'value' ? a.balance : by === 'todayUsd' ? a.todayGl : by === 'todayPct' ? a.todayGlPct : by === 'totalUsd' ? a.totalGl : a.totalGlPct) ?? -Infinity;
  return accounts.slice().sort((a, b) => v(b) - v(a));
}

export interface Slice { name: string; value: number; pct: number }

/** value by a field (sector, security type), largest first; cash is its own slice */
export function allocation(ps: Position[], by: (p: Position) => string | undefined): Slice[] {
  const m = new Map<string, number>();
  ps.forEach((p) => {
    const name = p.kind === 'core' ? 'Cash' : p.kind === 'pending' ? '' : by(p) || 'Other';
    if (!name) return;
    m.set(name, (m.get(name) ?? 0) + (p.currentValue ?? 0));
  });
  const total = Array.from(m.values()).reduce((s, v) => s + v, 0);
  const out: Slice[] = [];
  m.forEach((value, name) => out.push({ name, value, pct: total > 0 ? (value / total) * 100 : 0 }));
  return out.sort((a, b) => b.value - a.value);
}

/**
 * Ex-dividend dates from today on, soonest first; one line per symbol with `payout` = dividend per share times the
 * shares held in the shown accounts (owner 2026-11-23: "my value of dividends, not per share"). An estimate: the shares
 * held on the ex-date decide
 */
export type Upcoming = Position & { shares: number; payout?: number };
export function upcomingDividends(ps: Position[], today: string, days = 30): Upcoming[] {
  const end = new Date(`${today}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() + days);
  const last = end.toISOString().slice(0, 10);
  const due = securities(ps).filter((p) => p.exDate && p.exDate >= today && p.exDate <= last);
  const bySymbol = new Map<string, Upcoming>();
  due.forEach((p) => {
    const cur = bySymbol.get(p.symbol);
    const shares = (cur?.shares ?? 0) + (p.quantity ?? 0);
    const first = !cur || p.exDate! < cur.exDate! ? p : cur;
    bySymbol.set(p.symbol, { ...first, shares });
  });
  return Array.from(bySymbol.values())
    .map((u) => ({ ...u, payout: u.dividendAmount !== undefined ? Math.round(u.dividendAmount * u.shares * 100) / 100 : undefined }))
    .sort((a, b) => (a.exDate! < b.exDate! ? -1 : a.exDate! > b.exDate! ? 1 : 0));
}

/** where the last price sits in the 52-week range, 0..1, or null */
export function rangePos(p: Position): number | null {
  if (p.low52 === undefined || p.high52 === undefined || p.lastPrice === undefined || p.high52 <= p.low52) return null;
  return Math.min(1, Math.max(0, (p.lastPrice - p.low52) / (p.high52 - p.low52)));
}

/** near a 52-week high or low (within `within` of the range) */
export function near52(ps: Position[], within = 0.03): { highs: Position[]; lows: Position[] } {
  const s = securities(ps);
  return {
    highs: s.filter((p) => { const r = rangePos(p); return r !== null && r >= 1 - within; }),
    lows: s.filter((p) => { const r = rangePos(p); return r !== null && r <= within; }),
  };
}

/** the positions table order; text columns sort by text, the rest by number, empty last */
export function sortPositions(ps: Position[], key: string, dir: 1 | -1): Position[] {
  const val = (p: Position): string | number | undefined => (p as unknown as Record<string, string | number | undefined>)[key] ?? (p.fields[key] as string | number | undefined);
  return ps.slice().sort((a, b) => {
    const x = val(a);
    const y = val(b);
    if (x === undefined || x === '') return y === undefined || y === '' ? 0 : 1;
    if (y === undefined || y === '') return -1;
    if (typeof x === 'number' && typeof y === 'number') return (x - y) * dir;
    return String(x).localeCompare(String(y)) * dir;
  });
}

export function matches(p: Position, q: string): boolean {
  const s = q.trim().toLowerCase();
  return !s || p.symbol.toLowerCase().includes(s) || p.description.toLowerCase().includes(s);
}
