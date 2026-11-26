/// <reference lib="esnext" />
// Beta of each held security and of an account (owner 2026-11-25: "calculated according to our account positions
// sizes"), all read from Fidelity and measured against the S&P 500 the way Fidelity defines beta: how the security moved
// as the index moved (SPY as the index). Stocks: Fidelity's stock screener (5Y, else 3Y, else 1Y). Everything else (ETFs,
// mutual funds, stocks the screener lacks): our own number from Fidelity's price history, 36 months (at least 12), else
// daily over the last year. Only what has too little history for both falls back to the ETF screener's 3Y beta, which is
// Morningstar's and may be measured against the fund's category index, not the S&P 500 (owner 2026-11-26: "I have a
// feeling that my beta numbers are not so low"). Cash (the core money market) is 0. Framework free: the userscript
// collects, the viewer only reads the fidelity_betas tab
import type { Position } from './model';

export type BetaSource = 'stock5y' | 'stock3y' | 'stock1y' | 'etf3y' | 'calcMonthly' | 'calcDaily' | 'cash';
export const BETA_SOURCES: readonly BetaSource[] = ['stock5y', 'stock3y', 'stock1y', 'etf3y', 'calcMonthly', 'calcDaily', 'cash'];
// months (or days for calcDaily) of returns behind a computed beta
export interface Beta { beta: number; source: BetaSource; months?: number; asOf: string }
export type Betas = Record<string, Beta>;

export const STOCK_SCREENER_URL = 'https://research2.fidelity.com/pi/stock-screener/LoadResults';
export const ETF_SCREENER_URL = 'https://research2.fidelity.com/pi/etf-screener/LoadResults';
export const CHART_URL = 'https://fastquote.fidelity.com/service/marketdata/historical/chart/json';
export const BENCHMARK = 'SPY';
export const SCREEN_BATCH = 100; // tickers per screener request (RowCount 500 below; 1000 answers 0 matches)
export const CHART_BATCH = 10; // symbols per price history request, SPY comes on top
export const MONTHS = 36;
export const MIN_MONTHS = 12;
export const DAYS = 252;
export const MIN_DAYS = 40;

// a symbol worth asking for: letters, digits, a dot or a slash (no CUSIPs of bonds, no plan fund names)
export const askable = (s: string): boolean => /^[A-Z][A-Z0-9./]{0,9}$/.test(s);

export type ScreenerKind = 'stock' | 'etf';
const SCREENERS: Record<ScreenerKind, { fields: string[]; view: string; sort: string; id: string }> = {
  stock: { fields: ['FI.Beta5y', 'FI.Beta3y', 'FI.Beta1y'], view: 'SearchCriteria', sort: 'FI.MarketCap', id: '128' },
  etf: { fields: ['FIETF.BetaMonthEnd3Yr'], view: 'Performance', sort: 'FIETF.NetAssets', id: '252' },
};

/** the form body the screener pages send (jQuery style, ResultFields[] repeated) for one batch of tickers */
export function screenerBody(kind: ScreenerKind, tickers: string[]): string {
  const s = SCREENERS[kind];
  const p = new URLSearchParams();
  s.fields.forEach((f) => p.append('ResultFields[]', f));
  p.append('AjaxId', '1');
  p.append('Criteria', JSON.stringify([{ Clauses: [{ Operator: 'Like', Values: tickers }], Field: 'ticker' }]));
  p.append('ResultView', s.view);
  p.append('FirstRow', '0');
  p.append('RowCount', '500');
  p.append('SortDir', 'D');
  p.append('SortField', s.sort);
  p.append('SortResults', 'true');
  p.append('InitialLoad', 'false');
  p.append('ScreenerId', s.id);
  p.append('SelectedOnlyUserAdded', '0');
  return p.toString();
}

// a result cell's class is its field lowercased without the dot: FI.Beta5y -> fibeta5y
const cellClass = (field: string): string => field.replace(/\./g, '').toLowerCase();
const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const number = (raw: string): number | undefined => {
  const t = raw.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
  if (!t || t === '--') return undefined;
  const n = Number(t.replace(/,/g, ''));
  return Number.isFinite(n) ? n : undefined;
};

/** the `html` of a screener answer (JSON text or object); throws when the answer has another shape */
export function screenerHtml(answer: unknown): string {
  const json = typeof answer === 'string' ? (JSON.parse(answer) as unknown) : answer;
  const html = (json as { html?: unknown } | null)?.html;
  if (typeof html !== 'string') throw new Error('no html in the screener answer');
  return html;
}

/** symbol -> field -> value from the result rows of a screener's html (header rows and "--" cells are skipped) */
export function parseScreenerRows(html: string, fields: string[]): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  html.split(/<tr\b/i).slice(1).forEach((row) => {
    const sym = /data-symbol="([^"]+)"/i.exec(row)?.[1]?.trim().toUpperCase();
    if (!sym) return;
    const vals: Record<string, number> = {};
    fields.forEach((f) => {
      const m = new RegExp(`<td\\b[^>]*class="[^"]*\\b${escapeRe(cellClass(f))}\\b[^"]*"[^>]*>([\\s\\S]*?)</td>`, 'i').exec(row);
      const n = m ? number(m[1]!) : undefined;
      if (n !== undefined) vals[f] = n;
    });
    out[sym] = { ...out[sym], ...vals };
  });
  return out;
}

/** the betas a screener answer gives: stocks 5Y, else 3Y, else 1Y; ETFs 3Y */
export function screenerBetas(kind: ScreenerKind, answer: unknown, asOf: string): Betas {
  const rows = parseScreenerRows(screenerHtml(answer), SCREENERS[kind].fields);
  const out: Betas = {};
  Object.keys(rows).forEach((sym) => {
    const r = rows[sym]!;
    if (kind === 'etf') { if (r['FIETF.BetaMonthEnd3Yr'] !== undefined) out[sym] = { beta: r['FIETF.BetaMonthEnd3Yr'], source: 'etf3y', asOf }; return; }
    const pick: Array<[string, BetaSource]> = [['FI.Beta5y', 'stock5y'], ['FI.Beta3y', 'stock3y'], ['FI.Beta1y', 'stock1y']];
    const hit = pick.find(([f]) => r[f] !== undefined);
    if (hit) out[sym] = { beta: r[hit[0]]!, source: hit[1], asOf };
  });
  return out;
}

/**
 * Class shares: the positions grid says CCCB, the screener knows CCC/B. A ticker of 4+ letters the first pass did not
 * return is asked once more as all but the last letter, a slash, the last letter
 */
export const slashVariant = (sym: string): string | null => (sym.length >= 4 && /^[A-Z]+$/.test(sym) ? `${sym.slice(0, -1)}/${sym.slice(-1)}` : null);

export type BarWidth = 'DAILY' | 'WEEKLY' | 'MONTHLY';
const two = (n: number): string => String(n).padStart(2, '0');
const chartDay = (d: Date, end: boolean): string => `${d.getFullYear()}/${two(d.getMonth() + 1)}/${two(d.getDate())}-${end ? '23:59:59' : '00:00:00'}`;

/** the price history request the quote pages make: several symbols at once, JSONP with `callback` (required) */
export function chartUrl(symbols: string[], from: Date, to: Date, bar: BarWidth, callback = 'cb'): string {
  const q: Array<[string, string]> = [['corpActions', 'Y'], ['timestamp', 'start'], ['symbols', symbols.join(',')], ['startDate', chartDay(from, false)], ['endDate', chartDay(to, true)], ['barWidth', bar], ['extendedHours', 'N'], ['productid', 'researchexperience'], ['callback', callback]];
  return `${CHART_URL}?${q.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')}`;
}

/** the JSON inside a JSONP answer: optional whitespace, name(, JSON, ), optional ; */
export function parseJsonp(text: string): unknown {
  const m = /^\s*[\w$.]+\s*\(([\s\S]*)\)\s*;?\s*$/.exec(text);
  if (!m) throw new Error('the price history answer is not JSONP');
  return JSON.parse(m[1]!) as unknown;
}

export interface Bar { date: string; close: number }
export interface Series { bars: Bar[]; dividends: Record<string, number> } // dividends: ex-date (YYYY-MM-DD) -> cash per share

/** symbol -> its bars (oldest first) and cash dividends; throws when the answer has another shape */
export function parseChart(json: unknown): Record<string, Series> {
  const list = (json as { Symbol?: unknown } | null)?.Symbol;
  if (!Array.isArray(list)) throw new Error('no Symbol list in the price history answer');
  const out: Record<string, Series> = {};
  list.forEach((raw) => {
    const s = raw as { Identifier?: string; RequestedSymbol?: string; BarList?: { BarRecord?: unknown }; CorporateActions?: { CorporateActionsList?: unknown } };
    const sym = String(s.RequestedSymbol || s.Identifier || '').trim().toUpperCase();
    if (!sym) return;
    const recs = Array.isArray(s.BarList?.BarRecord) ? (s.BarList!.BarRecord as Array<{ lt?: string; cl?: string }>) : [];
    const bars: Bar[] = [];
    recs.forEach((b) => {
      const m = /^(\d{4})\/(\d{2})\/(\d{2})/.exec(String(b.lt ?? ''));
      const close = Number(b.cl);
      if (m && Number.isFinite(close) && close > 0) bars.push({ date: `${m[1]}-${m[2]}-${m[3]}`, close });
    });
    bars.sort((a, b) => (a.date < b.date ? -1 : 1));
    const dividends: Record<string, number> = {};
    const acts = Array.isArray(s.CorporateActions?.CorporateActionsList) ? (s.CorporateActions!.CorporateActionsList as Array<{ actionType?: string; rate?: string; exDate?: string }>) : [];
    acts.forEach((a) => {
      // cash dividends only (CD.R regular, other CD.* kinds too); splits and the rest are not income
      if (!/^CD\b/.test(String(a.actionType ?? ''))) return;
      const rate = Number(a.rate);
      const secs = Number(a.exDate);
      if (!Number.isFinite(rate) || rate <= 0 || !Number.isFinite(secs) || secs <= 0) return;
      const day = new Date(secs * 1000).toISOString().slice(0, 10);
      dividends[day] = (dividends[day] ?? 0) + rate;
    });
    out[sym] = { bars, dividends };
  });
  return out;
}

// a period return beyond these is taken for an unadjusted split, not a move, and left out
const SPLIT_GUARD: Record<'MONTHLY' | 'DAILY', [number, number]> = { MONTHLY: [-0.6, 1.5], DAILY: [-0.4, 0.6] };
const prevMonth = (ym: string): string => {
  const y = Number(ym.slice(0, 4));
  const m = Number(ym.slice(5, 7));
  return m === 1 ? `${y - 1}-12` : `${y}-${two(m - 1)}`;
};

/**
 * Total returns by period: (close + cash dividends with their ex-date in the period) / previous close - 1. Monthly:
 * keyed YYYY-MM, only between back to back months; daily: keyed by the day, between neighbouring bars
 */
export function periodReturns(s: Series, bar: 'MONTHLY' | 'DAILY'): Record<string, number> {
  const out: Record<string, number> = {};
  const divs = Object.keys(s.dividends);
  const [lo, hi] = SPLIT_GUARD[bar];
  for (let i = 1; i < s.bars.length; i++) {
    const prev = s.bars[i - 1]!;
    const cur = s.bars[i]!;
    let key: string;
    let paid = 0;
    if (bar === 'MONTHLY') {
      key = cur.date.slice(0, 7);
      if (prevMonth(key) !== prev.date.slice(0, 7)) continue;
      divs.forEach((d) => { if (d.slice(0, 7) === key) paid += s.dividends[d]!; });
    } else {
      key = cur.date;
      divs.forEach((d) => { if (d > prev.date && d <= cur.date) paid += s.dividends[d]!; });
    }
    const r = (cur.close + paid) / prev.close - 1;
    if (r > lo && r < hi) out[key] = r;
  }
  return out;
}

/** cov(r, rIndex) / var(rIndex) over the last `max` periods both have; null under `min` periods or a flat index */
export function regressBeta(r: Record<string, number>, index: Record<string, number>, max: number, min: number): { beta: number; n: number } | null {
  const keys = Object.keys(r).filter((k) => k in index).sort().slice(-max);
  if (keys.length < min) return null;
  const xs = keys.map((k) => index[k]!);
  const ys = keys.map((k) => r[k]!);
  const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
  const mx = mean(xs);
  const my = mean(ys);
  let cov = 0;
  let varx = 0;
  xs.forEach((x, i) => { cov += (x - mx) * (ys[i]! - my); varx += (x - mx) * (x - mx); });
  if (varx <= 0) return null;
  return { beta: cov / varx, n: keys.length };
}

/** our own beta from monthly bars (36 months, at least 12) or daily bars (252 days, at least 40) against SPY */
export function computedBeta(s: Series, index: Series, bar: 'MONTHLY' | 'DAILY', asOf: string): Beta | null {
  const monthly = bar === 'MONTHLY';
  const fit = regressBeta(periodReturns(s, bar), periodReturns(index, bar), monthly ? MONTHS : DAYS, monthly ? MIN_MONTHS : MIN_DAYS);
  return fit ? { beta: fit.beta, source: monthly ? 'calcMonthly' : 'calcDaily', months: fit.n, asOf } : null;
}

export interface BetaMix { beta: number | null; coverage: number; sources: BetaSource[] }

/**
 * One position in the breakdown of a beta: `weight` its share of the value of the positions (signed, so a margin debit
 * is negative; null when they sum to 0), `contribution` what it adds to the beta (the rows with one sum to the beta),
 * null for a position without a beta or when there is no beta to add to
 */
export interface BetaRow { symbol: string; description: string; value: number; weight: number | null; beta: Beta | null; contribution: number | null }
/** the beta with the positions behind it; `missing`: how many of them have no beta */
export interface BetaBreakdown extends BetaMix { rows: BetaRow[]; missing: number }

const CASH_BETA: Beta = { beta: 0, source: 'cash', asOf: '' };

/**
 * The value-weighted beta of some positions and every position behind it (owner 2026-11-26: "check if we did good",
 * the number must be traceable): weights are the current values of the securities and the cash core (pending activity
 * left out), cash counts with beta 0, a security without a beta is left out of both sums. coverage = the share of the
 * value that has a beta (cash included), 0..1. Rows: those with a beta first, then those without, each by value
 */
export function betaBreakdown(positions: Position[], betas: Betas | undefined): BetaBreakdown {
  let total = 0;
  let net = 0;
  let covered = 0;
  let weighted = 0;
  let weight = 0;
  const sources = new Set<BetaSource>();
  const kept: Array<{ p: Position; v: number; b: Beta | null }> = [];
  positions.forEach((p) => {
    if (p.kind === 'pending') return;
    const v = p.currentValue;
    if (typeof v !== 'number' || !Number.isFinite(v)) return;
    total += Math.abs(v);
    net += v;
    const found = p.kind === 'core' ? CASH_BETA : betas?.[p.symbol];
    const b = found && Number.isFinite(found.beta) ? found : null;
    kept.push({ p, v, b });
    if (!b) return;
    covered += Math.abs(v);
    weighted += v * b.beta;
    weight += v;
    sources.add(b.source);
  });
  // no betas read yet, or nothing with a beta: none to show; only cash is a real 0 (cash does not move with the market)
  const beta = betas && weight !== 0 ? weighted / weight : null;
  const rows: BetaRow[] = kept.map(({ p, v, b }) => ({
    symbol: p.symbol,
    description: p.description,
    value: v,
    weight: net !== 0 ? v / net : null,
    beta: b,
    contribution: b && beta !== null ? (v * b.beta) / weight : null,
  }));
  rows.sort((x, y) => (x.beta ? 0 : 1) - (y.beta ? 0 : 1) || y.value - x.value);
  return { beta, coverage: total > 0 ? covered / total : 0, sources: BETA_SOURCES.filter((s) => sources.has(s)), rows, missing: rows.filter((r) => !r.beta).length };
}

/** the beta alone, taken from the breakdown, so the card and its window can never disagree */
export function mixBeta(positions: Position[], betas: Betas | undefined): BetaMix {
  const { beta, coverage, sources } = betaBreakdown(positions, betas);
  return { beta, coverage, sources };
}

/** one account's beta with the positions behind it (the Accounts card and its breakdown window) */
export const accountBreakdown = (positions: Position[], account: string, betas: Betas | undefined): BetaBreakdown => betaBreakdown(positions.filter((p) => p.account === account), betas);
/** the beta of several accounts together (the scope shown) */
export const scopeBeta = (positions: Position[], accounts: string[], betas: Betas | undefined): BetaMix => {
  const set = new Set(accounts);
  return mixBeta(positions.filter((p) => set.has(p.account)), betas);
};

/** a stored or read map: entries with a finite beta and a known source only */
export function cleanBetas(raw: unknown): Betas | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const out: Betas = {};
  Object.keys(raw as object).forEach((k) => {
    const b = (raw as Record<string, Partial<Beta>>)[k];
    if (b && typeof b.beta === 'number' && Number.isFinite(b.beta) && BETA_SOURCES.indexOf(b.source as BetaSource) >= 0) {
      out[k] = { beta: b.beta, source: b.source as BetaSource, asOf: typeof b.asOf === 'string' ? b.asOf : '', ...(typeof b.months === 'number' ? { months: b.months } : {}) };
    }
  });
  return out;
}
