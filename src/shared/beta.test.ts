/// <reference types="bun" />
/// <reference types="node" />
/// <reference lib="esnext" />
import { expect, test } from 'bun:test';
import type { Position } from './model';
import { accountBreakdown, askable, betaBreakdown, chartUrl, cleanBetas, computedBeta, mixBeta, parseChart, parseJsonp, parseScreenerRows, periodReturns, regressBeta, scopeBeta, screenerBetas, screenerBody, slashVariant, type Series } from './beta';

// made-up rows shaped like the screener's answer: a header row, result rows with data-symbol and the field cells
const STOCK_HTML = [
  '<tr><th class="headerCell fibeta5y">Beta 5Y</th><th class="headerCell fibeta3y">Beta 3Y</th></tr>',
  '<tr class="resultRow"><td class="dataCell first"><a class="symbol strong" href="#" data-symbol="AAA">AAA</a></td>',
  '<td class="dataCell first alignRight fibeta5y">1.23</td><td class="dataCell alignRight fibeta3y">1.10</td><td class="dataCell alignRight fibeta1y">0.90</td></tr>',
  '<tr class="resultRow"><td class="dataCell first"><a class="symbol strong" data-symbol="BBB">BBB</a></td>',
  '<td class="dataCell first alignRight fibeta5y">--</td><td class="dataCell alignRight fibeta3y"> 0.75 </td><td class="dataCell alignRight fibeta1y">--</td></tr>',
  '<tr class="resultRow"><td class="dataCell first"><a class="symbol strong" data-symbol="CCC/B">CCC/B</a></td>',
  '<td class="dataCell first alignRight fibeta5y">--</td><td class="dataCell alignRight fibeta3y">--</td><td class="dataCell alignRight fibeta1y"><span>-0.20</span></td></tr>',
  '<tr class="resultRow"><td class="dataCell first"><a class="symbol strong" data-symbol="DDD">DDD</a></td>',
  '<td class="dataCell first alignRight fibeta5y">--</td><td class="dataCell alignRight fibeta3y">--</td><td class="dataCell alignRight fibeta1y">--</td></tr>',
].join('\n');
const ETF_HTML = '<tr><th>Beta</th></tr><tr><td><a class="symbol strong" data-symbol="EEE">EEE</a></td><td class="dataCell alignRight fietfbetamonthend3yr">0.98</td></tr>';

test('the screener form: fields repeated as ResultFields[], the tickers in the Criteria JSON, 500 rows', () => {
  const p = new URLSearchParams(screenerBody('stock', ['AAA', 'BBB']));
  expect(p.getAll('ResultFields[]')).toEqual(['FI.Beta5y', 'FI.Beta3y', 'FI.Beta1y']);
  expect(JSON.parse(p.get('Criteria')!)).toEqual([{ Clauses: [{ Operator: 'Like', Values: ['AAA', 'BBB'] }], Field: 'ticker' }]);
  expect([p.get('RowCount'), p.get('ScreenerId'), p.get('ResultView'), p.get('SortField'), p.get('AjaxId'), p.get('FirstRow')]).toEqual(['500', '128', 'SearchCriteria', 'FI.MarketCap', '1', '0']);
  expect(screenerBody('stock', ['A']).startsWith('ResultFields%5B%5D=FI.Beta5y&')).toBe(true);
  const e = new URLSearchParams(screenerBody('etf', ['EEE']));
  expect([e.getAll('ResultFields[]'), e.get('ScreenerId'), e.get('ResultView'), e.get('SortField')]).toEqual([['FIETF.BetaMonthEnd3Yr'], '252', 'Performance', 'FIETF.NetAssets']);
});

test('the screener rows: 5Y, else 3Y, else 1Y; "--" is no value; header rows ignored; ETFs 3Y', () => {
  expect(parseScreenerRows(STOCK_HTML, ['FI.Beta5y', 'FI.Beta3y'])).toEqual({ AAA: { 'FI.Beta5y': 1.23, 'FI.Beta3y': 1.1 }, BBB: { 'FI.Beta3y': 0.75 }, 'CCC/B': {}, DDD: {} });
  const answer = JSON.stringify({ ajaxId: 1, matches: '4', html: STOCK_HTML });
  expect(screenerBetas('stock', answer, 't')).toEqual({
    AAA: { beta: 1.23, source: 'stock5y', asOf: 't' },
    BBB: { beta: 0.75, source: 'stock3y', asOf: 't' },
    'CCC/B': { beta: -0.2, source: 'stock1y', asOf: 't' },
  });
  expect(screenerBetas('etf', { html: ETF_HTML }, 't')).toEqual({ EEE: { beta: 0.98, source: 'etf3y', asOf: 't' } });
  expect(() => screenerBetas('etf', { error: 'x' }, 't')).toThrow('no html');
});

test('class shares are asked again with a slash; symbols worth asking', () => {
  expect(slashVariant('CCCB')).toBe('CCC/B');
  expect(slashVariant('AAA')).toBeNull();
  expect(slashVariant('AB1C')).toBeNull();
  expect(['AAA', 'CCC.B', 'CCC/B', 'Z9'].every(askable)).toBe(true);
  expect(['912828ZZ9', 'Pending activity', '', 'aaa', 'TOOLONGSYMBOL'].some(askable)).toBe(false);
});

test('the price history URL encodes like the site; JSONP is unwrapped', () => {
  const u = chartUrl(['AAA', 'SPY'], new Date(2023, 10, 1), new Date(2026, 10, 25), 'MONTHLY');
  expect(u).toBe('https://fastquote.fidelity.com/service/marketdata/historical/chart/json?corpActions=Y&timestamp=start&symbols=AAA%2CSPY&startDate=2023%2F11%2F01-00%3A00%3A00&endDate=2026%2F11%2F25-23%3A59%3A59&barWidth=MONTHLY&extendedHours=N&productid=researchexperience&callback=cb');
  expect(parseJsonp('\n cb({"a":1});')).toEqual({ a: 1 });
  expect(() => parseJsonp('<html>login</html>')).toThrow('not JSONP');
});

// monthly bars: the index moves m, the symbol 1.5 m (its total return) every month
const months = (n: number): string[] => Array.from({ length: n }, (_, i) => { const d = new Date(Date.UTC(2023, 10 + i, 28)); return `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/28-00:00:00`; });
const moves = (n: number): number[] => Array.from({ length: n }, (_, i) => [0.03, -0.02, 0.05, -0.04, 0.01, 0.02][i % 6]!);
function chartAnswer(n: number, symbolBeta: number, dividendMonth?: number) {
  const lts = months(n);
  const m = moves(n);
  let spy = 400;
  let aaa = 50;
  const spyBars = lts.map((lt, i) => { if (i) spy *= 1 + m[i]!; return { lt, op: '0', cl: spy.toFixed(6), hi: '0', lo: '0', v: '0' }; });
  const aaaBars = lts.map((lt, i) => {
    if (!i) return { lt, cl: aaa.toFixed(6) };
    const prev = aaa;
    const total = 1 + symbolBeta * m[i]!;
    // in the dividend month the price drops by the dividend: the total return stays
    const div = i === dividendMonth ? 1 : 0;
    aaa = prev * total - div;
    return { lt, cl: aaa.toFixed(6) };
  });
  const exDate = dividendMonth !== undefined ? String(Date.UTC(2023, 10 + dividendMonth, 15) / 1000) : undefined;
  return {
    Symbol: [
      { Identifier: 'SPY', RequestedSymbol: 'SPY', ExchangeTradedType: 'ETF', BarList: { BarRecord: spyBars }, CorporateActions: { CorporateActionsList: [] } },
      { Identifier: 'AAA', RequestedSymbol: 'AAA', BarList: { BarRecord: aaaBars }, CorporateActions: { CorporateActionsList: exDate ? [{ actionType: 'CD.R', rate: '1', exDate }, { actionType: 'SP.F', rate: '2', exDate }] : [] } },
    ],
  };
}

test('price history: bars by day, cash dividends by ex-date (not splits)', () => {
  const s = parseChart(chartAnswer(3, 1, 2));
  expect(s.AAA!.bars.map((b) => b.date)).toEqual(['2023-11-28', '2023-12-28', '2024-01-28']);
  expect(s.AAA!.dividends).toEqual({ '2024-01-15': 1 });
  expect(() => parseChart({})).toThrow('no Symbol');
});

test('monthly beta: total returns with dividends, the last 36 common months, at least 12', () => {
  const s = parseChart(chartAnswer(40, 1.5, 20));
  const b = computedBeta(s.AAA!, s.SPY!, 'MONTHLY', 't')!;
  expect(b.source).toBe('calcMonthly');
  expect(b.months).toBe(36);
  expect(b.beta).toBeCloseTo(1.5, 6); // the dividend month does not bend it
  const short = parseChart(chartAnswer(12, 1.5));
  expect(computedBeta(short.AAA!, short.SPY!, 'MONTHLY', 't')).toBeNull(); // 11 returns
  const enough = parseChart(chartAnswer(13, 0.5));
  expect(computedBeta(enough.AAA!, enough.SPY!, 'MONTHLY', 't')!.beta).toBeCloseTo(0.5, 6);
});

test('returns skip a gap month and a split-sized jump; a flat index gives no beta', () => {
  const s: Series = { bars: [{ date: '2024-01-31', close: 10 }, { date: '2024-02-29', close: 11 }, { date: '2024-04-30', close: 12 }, { date: '2024-05-31', close: 4 }, { date: '2024-06-28', close: 4.4 }], dividends: { '2024-06-10': 0.1 } };
  const r = periodReturns(s, 'MONTHLY');
  expect(Object.keys(r)).toEqual(['2024-02', '2024-06']);
  expect(r['2024-06']).toBeCloseTo(0.125, 9);
  const d = periodReturns({ bars: [{ date: '2024-06-07', close: 10 }, { date: '2024-06-10', close: 9.9 }], dividends: { '2024-06-08': 0.2 } }, 'DAILY');
  expect(d['2024-06-10']).toBeCloseTo(0.01, 9);
  expect(regressBeta({ a: 0.1, b: 0.2 }, { a: 0.01, b: 0.01 }, 36, 2)).toBeNull();
});

const pos = (account: string, kind: Position['kind'], symbol: string, currentValue?: number): Position => ({ account, kind, symbol, description: '', currentValue, fields: {} });
const BETAS = cleanBetas({ AAA: { beta: 1.2, source: 'stock5y', asOf: 't' }, BBB: { beta: 0.6, source: 'etf3y', asOf: 't' } });

test('account beta: value-weighted, cash counts as 0, unknown left out and lowers the coverage, pending ignored', () => {
  const ps = [pos('X1', 'position', 'AAA', 600), pos('X1', 'position', 'BBB', 200), pos('X1', 'core', 'MMM', 200), pos('X1', 'position', 'ZZZ', 1000), pos('X1', 'pending', 'Pending activity', -500), pos('X2', 'position', 'BBB', 100)];
  const a = accountBreakdown(ps, 'X1', BETAS);
  expect(a.beta).toBeCloseTo((600 * 1.2 + 200 * 0.6 + 200 * 0) / 1000, 9);
  expect(a.coverage).toBeCloseTo(0.5, 9);
  expect(a.sources).toEqual(['stock5y', 'etf3y', 'cash']);
  expect(mixBeta(ps.filter((p) => p.account === 'X2'), BETAS)).toEqual({ beta: 0.6, coverage: 1, sources: ['etf3y'] });
  const both = scopeBeta(ps, ['X1', 'X2'], BETAS);
  expect(both.beta).toBeCloseTo((720 + 120 + 60) / 1100, 9);
  // only cash is a real 0; before any betas are read, or with nothing known, no beta
  expect(mixBeta([pos('X3', 'core', 'MMM', 50)], BETAS)).toEqual({ beta: 0, coverage: 1, sources: ['cash'] });
  expect(mixBeta([pos('X3', 'core', 'MMM', 50)], undefined).beta).toBeNull();
  expect(mixBeta([pos('X3', 'position', 'ZZZ', 50)], BETAS)).toEqual({ beta: null, coverage: 0, sources: [] });
  expect(mixBeta([pos('X3', 'position', 'ZZZ', 50)], undefined)).toEqual({ beta: null, coverage: 0, sources: [] });
  expect(mixBeta([], BETAS)).toEqual({ beta: null, coverage: 0, sources: [] });
});

// the breakdown in the ⤢ window of an account's beta: what each made-up position weighs and adds
const view = (b: ReturnType<typeof betaBreakdown>) => b.rows.map((r) => [r.symbol, r.weight === null ? null : Number(r.weight.toFixed(4)), r.beta?.source ?? null, r.contribution === null ? null : Number(r.contribution.toFixed(4))]);

test('breakdown: a plain account, one with cash, one with a position without a beta', () => {
  const plain = betaBreakdown([pos('X1', 'position', 'BBB', 400), pos('X1', 'position', 'AAA', 600)], BETAS);
  expect(plain.beta).toBeCloseTo(0.96, 9);
  expect([plain.coverage, plain.missing]).toEqual([1, 0]);
  expect(view(plain)).toEqual([['AAA', 0.6, 'stock5y', 0.72], ['BBB', 0.4, 'etf3y', 0.24]]);
  const withCash = betaBreakdown([pos('X1', 'core', 'MMM', 100), pos('X1', 'position', 'AAA', 300)], BETAS);
  expect(withCash.beta).toBeCloseTo(0.9, 9);
  expect(view(withCash)).toEqual([['AAA', 0.75, 'stock5y', 0.9], ['MMM', 0.25, 'cash', 0]]);
  // the one without a beta is listed last with no contribution, and lowers the coverage, not the beta
  const gap = betaBreakdown([pos('X1', 'position', 'ZZZ', 700), pos('X1', 'position', 'AAA', 300), pos('X1', 'position', 'BBB', 100), pos('X1', 'pending', 'Pending activity', 50)], BETAS);
  expect(gap.beta).toBeCloseTo((300 * 1.2 + 100 * 0.6) / 400, 9);
  expect(gap.coverage).toBeCloseTo(400 / 1100, 9);
  expect(gap.missing).toBe(1);
  expect(view(gap)).toEqual([['AAA', 0.2727, 'stock5y', 0.9], ['BBB', 0.0909, 'etf3y', 0.15], ['ZZZ', 0.6364, null, null]]);
});

test('breakdown: only cash, nothing known, a margin debit', () => {
  const cash = betaBreakdown([pos('X1', 'core', 'MMM', 50)], BETAS);
  expect([cash.beta, cash.coverage, cash.missing]).toEqual([0, 1, 0]);
  expect(view(cash)).toEqual([['MMM', 1, 'cash', 0]]);
  const unknown = betaBreakdown([pos('X1', 'position', 'ZZZ', 50)], BETAS);
  expect([unknown.beta, unknown.coverage, unknown.missing]).toEqual([null, 0, 1]);
  expect(view(unknown)).toEqual([['ZZZ', 1, null, null]]);
  // before any betas are read there is no beta, so nothing adds to one; cash still says it is 0
  const unread = betaBreakdown([pos('X1', 'position', 'AAA', 300), pos('X1', 'core', 'MMM', 100)], undefined);
  expect(unread.beta).toBeNull();
  expect(view(unread)).toEqual([['MMM', 0.25, 'cash', null], ['AAA', 0.75, null, null]]);
  expect(betaBreakdown([], BETAS)).toEqual({ beta: null, coverage: 0, sources: [], rows: [], missing: 0 });
  // a margin debit: the core is negative, the stock weighs more than the account and the beta goes above the stock's
  const margin = betaBreakdown([pos('X1', 'core', 'MMM', -200), pos('X1', 'position', 'AAA', 1000)], BETAS);
  expect(margin.beta).toBeCloseTo(1.5, 9);
  expect(margin.coverage).toBe(1);
  expect(view(margin).map((r) => r.slice(0, 3))).toEqual([['AAA', 1.25, 'stock5y'], ['MMM', -0.25, 'cash']]);
  expect(margin.rows[0]!.contribution).toBeCloseTo(1.5, 9);
  expect(margin.rows[1]!.contribution).toBeCloseTo(0, 9);
});

test('breakdown and the card agree: the contributions sum to mixBeta, the coverage is the same', () => {
  const accounts: Position[][] = [
    [pos('X1', 'position', 'AAA', 600), pos('X1', 'position', 'BBB', 400)],
    [pos('X1', 'position', 'AAA', 250), pos('X1', 'core', 'MMM', 750), pos('X1', 'position', 'ZZZ', 125)],
    [pos('X1', 'core', 'MMM', -300), pos('X1', 'position', 'BBB', 900), pos('X1', 'position', 'AAA', 450), pos('X1', 'pending', 'Pending activity', 80)],
    [pos('X1', 'position', 'AAA', 10), pos('X1', 'position', 'BBB', -40), pos('X1', 'position', 'ZZZ', 3)],
  ];
  accounts.forEach((ps) => {
    const mix = mixBeta(ps, BETAS);
    const b = betaBreakdown(ps, BETAS);
    expect(b.rows.reduce((s, r) => s + (r.contribution ?? 0), 0)).toBeCloseTo(mix.beta!, 9);
    expect(b.coverage).toBe(mix.coverage);
    expect(b.sources).toEqual(mix.sources);
  });
});
