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

// a made-up Fidelity: the stock screener knows AAA and the class share CCC/B, the ETF screener EEE, the price history
// FFF (a fund) and SPY; GGG is known nowhere
const row = (sym: string, cells: string) => `<tr><td><a class="symbol strong" data-symbol="${sym}">${sym}</a></td>${cells}</tr>`;
const stock: Record<string, string> = { AAA: '<td class="dataCell fibeta5y">1.20</td>', 'CCC/B': '<td class="dataCell fibeta5y">--</td><td class="dataCell fibeta3y">0.90</td>' };
const months = Array.from({ length: 38 }, (_, i) => { const d = new Date(Date.UTC(2023, 9 + i, 28)); return `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/28-00:00:00`; });
const moves = months.map((_, i) => [0.03, -0.02, 0.05, -0.04, 0.01][i % 5]!);
const bars = (beta: number) => { let p = 100; return months.map((lt, i) => { if (i) p *= 1 + beta * moves[i]!; return { lt, cl: String(p) }; }); };

function fakeFidelity(asked: string[]): BetaRequest {
  return async (method, url, body) => {
    asked.push(`${method} ${url.split('?')[0]!.split('/').slice(-2).join('/')}`);
    if (url === STOCK_SCREENER_URL || url === ETF_SCREENER_URL) {
      const tickers = (JSON.parse(new URLSearchParams(body).get('Criteria')!) as Array<{ Clauses: Array<{ Values: string[] }> }>)[0]!.Clauses[0]!.Values;
      const known: Record<string, string> = url === STOCK_SCREENER_URL ? stock : { EEE: '<td class="dataCell fietfbetamonthend3yr">0.98</td>' };
      return JSON.stringify({ matches: '1', html: '<tr><th>head</th></tr>' + tickers.filter((t) => known[t]).map((t) => row(t, known[t]!)).join('') });
    }
    const symbols = new URL(url).searchParams.get('symbols')!.split(',');
    expect(symbols[0]).toBe('SPY');
    const list = symbols.filter((s) => s === 'SPY' || s === 'FFF').map((s) => ({ Identifier: s, RequestedSymbol: s, BarList: { BarRecord: bars(s === 'SPY' ? 1 : 0.7) }, CorporateActions: { CorporateActionsList: [] } }));
    return `cb(${JSON.stringify({ Symbol: list })})`;
  };
}

test('stocks, ETFs, class shares, our own beta and cash; yesterday kept for a symbol not found today', async () => {
  const d = ds([pos('X1', 'position', 'AAA'), pos('X1', 'position', 'CCCB'), pos('X1', 'position', 'EEE'), pos('X1', 'position', 'FFF'), pos('X1', 'position', 'GGG'), pos('X1', 'position', 'HHH'), pos('X1', 'core', 'MMM')]);
  const asked: string[] = [];
  const now = new Date(2026, 10, 25, 10);
  const prev = { HHH: { beta: 1.5, source: 'stock3y' as const, asOf: 'yesterday' } };
  const run = await readBetas(d, prev, fakeFidelity(asked), now);
  expect(run.betas.AAA).toMatchObject({ beta: 1.2, source: 'stock5y' });
  expect(run.betas.CCCB).toMatchObject({ beta: 0.9, source: 'stock3y' });
  expect(run.betas.EEE).toMatchObject({ beta: 0.98, source: 'etf3y' });
  expect(run.betas.FFF!.source).toBe('calcMonthly');
  expect(run.betas.FFF!.months).toBe(36);
  expect(run.betas.FFF!.beta).toBeCloseTo(0.7, 6);
  expect(run.betas.MMM).toEqual({ beta: 0, source: 'cash', asOf: now.toISOString() });
  expect(run.betas.HHH).toEqual(prev.HHH);
  expect(run.betas.GGG).toBeUndefined();
  expect([run.found, run.held, run.today, run.asked]).toEqual([6, 7, 4, 6]);
  expect(run.problems).toEqual([]);
  // stock pass, ETF pass for the rest, the class share again, then monthly and daily history for what is left
  expect(asked).toEqual(['POST stock-screener/LoadResults', 'POST etf-screener/LoadResults', 'POST stock-screener/LoadResults', 'GET chart/json', 'GET chart/json']);
});

test('a failing source is reported once and the others still run', async () => {
  const d = ds([pos('X1', 'position', 'AAA'), pos('X1', 'core', 'MMM')]);
  const run = await readBetas(d, undefined, async (method) => { if (method === 'POST') throw new Error('research2.fidelity.com 401'); return 'cb({"Symbol":[]})'; }, new Date(2026, 10, 25));
  expect(run.betas).toEqual({ MMM: { beta: 0, source: 'cash', asOf: new Date(2026, 10, 25).toISOString() } });
  expect(run.problems.map((p) => p.id)).toEqual(['betas.stock', 'betas.etf', 'betas.chart']);
  expect(run.problems[0]!.problem).toBe('research2.fidelity.com 401');
  expect([run.today, run.asked]).toEqual([0, 1]);
});
