/// <reference types="bun" />
/// <reference lib="esnext" />
// Every name and number here is made up
import { expect, test } from 'bun:test';
import type { Txn } from '../../shared/transactions';
import { ACTIVITY_PAGE, asActivityPeriod, inPeriod, nextPage, payLines, payTotals, periodStart, securityName } from './activity';

const t = (o: Partial<Txn>): Txn => ({ account: 'T1', date: '2026-11-27', mnemonic: 'DIV', cat: 'DV', sub: 'VP', dir: 'D', symbol: 'AAA', qty: 0, net: 0, desc: '', cancelled: false, ...o });
const paid = (symbol: string, net: number, o: Partial<Txn> = {}): Txn => t({ symbol, net, desc: `DIVIDEND RECEIVED ${symbol} DEMO FUND (${symbol}) (Cash)`, ...o });
const bought = (symbol: string, net: number, qty: number, o: Partial<Txn> = {}): Txn => t({ symbol, net: -net, qty, mnemonic: 'RIN', sub: 'RN', dir: 'W', desc: `REINVESTMENT ${symbol} DEMO FUND (${symbol}) (Cash)`, ...o });
const ALL = new Set(['T1', 'T2']);

test('a dividend and its reinvestment are one line; a dividend too small to reinvest stands alone', () => {
  const lines = payLines([bought('AAA', 13.18, 0.131), paid('AAA', 13.18), paid('BBB', 0.01)], ALL);
  expect(lines).toHaveLength(2);
  const [a, b] = lines;
  expect(a).toMatchObject({ account: 'T1', date: '2026-11-27', symbol: 'AAA', name: 'AAA DEMO FUND', kind: 'dividend', amount: 13.18, drip: { shares: 0.131, usd: 13.18, price: 100.61 } });
  expect(b).toMatchObject({ symbol: 'BBB', amount: 0.01, drip: null });
});

test('lines are per account, day and ticker, the newest first; other accounts and cancelled rows are out', () => {
  const rows = [
    paid('AAA', 1, { date: '2026-11-20' }), bought('AAA', 1, 0.01, { date: '2026-11-20' }),
    paid('AAA', 2, { date: '2026-11-27' }),
    paid('AAA', 3, { account: 'T2' }), bought('AAA', 3, 0.03, { account: 'T2' }),
    paid('AAA', 9, { account: 'T9' }),
    paid('CCC', 5, { cancelled: true }),
    t({ mnemonic: 'BOT', cat: 'TR', sub: '', dir: 'W', symbol: 'AAA', net: -50, qty: 1, desc: 'YOU BOUGHT' }), // a trade is not a dividend
  ];
  const lines = payLines(rows, ALL);
  expect(lines.map((l) => `${l.date} ${l.account} ${l.amount} ${l.drip ? l.drip.shares : 'none'}`)).toEqual([
    '2026-11-27 T1 2 none',
    '2026-11-27 T2 3 0.03',
    '2026-11-20 T1 1 0.01',
  ]);
  expect(payLines(rows, new Set(['T2']))).toHaveLength(1);
});

test('two payments of one ticker on one day pair in order; a reinvestment alone keeps its line', () => {
  const lines = payLines([paid('AAA', 1), paid('AAA', 4), bought('AAA', 1, 0.01), bought('AAA', 4, 0.04), bought('DDD', 2, 0.02)], ALL);
  expect(lines.map((l) => [l.symbol, l.amount, l.drip?.usd])).toEqual([['AAA', 1, 1], ['AAA', 4, 4], ['DDD', undefined, 2]]);
});

test('interest is told from dividends; the money market fund pays a dividend that buys its own shares at $1', () => {
  const lines = payLines([
    t({ symbol: '', net: 0.42, mnemonic: 'INT', desc: 'INTEREST EARNED CASH' }),
    paid('CORE', 0.05), bought('CORE', 0.05, 0.05),
  ], ALL);
  expect(lines.find((l) => l.symbol === '')).toMatchObject({ kind: 'interest', amount: 0.42, drip: null });
  expect(lines.find((l) => l.symbol === 'CORE')).toMatchObject({ kind: 'dividend', amount: 0.05, drip: { shares: 0.05, usd: 0.05, price: 1 } });
});

test('the name of the security is the description without the action, the ticker and the account type', () => {
  expect(securityName('DIVIDEND RECEIVED DEMO TR US QUALITY FD (AAA) (Cash)', 'AAA')).toBe('DEMO TR US QUALITY FD');
  expect(securityName('REINVESTMENT as of 2026-11-25 DEMO FUNDS TRUST (BBB) (Margin)', 'BBB')).toBe('DEMO FUNDS TRUST');
  expect(securityName('DIVIDEND RECEIVED DEMO GROUP INC COM STK USD0.01 (C.D) (Cash)', 'C.D')).toBe('DEMO GROUP INC COM STK USD0.01');
  expect(securityName('SOMETHING ELSE', '')).toBe('SOMETHING ELSE');
});

test('periods end today; totals add up what was paid, reinvested and left as cash', () => {
  expect(periodStart('1M', '2026-11-28')).toBe('2026-10-29');
  expect(periodStart('3M', '2026-11-28')).toBe('2026-08-29');
  expect(periodStart('YTD', '2026-11-28')).toBe('2026-01-01');
  expect(periodStart('1Y', '2026-11-28')).toBe('2025-11-29');
  expect(periodStart('All', '2026-11-28')).toBe('');
  expect(asActivityPeriod('3M')).toBe('3M');
  expect(asActivityPeriod('nope')).toBe('All'); // everything by default
  // drawn a part at a time: one more part, never more than there is
  expect(nextPage(ACTIVITY_PAGE, 950)).toBe(2 * ACTIVITY_PAGE);
  expect(nextPage(800, 950)).toBe(950);
  expect(nextPage(950, 950)).toBe(950);
  const lines = payLines([paid('AAA', 13.18), bought('AAA', 13.18, 0.131), paid('BBB', 0.01), paid('OLD', 7, { date: '2026-06-01' })], ALL);
  expect(inPeriod(lines, '1M', '2026-11-28').map((l) => l.symbol)).toEqual(['AAA', 'BBB']);
  expect(inPeriod(lines, 'All', '2026-11-28')).toHaveLength(3);
  expect(payTotals(inPeriod(lines, '1M', '2026-11-28'))).toEqual({ paid: 13.19, reinvested: 13.18, cash: 0.01 });
});

test('a pending dividend is a line of its own: the amount comes from its words, nothing is reinvested or left as cash yet', () => {
  const pending = t({ symbol: 'PPP', net: 0, mnemonic: 'FRN', sub: 'OC', desc: 'DIV OF $0.08 PENDING REINVESTMENT as of 2026-11-27 DEMO CORPORATION PLC (PPP) (Cash)' });
  const lines = payLines([pending, paid('AAA', 1), bought('AAA', 1, 0.01)], ALL);
  const p = lines.find((l) => l.symbol === 'PPP')!;
  expect(p).toMatchObject({ amount: 0.08, pending: true, drip: null, name: 'DEMO CORPORATION PLC', kind: 'dividend' });
  expect(lines.find((l) => l.symbol === 'AAA')!.pending).toBe(false);
  expect(payTotals(lines)).toEqual({ paid: 1.08, reinvested: 1, cash: 0 });
  // an amount with a comma
  expect(payLines([t({ symbol: 'BIG', net: 0, desc: 'DIV OF $1,234.50 PENDING REINVESTMENT as of 2026-11-27 BIG CO (BIG) (Cash)' })], ALL)[0]!.amount).toBe(1234.5);
});
