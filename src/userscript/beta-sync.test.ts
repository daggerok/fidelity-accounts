/// <reference types="bun" />
/// <reference types="node" />
/// <reference lib="esnext" />
import { expect, test } from 'bun:test';
import { CHART_URL, ETF_SCREENER_URL, STOCK_SCREENER_URL } from '../shared/beta';
import type { Dataset, Position } from '../shared/model';
import { betaAllowed, betaRequest, betasDue, heldSymbols, readBetas, type BetaRequest } from './beta-sync';

const pos = (account: string, kind: Position['kind'], symbol: string, currentValue = 100): Position => ({ account, kind, symbol, description: '', currentValue, fields: {} });
const ds = (positions: Position[], betasAt?: string): Dataset => ({ version: 1, builtAt: 't', asOf: null, accounts: [], positions, warnings: [], betasAt });

test('only the two screener POSTs and the price history GET are allowed; anything else is refused before it leaves', async () => {
  expect(betaAllowed('POST', STOCK_SCREENER_URL)).toBe(true);
  expect(betaAllowed('POST', ETF_SCREENER_URL)).toBe(true);
  expect(betaAllowed('GET', `${CHART_URL}?symbols=SPY&callback=cb`)).toBe(true);
  const refused: Array<[string, string]> = [
    ['GET', STOCK_SCREENER_URL],
    ['POST', `${STOCK_SCREENER_URL}?x=1`],
    ['POST', 'https://research2.fidelity.com/pi/stock-screener/SaveScreen'],
    ['POST', CHART_URL],
    ['GET', CHART_URL],
    ['GET', 'https://fastquote.fidelity.com/service/marketdata/historical/chart/jsonx?a=1'],
    ['GET', `https://fastquote.fidelity.com.example.com/service/marketdata/historical/chart/json?a=1`],
    ['POST', 'https://digital.fidelity.com/ftgw/digital/trade/api/order'],
    ['PUT', STOCK_SCREENER_URL],
  ];
  refused.forEach(([m, u]) => expect(betaAllowed(m, u)).toBe(false));
  let sent = 0;
  const req = betaRequest(async () => { sent++; return new Response('{}'); });
  await expect(req('POST', 'https://digital.fidelity.com/ftgw/digital/trade/api/order', 'x')).rejects.toThrow('not allowed');
  await expect(req('GET', 'https://example.com/')).rejects.toThrow('not allowed');
  expect(sent).toBe(0);
});

test('the request carries the form headers and fails on an HTTP error', async () => {
  const seen: Array<{ url: string; init?: RequestInit }> = [];
  const ok = betaRequest(async (url, init) => { seen.push({ url, init }); return new Response('{"html":""}'); });
  expect(await ok('POST', STOCK_SCREENER_URL, 'a=1')).toBe('{"html":""}');
  expect(seen[0]!.init).toMatchObject({ method: 'POST', body: 'a=1', headers: { 'x-requested-with': 'XMLHttpRequest', 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8' } });
  const bad = betaRequest(async () => new Response('no', { status: 403 }));
  await expect(bad('GET', `${CHART_URL}?a=1`)).rejects.toThrow('fastquote.fidelity.com 403');
});

test('held symbols: cash cores apart, pending and odd symbols left out; due once a day with positions', () => {
  const d = ds([pos('X1', 'position', 'AAA'), pos('X2', 'position', 'AAA'), pos('X1', 'core', 'MMM'), pos('X1', 'pending', 'Pending activity'), pos('X1', 'position', '912828ZZ9')]);
  expect(heldSymbols(d)).toEqual({ ask: ['AAA'], cash: ['MMM'], all: 3 });
  const now = new Date(2026, 10, 25, 10);
  expect(betasDue(d, now)).toBe(true);
  expect(betasDue({ ...d, betasAt: new Date(2026, 10, 25, 8).toISOString() }, now)).toBe(false);
  expect(betasDue(ds([]), now)).toBe(false);
  expect(betasDue(null, now)).toBe(false);
});

// a made-up Fidelity: the stock screener knows AAA and the class share CCC/B; the ETF screener EEE and JJJ; the price
// history SPY, EEE (an ETF), FFF (a fund) and JJJ with only 10 months (too young for a beta of ours); GGG is known nowhere
const row = (sym: string, cells: string) => `<tr><td><a class="symbol strong" data-symbol="${sym}">${sym}</a></td>${cells}</tr>`;
const stock: Record<string, string> = { AAA: '<td class="dataCell fibeta5y">1.20</td>', 'CCC/B': '<td class="dataCell fibeta5y">--</td><td class="dataCell fibeta3y">0.90</td>' };
const etf: Record<string, string> = { EEE: '<td class="dataCell fietfbetamonthend3yr">0.98</td>', JJJ: '<td class="dataCell fietfbetamonthend3yr">0.60</td>' };
const months = Array.from({ length: 38 }, (_, i) => { const d = new Date(Date.UTC(2023, 9 + i, 28)); return `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/28-00:00:00`; });
const moves = months.map((_, i) => [0.03, -0.02, 0.05, -0.04, 0.01][i % 5]!);
const bars = (beta: number, n = months.length) => { let p = 100; return months.map((lt, i) => { if (i) p *= 1 + beta * moves[i]!; return { lt, cl: String(p) }; }).slice(-n); };
const HISTORY: Record<string, { beta: number; n?: number }> = { SPY: { beta: 1 }, EEE: { beta: 1.3 }, FFF: { beta: 0.7 }, JJJ: { beta: 2, n: 10 } };

function fakeFidelity(asked: string[], chartFails = false): BetaRequest {
  return async (method, url, body) => {
    asked.push(`${method} ${url.split('?')[0]!.split('/').slice(-2).join('/')}`);
    if (url === STOCK_SCREENER_URL || url === ETF_SCREENER_URL) {
      const tickers = (JSON.parse(new URLSearchParams(body).get('Criteria')!) as Array<{ Clauses: Array<{ Values: string[] }> }>)[0]!.Clauses[0]!.Values;
      const known = url === STOCK_SCREENER_URL ? stock : etf;
      return JSON.stringify({ matches: '1', html: '<tr><th>head</th></tr>' + tickers.filter((t) => known[t]).map((t) => row(t, known[t]!)).join('') });
    }
    if (chartFails) throw new Error('fastquote.fidelity.com 500');
    const symbols = new URL(url).searchParams.get('symbols')!.split(',');
    expect(symbols[0]).toBe('SPY');
    const list = symbols.filter((s) => HISTORY[s]).map((s) => ({ Identifier: s, RequestedSymbol: s, BarList: { BarRecord: bars(HISTORY[s]!.beta, HISTORY[s]!.n) }, CorporateActions: { CorporateActionsList: [] } }));
    return `cb(${JSON.stringify({ Symbol: list })})`;
  };
}

test('stocks from the screener, everything else our own beta first, Morningstar only for a too short history, cash 0', async () => {
  const d = ds([pos('X1', 'position', 'AAA'), pos('X1', 'position', 'CCCB'), pos('X1', 'position', 'EEE'), pos('X1', 'position', 'FFF'), pos('X1', 'position', 'GGG'), pos('X1', 'position', 'HHH'), pos('X1', 'position', 'JJJ'), pos('X1', 'core', 'MMM')]);
  const asked: string[] = [];
  const now = new Date(2026, 10, 25, 10);
  // yesterday: HHH from the screener, EEE still Morningstar's
  const prev = { HHH: { beta: 1.5, source: 'stock3y' as const, asOf: 'yesterday' }, EEE: { beta: 0.98, source: 'etf3y' as const, asOf: 'yesterday' } };
  const run = await readBetas(d, prev, fakeFidelity(asked), now);
  expect(run.betas.AAA).toMatchObject({ beta: 1.2, source: 'stock5y' });
  expect(run.betas.CCCB).toMatchObject({ beta: 0.9, source: 'stock3y' });
  // EEE is in the ETF screener too, but gets our beta against SPY; the stored Morningstar number does not win either
  expect(run.betas.EEE!.source).toBe('calcMonthly');
  expect(run.betas.EEE!.beta).toBeCloseTo(1.3, 6);
  expect(run.betas.FFF!.source).toBe('calcMonthly');
  expect(run.betas.FFF!.months).toBe(36);
  expect(run.betas.FFF!.beta).toBeCloseTo(0.7, 6);
  // JJJ has 9 monthly returns (under 12) and too few days: the ETF screener's number is the last resort
  expect(run.betas.JJJ).toMatchObject({ beta: 0.6, source: 'etf3y' });
  expect(run.betas.MMM).toEqual({ beta: 0, source: 'cash', asOf: now.toISOString() });
  expect(run.betas.HHH).toEqual(prev.HHH);
  expect(run.betas.GGG).toBeUndefined();
  expect([run.found, run.held, run.today, run.asked]).toEqual([7, 8, 5, 7]);
  expect(run.problems).toEqual([]);
  // stock pass, the class share again, monthly then daily history for the rest, the ETF screener for what is left
  expect(asked).toEqual(['POST stock-screener/LoadResults', 'POST stock-screener/LoadResults', 'GET chart/json', 'GET chart/json', 'POST etf-screener/LoadResults']);
});

test('a failing price history is reported once, the screeners still run, yesterday\'s own beta beats Morningstar', async () => {
  const d = ds([pos('X1', 'position', 'AAA'), pos('X1', 'position', 'EEE'), pos('X1', 'position', 'JJJ'), pos('X1', 'core', 'MMM')]);
  const asked: string[] = [];
  const prev = { EEE: { beta: 1.25, source: 'calcMonthly' as const, months: 36, asOf: 'yesterday' } };
  const run = await readBetas(d, prev, fakeFidelity(asked, true), new Date(2026, 10, 25, 10));
  expect(run.problems.map((p) => [p.id, p.problem])).toEqual([['betas.chart', 'fastquote.fidelity.com 500']]);
  expect(asked).toEqual(['POST stock-screener/LoadResults', 'GET chart/json', 'GET chart/json', 'POST etf-screener/LoadResults']);
  expect(run.betas.AAA).toMatchObject({ beta: 1.2, source: 'stock5y' });
  expect(run.betas.EEE).toEqual(prev.EEE);
  expect(run.betas.JJJ).toMatchObject({ beta: 0.6, source: 'etf3y' });
});

test('a failing source is reported once and the others still run', async () => {
  const d = ds([pos('X1', 'position', 'AAA'), pos('X1', 'core', 'MMM')]);
  const run = await readBetas(d, undefined, async (method) => { if (method === 'POST') throw new Error('research2.fidelity.com 401'); return 'cb({"Symbol":[]})'; }, new Date(2026, 10, 25));
  expect(run.betas).toEqual({ MMM: { beta: 0, source: 'cash', asOf: new Date(2026, 10, 25).toISOString() } });
  expect(run.problems.map((p) => p.id)).toEqual(['betas.stock', 'betas.chart', 'betas.etf']);
  expect(run.problems[0]!.problem).toBe('research2.fidelity.com 401');
  expect([run.today, run.asked]).toEqual([0, 1]);
});
