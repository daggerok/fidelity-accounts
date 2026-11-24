/// <reference lib="esnext" />
// Daily account values, the data of Fidelity's own balance chart: POST /ftgw/digital/portfolio/api/BalanceHistory
// { range, acctList: [{ acctNum, acctType }] } -> { balHistoryDetail: { balances: [{ value, date: "MM/DD/YYYY" }] } }.
// Range 3Y = since the account opened (seen live 2026-11-23), 1M for the daily top-up. One series per account; a scope
// of several accounts is their sum by date. Periods (owner 2026-11-23): 1D..3Y, cut from the daily series
import { addDays, addMonths } from './dates';
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
// the card's short list, in its order (owner 2026-11-24: no 1Q there, 3M is the same; QTD between 1M and 3M)
export const PERIODS = ['1D', '3D', 'WTD', '1W', '3W', 'MTD', '1M', 'QTD', '3M', '6M', '3Q', 'YTD', '1Y', '3Y'] as const;
/** the zoomed chart has room for every step (owner 2026-11-24: 2D 2W 2M 4M 5M 7M..11M 2Q 2Y too), shortest first */
// 2Q is 6M and 3Q is 9M: one chip each, 6M/2Q and 9M/3Q (owner 2026-11-24)
export const ALL_PERIODS = ['1D', '2D', '3D', 'WTD', '1W', '2W', '3W', 'MTD', '1M', '2M', '3M', 'QTD', '1Q', '4M', '5M', '6M', '7M', '8M', '3Q', '10M', '11M', 'YTD', '1Y', '2Y', '3Y'] as const;
const LABELS: Partial<Record<string, string>> = { '6M': '6M/2Q', '3Q': '9M/3Q' };
/** the chip text of a period: the big chart names both (6M/2Q), the card the months only (6M, 9M) */
export const periodLabel = (p: string, short = false): string => (short ? (p === '3Q' ? '9M' : p) : LABELS[p] ?? p);
/** the card's chips: the short list, plus the period picked in the big chart when it is not on it, at its place */
export function cardPeriods(current: string): string[] {
  const list: string[] = [...PERIODS];
  if (list.includes(current)) return list;
  const at = ALL_PERIODS.indexOf(current as (typeof ALL_PERIODS)[number]);
  const next = list.findIndex((p) => ALL_PERIODS.indexOf(p as (typeof ALL_PERIODS)[number]) > at);
  list.splice(next < 0 ? list.length : next, 0, current);
  return list;
}
/** a period saved before the merge */
export const periodAlias = (p: string): string => (p === '2Q' ? '6M' : p === '9M' ? '3Q' : p);
export type Period = (typeof ALL_PERIODS)[number];

const utc = (s: string) => new Date(`${s}T00:00:00Z`);
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
  if (period === 'WTD') before = addDays(lastDate, -((d.getUTCDay() + 6) % 7));
  else if (period === 'MTD') before = `${lastDate.slice(0, 8)}01`;
  else if (period === 'QTD') before = `${lastDate.slice(0, 5)}${String(Math.floor(d.getUTCMonth() / 3) * 3 + 1).padStart(2, '0')}-01`;
  else if (period === 'YTD') before = `${lastDate.slice(0, 4)}-01-01`;
  else {
    const n = Number(period.slice(0, -1));
    const unit = period.slice(-1);
    const back = unit === 'W' ? addDays(lastDate, -7 * n) : unit === 'M' ? addMonths(lastDate, -n) : unit === 'Q' ? addMonths(lastDate, -3 * n) : addMonths(lastDate, -12 * n);
    before = addDays(back, 1); // on or before `back`
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

/** the balance change of a period of a series; null when the series is too short */
export const periodChange = (series: Point[], period: Period): Change | null => (series.length < 2 ? null : changeOf(periodSlice(series, period)));

/** the value range a chart draws: a flat line gets 1 each way, then 5% of air on both sides */
export function valueRange(values: number[]): { min: number; max: number } {
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (max === min) { max += 1; min -= 1; }
  const span = max - min;
  return { min: min - span * 0.05, max: max + span * 0.05 };
}

/**
 * `n` evenly spaced values along a line (linear between its points), so two lines of different lengths can be blended
 * point by point: the chart morphs from one period to the next (owner 2026-11-24: "smoother than a strict change")
 */
export function resample(values: number[], n: number): number[] {
  if (!values.length || n < 1) return [];
  if (values.length === 1 || n === 1) return Array.from({ length: n }, () => values[0]!);
  return Array.from({ length: n }, (_, i) => {
    const at = (i / (n - 1)) * (values.length - 1);
    const lo = Math.floor(at);
    const hi = Math.min(values.length - 1, lo + 1);
    return values[lo]! + (values[hi]! - values[lo]!) * (at - lo);
  });
}
