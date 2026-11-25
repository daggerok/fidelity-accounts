/// <reference lib="esnext" />
// Numbers the screens show for the chosen scope (all accounts, a group, one account), computed from the dataset only
import type { Account, Dataset, Position } from '../../shared/model';
import { incomeReceived, type TxnStore } from '../../shared/transactions';
import type { Scope } from './prefs';
import { addDays, addMonths } from '../../shared/dates';

export { addMonths };

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

/**
 * The owner's own order (owner 2026-11-24): groups move as a whole with their accounts, accounts move inside their
 * group; accounts in `order` come by its index, the rest keep the site's order after them
 */
export function orderAccounts(ds: Dataset, order: string[], groupOrder: string[] = []): Dataset {
  if (!order.length && !groupOrder.length) return ds;
  // groups: the owner's order first (dragged as a whole), the rest by their first account on the site
  const siteRank = new Map<string, number>();
  ds.accounts.forEach((a, i) => { if (!siteRank.has(a.group)) siteRank.set(a.group, i); });
  const groupRank = new Map<string, number>();
  siteRank.forEach((r, g) => { const i = groupOrder.indexOf(g); groupRank.set(g, i < 0 ? groupOrder.length + r : i); });
  const at = (a: Account) => { const i = order.indexOf(a.number); return i < 0 ? order.length + ds.accounts.indexOf(a) : i; };
  const accounts = ds.accounts.slice().sort((a, b) => (groupRank.get(a.group)! - groupRank.get(b.group)!) || at(a) - at(b));
  return { ...ds, accounts };
}

/** drop group `moved` right before group `target`; the new full order of group names */
export function moveGroup(groups: string[], moved: string, target: string): string[] {
  const list = groups.filter((g) => g !== moved);
  const i = list.indexOf(target);
  list.splice(i < 0 ? list.length : i, 0, moved);
  return list;
}

/** drop `moved` right before `target` and return the new full order of account numbers */
export function moveAccount(accounts: Account[], moved: string, target: string): string[] {
  const list = accounts.map((a) => a.number).filter((n) => n !== moved);
  const i = list.indexOf(target);
  list.splice(i < 0 ? list.length : i, 0, moved);
  return list;
}

/** the folded mark of All accounts in `Prefs.collapsed`; group names mark folded groups */
export const ALL_FOLD = '*';

/**
 * A click on All accounts or a group chip as a button (owner 2026-11-24): folds or unfolds it, the selection stays.
 * All accounts unfolds everything (every group open again) or folds everything; a group folds only its accounts
 */
export function toggleFold(collapsed: string[], name: string): string[] {
  if (name === ALL_FOLD) return collapsed.includes(ALL_FOLD) || collapsed.length ? [] : [ALL_FOLD];
  return collapsed.includes(name) ? collapsed.filter((g) => g !== name) : collapsed.concat(name);
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

/**
 * ETF or stock (owner 2026-11-24: movers of All, ETFs or Stocks): Fidelity's security type Exchange Traded is an ETF,
 * Equity and REITs are stocks; mutual funds and the rest count only in All
 */
export function kindOf(p: Position): 'etf' | 'stock' | 'other' {
  if (p.securityType === 'Exchange Traded') return 'etf';
  if (p.securityType === 'Equity' || /REIT/i.test(p.securitySubType ?? '')) return 'stock';
  return 'other';
}
/** the ETFs and Stocks checkboxes: 'all' = both ticked, 'none' = both clear (also every security), or one of them */
export type Kind = 'all' | 'none' | 'etf' | 'stock';
export const ofKind = (ps: Position[], kind: Kind): Position[] => (kind === 'etf' || kind === 'stock' ? ps.filter((p) => kindOf(p) === kind) : ps);

/** Fidelity's annual income estimate for a filter: the accounts' own (cash interest in it) for every security, the positions' sum for ETFs or Stocks */
export function estAnnualOf(kind: Kind, accountsEstimate: number, ps: Position[]): number {
  return kind === 'etf' || kind === 'stock' ? securities(ofKind(ps, kind)).reduce((x, p) => x + (p.estAnnualIncome ?? 0), 0) : accountsEstimate;
}
/** is the ETFs or the Stocks box ticked */
export const kindOn = (value: Kind, k: 'etf' | 'stock'): boolean => value === 'all' || value === k;
/** one box switched on or off, the other kept (owner 2026-11-24: both or none shows all) */
export function toggleKind(value: Kind, k: 'etf' | 'stock'): Kind {
  const on = { etf: kindOn(value, 'etf'), stock: kindOn(value, 'stock') };
  on[k] = !on[k];
  return on.etf && on.stock ? 'all' : on.etf ? 'etf' : on.stock ? 'stock' : 'none';
}
/** a saved filter value, anything unknown is both ticked */
export const asKind = (v: unknown): Kind => (v === 'none' || v === 'etf' || v === 'stock' ? v : 'all');

export const ACCOUNT_SORTS = ['mine', 'value', 'todayUsd', 'todayPct', 'totalUsd', 'totalPct'] as const;
export type AccountSort = (typeof ACCOUNT_SORTS)[number];

/** the Accounts card order (owner 2026-11-23): by value, or by today's or total P&L in $ or %; largest first */
export function sortAccounts(accounts: Account[], by: AccountSort): Account[] {
  if (by === 'mine') return accounts.slice(); // the order of the accounts bar
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

/** the owner's calendar date (local time), ISO */
export function localToday(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/**
 * Ex-dividend dates from today on, soonest first; one line per symbol with `payout` = dividend per share times the
 * shares held in the shown accounts (owner 2026-11-23: "my value of dividends, not per share"). An estimate: the shares
 * held on the ex-date decide
 */
export type Upcoming = Position & { shares: number; payout?: number };
export function upcomingDividends(ps: Position[], today: string, last = addDays(today, 30)): Upcoming[] {
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

/**
 * How far the Upcoming dividends card looks ahead (owner 2026-11-24: "MTD 1M QTD 3M like we have on Balance", MTD by
 * default): to the end of this month, a month from today, to the end of this quarter, three months from today
 */
export const DIV_WINDOWS = ['MTD', '1M', 'QTD', '3M'] as const;
export type DivWindow = (typeof DIV_WINDOWS)[number];
export const asDivWindow = (v: unknown): DivWindow => ((DIV_WINDOWS as readonly unknown[]).indexOf(v) >= 0 ? (v as DivWindow) : 'MTD');
export function windowEnd(today: string, w: DivWindow): string {
  if (w === '1M') return addMonths(today, 1);
  if (w === '3M') return addMonths(today, 3);
  const b = periodBounds(today);
  return w === 'MTD' ? b.month[1] : b.quarter[1];
}

/** the sum of the payouts of a list of upcoming dividends */
export const payoutTotal = (rows: Upcoming[]): number => Math.round(rows.reduce((x, r) => x + (r.payout ?? 0), 0) * 100) / 100;

const STEP_MONTHS: Record<string, number> = { Monthly: 1, Quarterly: 3, 'Semi-annually': 6, Annually: 12 };

/** the smallest piece DRIP buys: Fidelity reinvests in fractional shares to 3 decimal places */
export const DRIP_MIN = 0.001;
/** the dividend per share of one payment: Fidelity's own, else the estimated annual income split by the payments a year */
export function perPayment(p: Position): number | undefined {
  if (p.dividendAmount !== undefined) return p.dividendAmount;
  const step = STEP_MONTHS[p.paymentFrequency ?? ''];
  return step && p.estAnnualIncome && p.quantity ? p.estAnnualIncome / p.quantity / (12 / step) : undefined;
}
/**
 * DRIP and DRIP $ of the positions table (owner 2026-11-24): how many shares, or dollars at the last price, to buy so the
 * next dividend of this position buys at least 0.001 share by DRIP. Plus: buy that much; minus: the next payout already
 * buys 0.001 share or more, the number is how far above that it is. The payout is taken in whole cents rounded down and
 * the need is rounded up (to 0.001 share, to a cent), so a plus bought is always enough. null: no dividend or no price
 */
export interface Drip { shares: number; usd: number }
export function dripGap(p: Position): Drip | null {
  const price = p.lastPrice;
  const per = perPayment(p);
  if (p.kind !== 'position' || !price || price <= 0 || !per || per <= 0) return null;
  const cash = Math.ceil(DRIP_MIN * price * 100 - 1e-9) / 100; // the cents that buy 0.001 share
  const gap = cash / per - (p.quantity ?? 0);
  const up = (x: number, k: number) => Math.ceil(x * k - 1e-9) / k;
  const near = (x: number, k: number) => Math.round(x * k) / k || 0; // || 0: no "-0"
  return gap > 0 ? { shares: up(gap, 1000), usd: up(gap * price, 100) } : { shares: near(gap, 1000), usd: near(gap * price, 100) };
}

/** the calendar month, quarter and year around `today`, first and last day */
export function periodBounds(today: string): { month: [string, string]; quarter: [string, string]; year: [string, string] } {
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  const q = Math.floor((m - 1) / 3) * 3 + 1;
  const iso = (yy: number, mm: number, dd: number) => new Date(Date.UTC(yy, mm - 1, dd)).toISOString().slice(0, 10);
  return { month: [iso(y, m, 1), iso(y, m + 1, 0)], quarter: [iso(y, q, 1), iso(y, q + 3, 0)], year: [iso(y, 1, 1), iso(y, 12, 31)] };
}

/**
 * Dividends paid and still to come in [from, to] (owner 2026-11-24: Income 1Q and 1M, "will/was in total this current
 * Q/month"). Fidelity gives one pay date per position (the last or the next) and the frequency; the other pay dates are
 * that date stepped by the frequency, each paying the dividend per share times the shares held now. An estimate: past
 * payments come from the shares held today until the transactions history is read
 */
export function incomeIn(ps: Position[], from: string, to: string, today: string): { paid: number; coming: number; total: number } {
  let paid = 0;
  let coming = 0;
  securities(ps).forEach((p) => {
    if (p.dividendAmount === undefined || !p.payDate || !p.quantity) return;
    const amount = p.dividendAmount * p.quantity;
    const step = STEP_MONTHS[p.paymentFrequency ?? ''];
    const dates = step ? Array.from({ length: 2 * Math.ceil(24 / step) + 1 }, (_, i) => addMonths(p.payDate!, (i - Math.ceil(24 / step)) * step)) : [p.payDate];
    dates.forEach((d) => {
      if (d < from || d > to) return;
      if (d <= today) paid += amount; else coming += amount;
    });
  });
  const r = (x: number) => Math.round(x * 100) / 100;
  return { paid: r(paid), coming: r(coming), total: r(paid + coming) };
}

/**
 * One upcoming payout split by account (owner 2026-11-24: one line per account, named, in the order of the Accounts
 * card): the account's shares of the symbol and its part of the payout
 */
export interface PayoutPart { account: Account; shares: number; payout?: number }
export function payoutParts(ps: Position[], accounts: Account[], u: Upcoming): PayoutPart[] {
  return accounts
    .map((a) => {
      const shares = securities(ps).filter((p) => p.account === a.number && p.symbol === u.symbol).reduce((x, p) => x + (p.quantity ?? 0), 0);
      return { account: a, shares, payout: u.dividendAmount !== undefined ? Math.round(u.dividendAmount * shares * 100) / 100 : undefined };
    })
    .filter((x) => x.shares > 0);
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

/**
 * The big 52-week table (owner 2026-11-24: "more info here"): one row per symbol over the shown accounts, shares, value
 * and total gain summed; where the price sits in the range and how far it is from the high and the low, in %
 */
export interface RangeRow { symbol: string; description: string; sector?: string; low52: number; high52: number; lastPrice: number; dayPct?: number; pos: number; fromHigh: number; fromLow: number; shares: number; value: number; totalGl: number; totalGlPct: number | null }
export function rangeRows(ps: Position[]): RangeRow[] {
  const by = new Map<string, RangeRow & { cost: number }>();
  ps.forEach((p) => {
    const pos = rangePos(p);
    if (pos === null) return;
    const cur = by.get(p.symbol);
    if (cur) {
      cur.shares += p.quantity ?? 0; cur.value += p.currentValue ?? 0; cur.totalGl += p.totalGl ?? 0; cur.cost += p.costBasisTotal ?? 0;
      return;
    }
    by.set(p.symbol, {
      symbol: p.symbol, description: p.description, sector: p.sector, low52: p.low52!, high52: p.high52!, lastPrice: p.lastPrice!, dayPct: p.lastPriceChangePct,
      pos, fromHigh: (p.lastPrice! / p.high52! - 1) * 100, fromLow: p.low52! > 0 ? (p.lastPrice! / p.low52! - 1) * 100 : 0,
      shares: p.quantity ?? 0, value: p.currentValue ?? 0, totalGl: p.totalGl ?? 0, cost: p.costBasisTotal ?? 0, totalGlPct: null,
    });
  });
  return Array.from(by.values()).map(({ cost, ...r }) => ({ ...r, totalGlPct: cost > 0 ? (r.totalGl / cost) * 100 : null }));
}

/** the positions table order; text columns sort by text, the rest by number, empty last */
/** columns that sort by a computed value, not by their own field: the 52-week range sorts by where the price sits in it,
 * DRIP and DRIP $ by the gap */
const SORT_VALUES: Record<string, (p: Position) => number | undefined> = {
  high52: (p) => rangePos(p) ?? undefined,
  drip: (p) => dripGap(p)?.shares,
  dripUsd: (p) => dripGap(p)?.usd,
};

export function sortPositions(ps: Position[], key: string, dir: 1 | -1): Position[] {
  const computed = SORT_VALUES[key];
  const val = (p: Position): string | number | undefined => (computed ? computed(p) : (p as unknown as Record<string, string | number | undefined>)[key] ?? (p.fields[key] as string | number | undefined));
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

/**
 * Income of a period as facts and plan (owner 2026-11-24: "we want to know facts and what is planned and then see how
 * facts aligned in progress with planned"): received = the dividends and interest paid in, from the transactions
 * history (null until every shown account was read); planned = received + what still comes at today's holdings.
 * ETFs or Stocks keep the rows whose symbol is held as that kind; a symbol no longer held counts for every security only
 */
export interface IncomeFacts { received: number | null; coming: number; planned: number }
export function incomeFacts(store: TxnStore | null, accounts: Account[], ps: Position[], kind: Kind, from: string, to: string, today: string): IncomeFacts {
  const est = incomeIn(ofKind(ps, kind), from, to, today);
  const coming = est.coming;
  const nums = accounts.map((a) => a.number);
  // no facts yet: the plan is the whole period at today's holdings, as before the history was read
  if (!store || !nums.length || nums.some((n) => !store.synced[n])) return { received: null, coming, planned: est.total };
  const kinds = new Map(securities(ps).map((p) => [p.symbol, kindOf(p)] as [string, ReturnType<typeof kindOf>]));
  const keep = kind === 'etf' || kind === 'stock' ? (t: { symbol: string }) => kinds.get(t.symbol) === kind : () => true;
  const received = incomeReceived(store.rows, new Set(nums), from, today < to ? today : to, keep);
  return { received, coming, planned: Math.round((received + coming) * 100) / 100 };
}
