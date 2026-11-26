/// <reference lib="esnext" />
// The beta of every held symbol, once a day after the other daily reads (shared/beta.ts has the rules). READ ONLY:
// three reads of Fidelity's research pages with the owner's session, through GM_xmlhttpRequest (another origin than
// digital.fidelity.com), and nothing else is ever asked from here (`betaAllowed`):
// 1. the stock screener (5Y, else 3Y, else 1Y beta), with class shares asked again as CCC/B, 2. the price history
// (monthly, else daily) for our own beta against SPY of everything that is not a stock, 3. the ETF screener (Morningstar's
// 3Y beta) only for what has too little history: its number may be measured against the fund's category index, so an
// ETF gets the S&P 500 beta the app talks about whenever its prices allow (owner 2026-11-26: "yes, do all three").
// Cash (the core position) is 0 without a request. A symbol that fails today keeps yesterday's beta; a failure never
// touches the positions read
import { BENCHMARK, CHART_BATCH, CHART_URL, ETF_SCREENER_URL, SCREEN_BATCH, STOCK_SCREENER_URL, askable, chartUrl, computedBeta, parseChart, parseJsonp, screenerBetas, screenerBody, slashVariant, type Beta, type Betas, type ScreenerKind } from '../shared/beta';
import type { Finding } from '../shared/contract';
import type { FetchLike } from '../shared/sheets/client';
import type { Dataset } from '../shared/model';

export type BetaRequest = (method: 'GET' | 'POST', url: string, body?: string) => Promise<string>;

/** the only requests this file may send: a POST of the two screeners, a GET of the price history */
export function betaAllowed(method: string, url: string): boolean {
  if (method === 'POST') return url === STOCK_SCREENER_URL || url === ETF_SCREENER_URL;
  if (method === 'GET') return url.startsWith(`${CHART_URL}?`) && url.indexOf('#') < 0;
  return false;
}

/** the allowlisted read over a fetch (gmFetch in the script); anything else is refused before it leaves */
export function betaRequest(fetcher: FetchLike): BetaRequest {
  return async (method, url, body) => {
    if (!betaAllowed(method, url)) throw new Error(`not allowed: ${method} ${url}`);
    const headers: Record<string, string> = method === 'POST'
      ? { 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8', 'x-requested-with': 'XMLHttpRequest', accept: 'application/json, text/javascript, */*; q=0.01' }
      : { accept: '*/*' };
    const r = await fetcher(url, { method, headers, body: method === 'POST' ? body : undefined });
    if (!r.ok) throw new Error(`${url.split('/').slice(2, 3).join('')} ${r.status}`);
    return r.text();
  };
}

/** due once a day (local calendar day), when there are positions */
export const betasDue = (ds: Dataset | null, now: Date): boolean => !!ds && ds.positions.some((p) => p.kind !== 'pending') && (!ds.betasAt || new Date(ds.betasAt).toDateString() !== now.toDateString());

/** the held symbols: securities worth asking for, and the cash core ones (beta 0) */
export function heldSymbols(ds: Dataset): { ask: string[]; cash: string[]; all: number } {
  const cash = new Set<string>();
  const ask = new Set<string>();
  const all = new Set<string>();
  ds.positions.forEach((p) => {
    if (p.kind === 'pending' || !p.symbol) return;
    all.add(p.symbol);
    if (p.kind === 'core') cash.add(p.symbol);
    else if (askable(p.symbol)) ask.add(p.symbol);
  });
  return { ask: Array.from(ask).filter((s) => !cash.has(s)).sort(), cash: Array.from(cash).sort(), all: all.size };
}

const chunks = <T>(xs: T[], n: number): T[][] => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));
const message = (err: unknown): string => (err instanceof Error ? err.message : String(err)).slice(0, 200);

// found: symbols with a beta (cash included), held: all held symbols, today: securities that got a beta in this run
export interface BetaRun { betas: Betas; found: number; held: number; today: number; asked: number; problems: Finding[] }

const computed = (b: Beta | undefined): boolean => b?.source === 'calcMonthly' || b?.source === 'calcDaily';

/** steps 1 to 3 for the held symbols; `prev`: the betas of the last run, kept for a symbol that fails today */
export async function readBetas(ds: Dataset, prev: Betas | undefined, request: BetaRequest, now: Date): Promise<BetaRun> {
  const asOf = now.toISOString();
  const { ask, cash, all } = heldSymbols(ds);
  const fresh: Betas = {};
  const problems: Finding[] = [];
  const problem = (id: string, err: unknown) => { if (!problems.some((p) => p.id === id)) problems.push({ id, level: 'error', problem: message(err) }); };
  cash.forEach((s) => { fresh[s] = { beta: 0, source: 'cash', asOf }; });
  const missing = (xs: string[]) => xs.filter((s) => !fresh[s]);

  // the screeners; `as` maps an asked ticker back to the grid symbol (class shares)
  const screen = async (kind: ScreenerKind, symbols: string[], as: Record<string, string> = {}) => {
    for (const batch of chunks(symbols, SCREEN_BATCH)) {
      try {
        const got = screenerBetas(kind, await request('POST', kind === 'stock' ? STOCK_SCREENER_URL : ETF_SCREENER_URL, screenerBody(kind, batch)), asOf);
        batch.forEach((s) => { if (got[s]) fresh[as[s] ?? s] = got[s]!; });
      } catch (err) {
        problem(kind === 'stock' ? 'betas.stock' : 'betas.etf', err);
      }
    }
  };
  // the class shares go to the stock screener right after the first pass: a stock keeps Fidelity's own beta even when
  // the price history knows its grid symbol too
  await screen('stock', ask);
  const variants: Record<string, string> = {};
  missing(ask).forEach((s) => { const v = slashVariant(s); if (v) variants[v] = s; });
  await screen('stock', Object.keys(variants), variants);

  // our own beta from the price history: monthly over 3 years, else daily over the last year or so; `unread`: the
  // symbols of a batch that failed, so yesterday's own beta can win over today's Morningstar fallback below
  const unread = new Set<string>();
  const history = async (symbols: string[], bar: 'MONTHLY' | 'DAILY') => {
    const from = bar === 'MONTHLY' ? new Date(now.getFullYear(), now.getMonth() - 37, 1) : new Date(now.getFullYear(), now.getMonth(), now.getDate() - 400);
    for (const batch of chunks(symbols, CHART_BATCH)) {
      try {
        const series = parseChart(parseJsonp(await request('GET', chartUrl([BENCHMARK].concat(batch.filter((s) => s !== BENCHMARK)), from, now, bar))));
        const index = series[BENCHMARK];
        if (!index) throw new Error(`no ${BENCHMARK} in the price history answer`);
        batch.forEach((s) => { const b = series[s] ? computedBeta(series[s]!, index, bar, asOf) : null; if (b) fresh[s] = b; });
      } catch (err) {
        batch.forEach((s) => unread.add(s));
        problem('betas.chart', err);
      }
    }
  };
  await history(missing(ask), 'MONTHLY');
  await history(missing(ask), 'DAILY');
  // the last resort: Morningstar's 3Y beta of an ETF too young for 12 months (or 40 days) of prices
  await screen('etf', missing(ask));

  // today's beta, else yesterday's; a stored Morningstar number never wins over a fresh computed one (fresh comes
  // first), and yesterday's computed one wins over today's Morningstar number when only the price history failed today
  const betas: Betas = {};
  cash.concat(ask).forEach((s) => {
    const now = fresh[s];
    const old = prev?.[s];
    const b = now?.source === 'etf3y' && unread.has(s) && computed(old) ? old : now ?? old;
    if (b) betas[s] = b;
  });
  return { betas, found: Object.keys(betas).length, held: all, today: ask.filter((s) => fresh[s]).length, asked: ask.length, problems };
}
