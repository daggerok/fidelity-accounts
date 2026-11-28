/// <reference lib="esnext" />
// Numbers the screens show for the chosen scope (all accounts, a group, one account), computed from the dataset only
import type { Account, Dataset, Position } from '../../shared/model';
import { incomeReceived, type TxnStore } from '../../shared/transactions';
import type { Scope } from './prefs';
import { addDays, addMonths } from '../../shared/dates';
import { perYear } from '../../shared/typed-columns';

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

/**
 * One step of `id` among `order` (the accounts of a group, or the groups) as a drop for moveAccount and moveGroup, which
 * put `moved` right before `target`: a step left drops it before its left neighbour, a step right drops the right
 * neighbour before it. null at either end or for an id not in the list
 */
export function stepMove(order: string[], id: string, step: -1 | 1): [moved: string, target: string] | null {
  const i = order.indexOf(id);
  if (i < 0) return null;
  const other = order[i + step];
  if (other === undefined) return null;
  return step < 0 ? [id, other] : [other, id];
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

/**
 * The name of what is shown, the Balance card's title (owner 2026-11-24: "All accounts" when all are chosen, any other
 * choice named by its accounts, "Elena + Ameliia + Elena ROTH IRA"): nothing or all = `all`, a whole group = its name, up to
 * three accounts = their names joined by " + ", more = `count(n)`
 */
export function scopeTitle(scope: Scope, accounts: Account[], words: { all: string; count: (n: number) => string }): string {
  if (scope === 'none' || scope === 'all') return words.all;
  if (scope.startsWith('group:')) return scope.slice(6);
  return accounts.length <= 3 ? accounts.map((a) => a.name).join(' + ') : words.count(accounts.length);
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

export const ACCOUNT_SORTS = ['mine', 'value', 'todayUsd', 'todayPct', 'totalUsd', 'totalPct', 'beta'] as const;
export type AccountSort = (typeof ACCOUNT_SORTS)[number];

/**
 * The Accounts card order (owner 2026-11-23): by value, or by today's or total P&L in $ or %; largest first. By beta
 * (owner 2026-11-27: "additional sort order called Beta or its symbol"): `betaOf` gives an account's beta, the largest
 * first, an account without one last
 */
export function sortAccounts(accounts: Account[], by: AccountSort, betaOf: (number: string) => number | undefined = () => undefined): Account[] {
  if (by === 'mine') return accounts.slice(); // the order of the accounts bar
  const v = (a: Account): number => (by === 'beta' ? betaOf(a.number) : by === 'value' ? a.balance : by === 'todayUsd' ? a.todayGl : by === 'todayPct' ? a.todayGlPct : by === 'totalUsd' ? a.totalGl : a.totalGlPct) ?? -Infinity;
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
  // only ex dates still ahead (owner 2026-11-27: "if ex.dividends or payment date is today, this info is useless
  // because we should be buying before today, so show only if ... in future"): today's ex date can no longer be bought
  const due = securities(ps).filter((p) => p.exDate && p.exDate > today && p.exDate <= last);
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
 * default; then 3M named 1Q): to the end of this month, a month from today, to the end of this quarter, three months
 * (one quarter) from today
 */
export const DIV_WINDOWS = ['MTD', '1M', 'QTD', '1Q'] as const;
export type DivWindow = (typeof DIV_WINDOWS)[number];
export const asDivWindow = (v: unknown): DivWindow => (v === '3M' ? '1Q' : (DIV_WINDOWS as readonly unknown[]).indexOf(v) >= 0 ? (v as DivWindow) : 'MTD');
export function windowEnd(today: string, w: DivWindow): string {
  if (w === '1M') return addMonths(today, 1);
  if (w === '1Q') return addMonths(today, 3);
  const b = periodBounds(today);
  return w === 'MTD' ? b.month[1] : b.quarter[1];
}

/**
 * What a dividend row says after its ticker (owner 2026-11-27: "TICKER % / payments a year, for example AU 5.59% / 4"):
 * the yield a year and how many times a year it pays. The yield is Fidelity's distribution rate; without it, the
 * dividend per share times the payments a year over the last price. A part that is not known is left out
 */
/** the yield a year in percent: Fidelity's distribution rate, else worked out from the dividend, the frequency and the price */
export function yieldRate(p: Pick<Position, 'distRate' | 'dividendAmount' | 'lastPrice' | 'paymentFrequency'>): number | undefined {
  if (typeof p.distRate === 'number' && Number.isFinite(p.distRate)) return p.distRate;
  const times = perYear(p.paymentFrequency ?? '');
  const worked = Number.isFinite(times) && p.dividendAmount !== undefined && p.lastPrice ? (p.dividendAmount * times * 100) / p.lastPrice : undefined;
  return worked !== undefined && Number.isFinite(worked) ? worked : undefined;
}
export function yieldNote(p: Pick<Position, 'distRate' | 'dividendAmount' | 'lastPrice' | 'paymentFrequency'>): string {
  const times = perYear(p.paymentFrequency ?? '');
  const rate = yieldRate(p);
  return [rate !== undefined ? `${rate.toFixed(2)}%` : '', Number.isFinite(times) ? String(times) : ''].filter(Boolean).join(' / ');
}

/**
 * The order of the Upcoming dividends rows (owner 2026-11-27): by the payout in dollars (the default), the yield, the
 * frequency, the ex date or the pay date, and by several at once: the first chosen orders the rows, the next one only
 * the rows the first left equal, and so on. Listed as the pills stand, left to right; the default is the rightmost
 */
export const DIV_SORTS = ['payDate', 'exDate', 'frequency', 'yield', 'payout'] as const;
export type DivSort = typeof DIV_SORTS[number];
export const DEFAULT_DIV_SORTS: DivSort[] = ['payout'];
// dollars and percent are two views of one thing, the size of the dividend: only one of them is ever chosen
const SIZE_SORTS: readonly DivSort[] = ['payout', 'yield'];
const isSize = (k: DivSort): boolean => SIZE_SORTS.indexOf(k) >= 0;
export function asDivSorts(v: unknown): DivSort[] {
  const out: DivSort[] = [];
  if (Array.isArray(v)) v.forEach((k) => {
    const known = (DIV_SORTS as readonly unknown[]).indexOf(k) >= 0 && out.indexOf(k as DivSort) < 0;
    // a saved list with both sizes (made before they excluded each other) keeps the first of them
    if (known && !(SIZE_SORTS.indexOf(k as DivSort) >= 0 && out.some((o) => SIZE_SORTS.indexOf(o) >= 0))) out.push(k as DivSort);
  });
  return out.length ? out : DEFAULT_DIV_SORTS.slice();
}
/**
 * A click on a pill (owner 2026-11-27): a chosen one is taken out; a new one goes after the chosen ones, except that
 * Dividends $ and Dividends % take each other's place (never both). The frequency and the dates may come before or
 * after the size, in the order they were clicked. With none left the default is back
 */
export function toggleDivSort(sorts: DivSort[], key: DivSort): DivSort[] {
  if (sorts.indexOf(key) >= 0) { const left = sorts.filter((k) => k !== key); return left.length ? left : DEFAULT_DIV_SORTS.slice(); }
  return isSize(key) && sorts.some(isSize) ? sorts.map((k) => (isSize(k) ? key : k)) : sorts.concat(key);
}
// bigger first; a row without the number goes last
const bigFirst = (a: number | undefined, b: number | undefined): number => {
  const x = a !== undefined && Number.isFinite(a), y = b !== undefined && Number.isFinite(b);
  return x && y ? b! - a! : x ? -1 : y ? 1 : 0;
};
// the nearest date after today first, then the later ones; today, a past or a missing date goes last
const soonFirst = (a: string | undefined, b: string | undefined, today: string): number => {
  const x = !!a && a > today, y = !!b && b > today;
  return x && y ? (a! < b! ? -1 : a! > b! ? 1 : 0) : x ? -1 : y ? 1 : 0;
};
const DIV_ORDER: Record<DivSort, (a: Upcoming, b: Upcoming, today: string) => number> = {
  payout: (a, b) => bigFirst(a.payout, b.payout),
  yield: (a, b) => bigFirst(yieldRate(a), yieldRate(b)),
  frequency: (a, b) => bigFirst(perYear(a.paymentFrequency ?? ''), perYear(b.paymentFrequency ?? '')),
  exDate: (a, b, today) => soonFirst(a.exDate, b.exDate, today),
  payDate: (a, b, today) => soonFirst(a.payDate, b.payDate, today),
};
export function sortDividends(rows: Upcoming[], sorts: DivSort[], today: string): Upcoming[] {
  return rows.slice().sort((a, b) => {
    for (let i = 0; i < sorts.length; i++) { const d = DIV_ORDER[sorts[i]!](a, b, today); if (d) return d; }
    return a.symbol < b.symbol ? -1 : a.symbol > b.symbol ? 1 : 0;
  });
}

/**
 * A rate of several positions as one number, for a total row (owner 2026-11-28: "Dist rate and SEC yield would be also
 * good to show similarly to Est. income", "all -- is similar to zero"): the rates weighed by what each position is
 * worth, a security without the rate counting as 0 (it pays nothing, so it pulls the number of the lot down). Cash and
 * pending activity are left out. undefined: no security to weigh
 */
export function weightedRate(ps: Position[], rate: (p: Position) => number | undefined): number | undefined {
  let top = 0;
  let bottom = 0;
  ps.forEach((p) => {
    const value = p.currentValue;
    if (p.kind !== 'position' || typeof value !== 'number' || !(value > 0)) return;
    const r = rate(p);
    if (typeof r === 'number' && Number.isFinite(r)) top += r * value;
    bottom += value;
  });
  return bottom > 0 ? Math.round((top / bottom) * 100) / 100 : undefined;
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
/** the DRIP threshold of a ticker: the shares whose next payment makes the cents that buy 0.001 share, unrounded, and the
 * price; null: no dividend or no price */
function dripNeed(p: Position): { need: number; price: number } | null {
  const price = p.lastPrice;
  const per = perPayment(p);
  if (p.kind !== 'position' || !price || price <= 0 || !per || per <= 0) return null;
  const cash = Math.ceil(DRIP_MIN * price * 100 - 1e-9) / 100; // the cents that buy 0.001 share
  return { need: cash / per, price };
}
// a need rounded up (to 0.001 share, to a cent), so it is always enough; a margin to the nearest
const up = (x: number, k: number) => Math.ceil(x * k - 1e-9) / k;
const near = (x: number, k: number) => Math.round(x * k) / k || 0; // || 0: no "-0"
export function dripGap(p: Position): Drip | null {
  const n = dripNeed(p);
  if (!n) return null;
  const gap = n.need - (p.quantity ?? 0);
  return gap > 0 ? { shares: up(gap, 1000), usd: up(gap * n.price, 100) } : { shares: near(gap, 1000), usd: near(gap * n.price, 100) };
}
/**
 * Min. DRIP and Min. DRIP $ (owner 2026-11-25: "these values are related only to: div frequency, last price and div %, so
 * we can easily calculate minimal needed shares or Dollars amount for certain ticker to have in account for automatic
 * drip"): the fewest shares an account must hold so the next dividend buys 0.001 share, and those shares at the last
 * price. dripGap is this minus the shares held; the same in every account, whatever it holds
 */
export function dripMin(p: Position): Drip | null {
  const n = dripNeed(p);
  return n ? { shares: up(n.need, 1000), usd: up(n.need * n.price, 100) } : null;
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
 * The pay dates of one position inside [from, to], oldest first: its pay date stepped by `step` months up to two years
 * each way (no step: the pay date alone). Only the steps that can land inside are built (the Income card asked for 49
 * dates of a monthly payer three times on every draw): addMonths moves the month by exactly n and only clamps the day
 * inside that month, so step k falls in the month of the pay date + k * step, and the steps whose month lies outside
 * from's to to's month cannot be inside
 */
export function payDatesIn(payDate: string, step: number | undefined, from: string, to: string): string[] {
  if (!step) return payDate >= from && payDate <= to ? [payDate] : [];
  const reach = Math.ceil(24 / step);
  const month = (iso: string) => Number(iso.slice(0, 4)) * 12 + Number(iso.slice(5, 7)) - 1;
  const at = month(payDate);
  const first = Math.max(-reach, Math.ceil((month(from) - at) / step));
  const last = Math.min(reach, Math.floor((month(to) - at) / step));
  const out: string[] = [];
  for (let k = first; k <= last; k += 1) {
    const d = addMonths(payDate, k * step);
    if (d >= from && d <= to) out.push(d);
  }
  return out;
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
    payDatesIn(p.payDate, STEP_MONTHS[p.paymentFrequency ?? ''], from, to).forEach((d) => {
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
export interface PayoutPart { account: Account; shares: number; payout?: number; drip: Drip | null }
/** the securities of `ps` by symbol, each list in the order of `ps`: built once for a table that splits many payouts */
export function securitiesBySymbol(ps: Position[]): Map<string, Position[]> {
  const out = new Map<string, Position[]>();
  securities(ps).forEach((p) => { const list = out.get(p.symbol); if (list) list.push(p); else out.set(p.symbol, [p]); });
  return out;
}
/** `ps`: the positions, or their securitiesBySymbol (the big Upcoming dividends table calls this for every row) */
export function payoutParts(ps: Position[] | Map<string, Position[]>, accounts: Account[], u: Upcoming): PayoutPart[] {
  const held = (ps instanceof Map ? ps.get(u.symbol) : securities(ps).filter((p) => p.symbol === u.symbol)) ?? [];
  return accounts
    .map((a) => {
      const shares = held.filter((p) => p.account === a.number).reduce((x, p) => x + (p.quantity ?? 0), 0);
      // DRIP runs per account: each account's own payout has to buy the 0.001 share
      return { account: a, shares, payout: u.dividendAmount !== undefined ? Math.round(u.dividendAmount * shares * 100) / 100 : undefined, drip: dripGap({ ...u, account: a.number, kind: 'position', quantity: shares }) };
    })
    .filter((x) => x.shares > 0);
}

/**
 * The DRIP of one symbol over its accounts, each account's own dripGap (DRIP runs per account); null when no account can
 * tell (no dividend or price), an account that cannot tell adds nothing. Two ways to add them up:
 * - 'short', the Upcoming dividends rows (owner 2026-11-24: a DRIP column there): what to buy in all the accounts still
 *   short of 0.001 share, summed; when none is short, the smallest margin (the negative closest to zero)
 * - 'all', a merged Positions line (owner 2026-11-25: "when we have merge, we want to aggregate drips similarly like we do
 *   for gains"): every account's number summed, plus and minus alike (+7 and -8 give -1)
 */
export function symbolDrip(parts: { drip: Drip | null }[], add: 'short' | 'all' = 'short'): Drip | null {
  const known = parts.map((p) => p.drip).filter((d): d is Drip => d !== null);
  if (!known.length) return null;
  const summed = add === 'all' ? known : known.filter((d) => d.shares > 0);
  if (!summed.length) return known.reduce((a, d) => (d.shares > a.shares ? d : a));
  // to 0.001 share and to a cent, as dripGap gives each; || 0: no "-0"
  return { shares: Math.round(summed.reduce((x, d) => x + d.shares, 0) * 1000) / 1000 || 0, usd: Math.round(summed.reduce((x, d) => x + d.usd, 0) * 100) / 100 || 0 };
}

/** the smallest order Fidelity takes, in dollars (owner 2026-11-25: "we cannot buy less than for 1$ in Fidelity") */
export const FIDELITY_MIN_BUY_USD = 1;
/**
 * The adjusted columns (owner 2026-11-25: "calculations are the same, but show and calculate actual minimums";
 * 2026-11-27: KO, DRIP 0.01 share at $97.40 is $0.97, "we cannot buy anything for
 * less than 1$, so we must show 0.011 which will cause $1.07"): the buy of DRIP as an order Fidelity takes. Shares
 * worth under a dollar at the last price are raised to the fewest thousandths of a share worth a dollar or more, and
 * the dollars are those shares at that price, rounded up to a cent, so an order of that many dollars buys them all.
 * Nothing to buy and a minus stay as they are
 */
export function adjustedDrip(d: Drip, price: number | undefined): Drip {
  if (!(d.shares > 0) || !price || price <= 0) return d;
  const shares = d.shares * price >= FIDELITY_MIN_BUY_USD ? d.shares : up(FIDELITY_MIN_BUY_USD / price, 1000);
  // the dollars are what to type into a buy order (owner 2026-11-27: "we should paste really needed value, not less
  // than needed"): an order in dollars buys the thousandths of a share those dollars cover and no more, so the amount
  // is those shares at the last price rounded UP to a cent. $1.07 at $97.40 buys 0.010 share, $1.08 buys the 0.011
  return { shares, usd: Math.max(FIDELITY_MIN_BUY_USD, up(shares * price, 100)) };
}
/** Adj. DRIP of a Positions row: a merged line carries its own (each account's order adjusted, then added up: every
 * account buys on its own), a row of one account adjusts its DRIP */
export const rowDripAdj = (p: Position & { drip?: Drip | null; dripAdj?: Drip | null }): Drip | null => {
  if (p.dripAdj !== undefined) return p.dripAdj;
  const d = rowDrip(p);
  return d ? adjustedDrip(d, p.lastPrice) : null;
};
/** Adj. DRIP $: the dollars of that order */
export const rowDripAdjUsd = (p: Position & { drip?: Drip | null; dripAdj?: Drip | null }): number | null => rowDripAdj(p)?.usd ?? null;
/** Adj. min. DRIP (owner 2026-11-27): Min. DRIP as an order Fidelity takes, what to buy from nothing: the threshold,
 * but never shares worth under a dollar */
export const dripMinAdj = (p: Position): Drip | null => { const d = dripMin(p); return d ? adjustedDrip(d, p.lastPrice) : null; };
/** Adj. min. DRIP $: the dollars of that order */
export const dripMinAdjUsd = (p: Position): number | null => dripMinAdj(p)?.usd ?? null;

/** the DRIP of a Positions row: a merged line carries its own (symbolDrip 'all' over its accounts, app/merge.ts), a row
 * of one account works it out (dripGap) */
export const rowDrip = (p: Position & { drip?: Drip | null }): Drip | null => (p.drip !== undefined ? p.drip : dripGap(p));

/** the dollars to buy so every listed dividend reinvests: the plus DRIP $ of the rows summed */
export const dripToBuy = (drips: (Drip | null)[]): number => Math.round(drips.reduce((x, d) => x + (d && d.usd > 0 ? d.usd : 0), 0) * 100) / 100;

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
