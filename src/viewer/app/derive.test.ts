/// <reference types="bun" />
/// <reference types="node" />
/// <reference lib="esnext" />
import { describe, expect, test } from 'bun:test';
import { ROWS, SIDEBAR } from '../../shared/fixtures/grid';
import { buildDataset } from '../../shared/parse';
import { ALL_FOLD, toggleFold, moveAccount, moveGroup, orderAccounts, sortAccounts, scopeOf, toggleAccount, accountsIn, allocation, groupsOf, matches, movers, near52, positionsIn, rangeRows, payoutParts, kindOf, ofKind, toggleKind, kindOn, addMonths, localToday, incomeIn, periodBounds, rangePos, sortPositions, totalsOf, upcomingDividends, validScope } from './derive';

const ds = buildDataset({ rows: ROWS, sidebar: SIDEBAR, asOf: null, builtAt: 't' });

test('scopes: all, a group, an account; an unknown scope falls back to all', () => {
  expect(groupsOf(ds).map((g) => [g.name, g.accounts.length, g.balance])).toEqual([['Investment', 1, 1525.5], ['Retirement', 1, 800]]);
  expect(accountsIn(ds, 'all')).toHaveLength(2);
  expect(accountsIn(ds, 'group:Retirement').map((a) => a.number)).toEqual(['200000002']);
  expect(accountsIn(ds, 'account:X10000001').map((a) => a.name)).toEqual(['Joint']);
  expect(validScope(ds, 'account:gone')).toBe('all');
  expect(validScope(ds, 'group:Investment')).toBe('group:Investment');
});

test('totals and movers', () => {
  const tot = totalsOf(ds.accounts);
  expect(tot.balance).toBe(2325.5);
  expect(tot.todayGl).toBeCloseTo(8.3);
  expect(tot.cash).toBe(25.5);
  const m = movers(positionsIn(ds, ds.accounts));
  expect(m.top.map((p) => p.symbol)).toEqual(['AAAA']);
  expect(m.bottom.map((p) => p.symbol)).toEqual(['BBBB']);
});

test('allocation, dividends, 52-week, sort and search', () => {
  const ps = positionsIn(ds, ds.accounts);
  expect(allocation(ps, (p) => p.sector).map((s) => s.name)).toEqual(['Energy', 'Other', 'Cash']);
  expect(upcomingDividends(ps, '2026-11-20').map((p) => [p.symbol, p.shares, p.payout])).toEqual([['AAAA', 2.5, 0.63]]); // 0.25 x 2.5 shares
  expect(upcomingDividends(ps, '2026-12-13')).toEqual([]);
  const [u] = upcomingDividends(ps, '2026-11-20');
  const parts = payoutParts(ps, ds.accounts.slice().reverse(), u!);
  expect(parts.map((x) => x.account.number)).toEqual(ds.accounts.slice().reverse().filter((a) => parts.some((x) => x.account.number === a.number)).map((a) => a.number)); // the given order
  expect(parts.reduce((x, p) => x + p.shares, 0)).toBe(u!.shares);
  expect(rangePos(ps[1]!)).toBeCloseTo(100 / 110);
  expect(near52(ps, 0.1).highs.map((p) => p.symbol)).toEqual(['AAAA']);
  const [row] = rangeRows(near52(ps, 0.1).highs);
  expect(row!.pos).toBeCloseTo(100 / 110);
  expect(row!.fromHigh).toBeCloseTo((ps[1]!.lastPrice! / ps[1]!.high52! - 1) * 100);
  expect(rangeRows(ps.concat(ps)).find((r) => r.symbol === 'AAAA')!.shares).toBe(2 * ps[1]!.quantity!); // one row per symbol, shares summed
  const secs = ps.filter((p) => p.kind === 'position');
  expect(sortPositions(secs, 'todayGlPct', -1).map((p) => p.symbol)).toEqual(['AAAA', 'BBBB']);
  expect(sortPositions(ps, 'symbol', 1)[0]!.symbol).toBe('AAAA');
  expect(matches(ps[1]!, 'alpha')).toBe(true);
  expect(matches(ps[1]!, 'zzz')).toBe(false);
});

test('any set of accounts: checkbox toggles, the shortest scope name', () => {
  const three = { ...ds, accounts: ds.accounts.concat({ number: 'X3', name: 'Kid', group: 'Investment', asOf: 't' }) };
  expect(scopeOf(three, ['X10000001', '200000002', 'X3'])).toBe('all');
  expect(scopeOf(three, ['X10000001', 'X3'])).toBe('group:Investment');
  expect(scopeOf(three, ['200000002'])).toBe('account:200000002');
  expect(scopeOf(three, ['X3', '200000002'])).toBe('set:200000002,X3');
  expect(accountsIn(three, 'set:200000002,X3').map((a) => a.number)).toEqual(['200000002', 'X3']);
  // from one account, tick another: a set; untick it again: back to one; untick from all: the rest
  expect(toggleAccount(three, 'account:X3', '200000002')).toBe('set:200000002,X3');
  expect(toggleAccount(three, 'set:200000002,X3', '200000002')).toBe('account:X3');
  expect(toggleAccount(three, 'all', '200000002')).toBe('group:Investment');
  // the All accounts checkbox can clear everything; then single accounts are ticked one by one
  expect(scopeOf(three, [])).toBe('none');
  expect(accountsIn(three, 'none')).toEqual([]);
  expect(toggleAccount(three, 'none', 'X3')).toBe('account:X3');
  expect(validScope(three, 'none')).toBe('none');
  expect(validScope(three, 'set:gone')).toBe('all');
});

test('movers by % or $: the worst loser last; accounts sorted by the chosen measure', () => {
  const p = (symbol: string, todayGl: number, todayGlPct: number) => ({ account: 'A', kind: 'position' as const, symbol, description: '', todayGl, todayGlPct, fields: {} });
  const ps = [p('BIGUSD', 50, 1), p('BIGPCT', 2, 30), p('LOSS1', -1, -9), p('LOSS2', -20, -2), p('MID', 5, 5)];
  expect(movers(ps, 2, 'pct').top.map((x) => x.symbol)).toEqual(['BIGPCT', 'MID']);
  expect(movers(ps, 2, 'usd').top.map((x) => x.symbol)).toEqual(['BIGUSD', 'MID']);
  expect(movers(ps, 2, 'pct').bottom.map((x) => x.symbol)).toEqual(['LOSS2', 'LOSS1']); // -2% then -9% at the very bottom
  expect(movers(ps, 2, 'usd').bottom.map((x) => x.symbol)).toEqual(['LOSS1', 'LOSS2']); // -$1 then -$20 at the very bottom
  const accs = [{ number: '1', name: 'a', group: 'g', balance: 10, todayGl: 5, todayGlPct: 50, totalGl: -1, totalGlPct: -10, asOf: 't' }, { number: '2', name: 'b', group: 'g', balance: 20, todayGl: 1, todayGlPct: 5, totalGl: 3, totalGlPct: 15, asOf: 't' }];
  expect(sortAccounts(accs, 'value').map((a) => a.number)).toEqual(['2', '1']);
  expect(sortAccounts(accs, 'todayUsd').map((a) => a.number)).toEqual(['1', '2']);
  expect(sortAccounts(accs, 'totalPct').map((a) => a.number)).toEqual(['2', '1']);
});

test('my order of accounts: moved within the bar, groups stay put', () => {
  const acc = (number: string, group: string) => ({ number, name: number, group, asOf: 't' });
  const d = { ...ds, accounts: [acc('A', 'Investment'), acc('B', 'Investment'), acc('C', 'Investment'), acc('R1', 'Retirement'), acc('R2', 'Retirement')] };
  const order = moveAccount(d.accounts, 'C', 'A');
  expect(order).toEqual(['C', 'A', 'B', 'R1', 'R2']);
  expect(orderAccounts(d, order).accounts.map((a) => a.number)).toEqual(['C', 'A', 'B', 'R1', 'R2']);
  // a retirement account moved first in the list still stays in its group, after the investment ones
  expect(orderAccounts(d, ['R2', 'R1']).accounts.map((a) => a.number)).toEqual(['A', 'B', 'C', 'R2', 'R1']);
  expect(orderAccounts(d, [])).toBe(d);
  expect(sortAccounts(d.accounts, 'mine').map((a) => a.number)).toEqual(['A', 'B', 'C', 'R1', 'R2']);
  // a group moves as a whole with its accounts, keeping their own order inside
  const groups = moveGroup(['Investment', 'Retirement'], 'Retirement', 'Investment');
  expect(groups).toEqual(['Retirement', 'Investment']);
  expect(orderAccounts(d, ['R2', 'R1', 'C'], groups).accounts.map((a) => a.number)).toEqual(['R2', 'R1', 'C', 'A', 'B']);
});

test('income of the month and the quarter from pay dates stepped by the frequency', () => {
  const ps = positionsIn(ds, ds.accounts); // AAAA: quarterly, 0.25 a share, 2.5 shares, pays 2027-01-05
  expect(addMonths('2026-03-31', -1)).toBe('2026-02-28');
  expect(periodBounds('2026-11-24')).toEqual({ month: ['2026-11-01', '2026-11-30'], quarter: ['2026-10-01', '2026-12-31'], year: ['2026-01-01', '2026-12-31'] });
  expect(incomeIn(ps, '2026-10-01', '2026-12-31', '2026-11-24')).toEqual({ paid: 0.63, coming: 0, total: 0.63 }); // Oct 5, paid
  expect(incomeIn(ps, '2027-01-01', '2027-03-31', '2026-11-24')).toEqual({ paid: 0, coming: 0.63, total: 0.63 });
  expect(incomeIn(ps, '2026-11-01', '2026-11-30', '2026-11-24').total).toBe(0);
});

test('ETF or stock by the security type', () => {
  const p = positionsIn(ds, ds.accounts)[1]!;
  expect(kindOf({ ...p, securityType: 'Exchange Traded' })).toBe('etf');
  expect(kindOf({ ...p, securityType: 'Equity' })).toBe('stock');
  expect(kindOf({ ...p, securityType: 'Others', securitySubType: 'REITS' })).toBe('stock');
  expect(kindOf({ ...p, securityType: 'Mutual Fund' })).toBe('other');
  const ps = [{ ...p, symbol: 'E', securityType: 'Exchange Traded' }, { ...p, symbol: 'S', securityType: 'Equity' }];
  expect(ofKind(ps, 'etf').map((x) => x.symbol)).toEqual(['E']);
  expect(ofKind(ps, 'all')).toHaveLength(2);
});

test('ETFs and Stocks boxes switch on their own; both or none is all', () => {
  expect(toggleKind('all', 'etf')).toBe('stock'); // ETFs off: Stocks only
  expect(toggleKind('stock', 'stock')).toBe('none'); // both clear: every security
  expect(toggleKind('none', 'etf')).toBe('etf');
  expect(toggleKind('etf', 'stock')).toBe('all');
  expect(kindOn('none', 'etf') || kindOn('none', 'stock')).toBe(false);
  const p = positionsIn(ds, ds.accounts)[1]!;
  expect(ofKind([{ ...p, securityType: 'Mutual Fund' }], 'none')).toHaveLength(1);
});

describe('toggleFold', () => {
  test('a group folds and unfolds only itself', () => {
    expect(toggleFold([], 'Investment')).toEqual(['Investment']);
    expect(toggleFold(['Investment', 'Retirement'], 'Investment')).toEqual(['Retirement']);
  });
  test('All accounts folds everything when all is open', () => {
    expect(toggleFold([], ALL_FOLD)).toEqual([ALL_FOLD]);
  });
  test('All accounts unfolds everything when anything is folded', () => {
    expect(toggleFold([ALL_FOLD], ALL_FOLD)).toEqual([]);
    expect(toggleFold(['Retirement'], ALL_FOLD)).toEqual([]);
  });
});

test('localToday is the date in local time, not UTC', () => {
  expect(localToday(new Date(2026, 10, 30, 21, 30))).toBe('2026-11-30');
  expect(localToday(new Date(2026, 0, 5, 0, 10))).toBe('2026-01-05');
});
