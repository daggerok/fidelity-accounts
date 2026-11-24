/// <reference lib="esnext" />
// Daily account values, the data of Fidelity's own balance chart: POST /ftgw/digital/portfolio/api/BalanceHistory
// { range, acctList: [{ acctNum, acctType }] } -> { balHistoryDetail: { balances: [{ value, date: "MM/DD/YYYY" }] } }.
// Range 3Y = since the account opened (seen live 2026-11-23), 1M for the daily top-up. One series per account; a scope
// of several accounts is their sum by date. Periods (owner 2026-11-23): 1D..3Y, cut from the daily series
export interface Point { date: string; value: number } // ISO date, dollars
export type History = Record<string, Point[]>; // account number -> points, oldest first

export const BALANCE_HISTORY_URL = '/ftgw/digital/portfolio/api/BalanceHistory';

/** a BalanceHistory answer -> points (ISO dates, oldest first); anything unreadable -> [] */
export function parseBalanceHistory(json: unknown): Point[] {
  const list = (json as { balHistoryDetail?: { balances?: unknown } } | null)?.balHistoryDetail?.balances;
  if (!Array.isArray(list)) return [];
  const out: Point[] = [];
  list.forEach((b) => {
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String((b as { date?: unknown })?.date ?? ''));
    const v = (b as { value?: unknown })?.value;
    if (m && typeof v === 'number' && Number.isFinite(v)) out.push({ date: `${m[3]}-${m[1]}-${m[2]}`, value: v });
  });
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** stored points + new ones; a date seen again takes the new value */
export function mergePoints(prev: Point[], next: Point[]): Point[] {
  const m = new Map(prev.map((p) => [p.date, p.value]));
  next.forEach((p) => m.set(p.date, p.value));
  return Array.from(m.entries()).map(([date, value]) => ({ date, value })).sort((a, b) => (a.date < b.date ? -1 : 1));
}

export function mergeHistory(prev: History | undefined, next: History | undefined): History {
  const out: History = { ...(prev ?? {}) };
  Object.keys(next ?? {}).forEach((k) => { out[k] = mergePoints(out[k] ?? [], next![k]!); });
  return out;
}

/** the sum of several accounts by date: an account counts from its first point on, its last value carried over gaps */
export function combine(history: History | undefined, accounts: string[]): Point[] {
  const series = accounts.map((a) => history?.[a] ?? []).filter((s) => s.length);
  if (!series.length) return [];
  const dates = Array.from(new Set(series.reduce<string[]>((all, s) => all.concat(s.map((p) => p.date)), []))).sort();
  const idx = series.map(() => 0);
  const last: Array<number | null> = series.map(() => null);
  return dates.map((date) => {
    let sum = 0;
    series.forEach((s, i) => {
      while (idx[i]! < s.length && s[idx[i]!]!.date <= date) { last[i] = s[idx[i]!]!.value; idx[i]! += 1; }
      if (last[i] !== null) sum += last[i]!;
    });
    return { date, value: Math.round(sum * 100) / 100 };
  });
}

// owner 2026-11-24: no 2D, 2W, 2M, 2Q, 2Y; 6M for half a year
export const PERIODS = ['1D', '3D', 'WTD', '1W', '3W', 'MTD', '1M', '3M', 'QTD', '1Q', '3Q', '6M', 'YTD', '1Y', '3Y'] as const;
/** the zoomed chart has room for every step (owner 2026-11-24: 2D 2W 2M 4M 5M 7M..11M 2Q 2Y too), shortest first */
export const ALL_PERIODS = ['1D', '2D', '3D', 'WTD', '1W', '2W', '3W', 'MTD', '1M', '2M', '3M', 'QTD', '1Q', '4M', '5M', '2Q', '6M', '7M', '8M', '3Q', '9M', '10M', '11M', 'YTD', '1Y', '2Y', '3Y'] as const;
export type Period = (typeof ALL_PERIODS)[number];

const iso = (d: Date) => d.toISOString().slice(0, 10);
const utc = (s: string) => new Date(`${s}T00:00:00Z`);
// months and years keep the day of the month, clamped to the month's length (Mar 31 minus 1M = Feb 28)
function shift(s: string, days = 0, months = 0, years = 0): string {
  const d = utc(s);
  if (months || years) {
    const total = d.getUTCFullYear() * 12 + d.getUTCMonth() + months + years * 12;
    const y = Math.floor(total / 12);
    const m = total - y * 12;
    const dim = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    d.setUTCFullYear(y, m, Math.min(d.getUTCDate(), dim));
  }
  if (days) d.setUTCDate(d.getUTCDate() + days);
  return iso(d);
}

/**
 * The points of a period, starting at its base point (the close the change is measured from): nD = the last n+1
 * closes; 1W..3Y = the last close on or before that many days, weeks, months, quarters or years back; WTD, MTD, QTD,
 * YTD = the last close before the week (Monday), month, quarter or year began. A series shorter than the period
 * starts at its first point
 */
export function periodSlice(series: Point[], period: Period): Point[] {
  if (series.length < 2) return series.slice();
  const lastDate = series[series.length - 1]!.date;
  const nd = /^(\d+)D$/.exec(period);
  if (nd) return series.slice(Math.max(0, series.length - 1 - Number(nd[1])));
  let before: string; // base = the last point with date < before
  const d = utc(lastDate);
  if (period === 'WTD') before = shift(lastDate, -((d.getUTCDay() + 6) % 7));
  else if (period === 'MTD') before = `${lastDate.slice(0, 8)}01`;
  else if (period === 'QTD') before = `${lastDate.slice(0, 5)}${String(Math.floor(d.getUTCMonth() / 3) * 3 + 1).padStart(2, '0')}-01`;
  else if (period === 'YTD') before = `${lastDate.slice(0, 4)}-01-01`;
  else {
    const n = Number(period.slice(0, -1));
    const unit = period.slice(-1);
    const back = unit === 'W' ? shift(lastDate, -7 * n) : unit === 'M' ? shift(lastDate, 0, -n) : unit === 'Q' ? shift(lastDate, 0, -3 * n) : shift(lastDate, 0, 0, -n);
    before = shift(back, 1); // on or before `back`
  }
  let base = 0;
  for (let i = series.length - 1; i >= 0; i--) { if (series[i]!.date < before) { base = i; break; } }
  return series.slice(base);
}

export interface Change { from: Point; to: Point; change: number; pct: number | null }

/** the change over a slice: last minus first (it includes deposits and withdrawals: a balance change, not a return) */
export function changeOf(slice: Point[]): Change | null {
  if (slice.length < 2) return null;
  const from = slice[0]!;
  const to = slice[slice.length - 1]!;
  const change = Math.round((to.value - from.value) * 100) / 100;
  return { from, to, change, pct: from.value > 0 ? (change / from.value) * 100 : null };
}
