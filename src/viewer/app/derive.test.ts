/// <reference types="bun" />
/// <reference types="node" />
/// <reference lib="esnext" />
import { describe, expect, test } from 'bun:test';
import { ROWS, SIDEBAR } from '../../shared/fixtures/grid';
import type { Account, Position } from '../../shared/model';
import { buildDataset } from '../../shared/parse';
import { sortPositions } from './position-columns';
import { asKind, ALL_FOLD, toggleFold, moveAccount, moveGroup, stepMove, orderAccounts, sortAccounts, scopeOf, toggleAccount, accountsIn, allocation, groupsOf, movers, near52, positionsIn, rangeRows, payoutParts, payDatesIn, securitiesBySymbol, incomeFacts, kindOf, ofKind, toggleKind, kindOn, estAnnualOf, addMonths, localToday, incomeIn, periodBounds, rangePos, totalsOf, upcomingDividends, payoutTotal, validScope, dripGap, perPayment, windowEnd, asDivWindow, symbolDrip, dripToBuy, scopeTitle } from './derive';

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
  expect(payoutTotal(upcomingDividends(ps, '2026-11-20'))).toBe(0.63);
  expect(payoutTotal([])).toBe(0);
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
  // the 52-week range sorts by where the price sits in the range, not by the 52-week high; no range goes last
  const near = (symbol: string, lastPrice: number, low52: number, high52: number) => ({ ...secs[0]!, symbol, lastPrice, low52, high52 });
  const rs = [near('LOW', 110, 100, 2000), near('TOP', 95, 50, 100), near('MID', 15, 10, 20), { ...secs[0]!, symbol: 'NONE', low52: undefined, high52: undefined }];
  expect(sortPositions(rs, 'high52', -1).map((p) => p.symbol)).toEqual(['TOP', 'MID', 'LOW', 'NONE']);
  expect(sortPositions(rs, 'high52', 1).map((p) => p.symbol)).toEqual(['LOW', 'MID', 'TOP', 'NONE']);
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

test('estAnnualOf: both pills on or off use the accounts estimate, one pill sums its positions', () => {
  const q = (securityType: string, estAnnualIncome: number) => ({ account: 'A', kind: 'position' as const, symbol: 'X', description: '', securityType, estAnnualIncome, fields: {} });
  const ps = [q('Exchange Traded', 10), q('Equity', 5)] as Position[];
  expect(estAnnualOf('all', 99, ps)).toBe(99);
  expect(estAnnualOf('none', 99, ps)).toBe(99);
  expect(estAnnualOf('etf', 99, ps)).toBe(10);
  expect(estAnnualOf('stock', 99, ps)).toBe(5);
});

test('asKind keeps a known kind and falls back to all', () => {
  ['etf', 'stock', 'none'].forEach((k) => expect<string>(asKind(k)).toBe(k));
  ['all', undefined, 5, 'junk'].forEach((k) => expect(asKind(k)).toBe('all'));
});

const acct = (number: string, extra: Partial<Account> = {}): Account => ({ number, name: number, group: 'G', asOf: 't', ...extra });

test('totalsOf: a zero balance or a missing cost basis gives no percent', () => {
  const a = totalsOf([acct('A', { balance: 0, todayGl: 5, totalGl: 3 })]);
  expect(a.todayGlPct).toBeNull();
  expect(a.totalGlPct).toBeNull();
  const b = totalsOf([acct('B', { balance: 110, todayGl: 10, totalGl: 20, costBasis: 100 })]);
  expect(b.todayGlPct).toBeCloseTo(10);
  expect(b.totalGlPct).toBeCloseTo(20);
});

test('incomeIn steps the pay date by the frequency; no frequency counts the pay date only', () => {
  const pos = (extra: Partial<Position>): Position => ({ account: 'A', kind: 'position', symbol: 'X', description: '', dividendAmount: 1, quantity: 2, payDate: '2026-11-15', fields: {}, ...extra });
  expect(incomeIn([pos({ paymentFrequency: 'Monthly' })], '2026-01-01', '2026-12-31', '2026-11-24')).toEqual({ paid: 22, coming: 2, total: 24 });
  expect(incomeIn([pos({})], '2026-01-01', '2026-12-31', '2026-11-24')).toEqual({ paid: 2, coming: 0, total: 2 });
});

test('upcomingDividends: one row per symbol across accounts, shares summed, earlier ex-date kept', () => {
  const pos = (account: string, exDate: string, quantity: number): Position => ({ account, kind: 'position', symbol: 'X', description: '', dividendAmount: 1, quantity, exDate, fields: {} });
  const rows = upcomingDividends([pos('A', '2026-11-28', 3), pos('B', '2026-11-26', 2)], '2026-11-24');
  expect(rows).toHaveLength(1);
  expect(rows[0]!.shares).toBe(5);
  expect(rows[0]!.exDate).toBe('2026-11-26');
});

test('sortAccounts puts an account with no today gain last for todayUsd', () => {
  const list = [acct('A'), acct('B', { todayGl: -5 }), acct('C', { todayGl: 7 })];
  expect(sortAccounts(list, 'todayUsd').map((a) => a.number)).toEqual(['C', 'B', 'A']);
});

test('moveGroup and moveAccount append at the end for an unknown target', () => {
  expect(moveGroup(['a', 'b', 'c'], 'a', 'gone')).toEqual(['b', 'c', 'a']);
  expect(moveAccount([acct('A'), acct('B'), acct('C')], 'A', 'gone')).toEqual(['B', 'C', 'A']);
});

test('stepMove: one place left or right through the drop-before rules, nothing past either end', () => {
  const order = ['a', 'b', 'c'];
  expect(stepMove(order, 'b', -1)).toEqual(['b', 'a']);
  expect(stepMove(order, 'b', 1)).toEqual(['c', 'b']);
  expect(moveGroup(order, ...stepMove(order, 'b', -1)!)).toEqual(['b', 'a', 'c']);
  expect(moveGroup(order, ...stepMove(order, 'b', 1)!)).toEqual(['a', 'c', 'b']);
  expect(moveGroup(order, ...stepMove(order, 'a', 1)!)).toEqual(['b', 'a', 'c']);
  expect(moveAccount([acct('A'), acct('B'), acct('C')], ...stepMove(['A', 'B', 'C'], 'C', -1)!)).toEqual(['A', 'C', 'B']);
  expect(stepMove(order, 'a', -1)).toBeNull();
  expect(stepMove(order, 'c', 1)).toBeNull();
  expect(stepMove(order, 'gone', 1)).toBeNull();
});

test('income facts: received from the transactions, planned adds what still comes; unknown until every account is read', () => {
  const ps = positionsIn(ds, ds.accounts); // AAAA pays 0.25 a share quarterly on 2027-01-05, 2.5 shares
  const row = (account: string, date: string, net: number, symbol = 'AAAA') => ({ account, date, mnemonic: 'DIV', cat: 'DV', sub: 'VP', dir: 'D', symbol, qty: 0, net, desc: '', cancelled: false });
  const accts = ds.accounts;
  const synced = Object.fromEntries(accts.map((a) => [a.number, '2026-11-24']));
  const store = { version: 1 as const, at: 'x', synced, rows: [row(accts[0]!.number, '2026-10-05', 0.62), row(accts[0]!.number, '2026-12-01', 99)] };
  const q = incomeFacts(store, accts, ps, 'all', '2026-10-01', '2026-12-31', '2026-11-24');
  expect(q).toEqual({ received: 0.62, coming: 0, planned: 0.62 }); // the December row is after today
  const next = incomeFacts(store, accts, ps, 'all', '2027-01-01', '2027-03-31', '2026-11-24');
  expect(next.coming).toBe(0.63);
  expect(incomeFacts({ ...store, synced: {} }, accts, ps, 'all', '2026-10-01', '2026-12-31', '2026-11-24')).toEqual({ received: null, coming: 0, planned: 0.63 }); // the October payment at today's shares
  expect(incomeFacts(null, accts, ps, 'all', '2026-10-01', '2026-12-31', '2026-11-24').received).toBeNull();
  expect(incomeFacts(store, accts, ps, 'etf', '2026-10-01', '2026-12-31', '2026-11-24').received).toBe(0); // AAAA is not held as an ETF
});

test('DRIP: shares or dollars to buy so the next payout buys 0.001 share, minus when it already does', () => {
  const pos = (extra: Partial<Position>): Position => ({ account: 'A', kind: 'position', symbol: 'X', description: '', lastPrice: 52.3, dividendAmount: 0.25, quantity: 0.1, fields: {}, ...extra });
  // 0.001 x $52.30 = $0.0523 -> 6 cents; 0.06 / 0.25 = 0.24 shares needed, 0.1 held
  expect(dripGap(pos({}))).toEqual({ shares: 0.14, usd: 7.33 }); // 0.14 x 52.30 = 7.322, up to a cent
  expect(dripGap(pos({ quantity: 1 }))).toEqual({ shares: -0.76, usd: -39.75 });
  expect(dripGap(pos({ quantity: 0.24 }))).toEqual({ shares: 0, usd: 0 }); // exactly enough
  expect(dripGap(pos({ lastPrice: 50, quantity: 0 }))).toEqual({ shares: 0.2, usd: 10 }); // $0.05 exactly, not 6 cents
  expect(dripGap(pos({ quantity: 0.2391 }))).toEqual({ shares: 0.001, usd: 0.05 }); // a tiny gap still rounds up
  expect(dripGap(pos({ dividendAmount: undefined }))).toBeNull();
  expect(dripGap(pos({ lastPrice: undefined }))).toBeNull();
  expect(dripGap(pos({ kind: 'core' }))).toBeNull();
  // no per-payment amount: the annual estimate split by the payments a year
  expect(perPayment(pos({ dividendAmount: undefined, estAnnualIncome: 4, quantity: 2, paymentFrequency: 'Quarterly' }))).toBe(0.5);
  expect(perPayment(pos({ dividendAmount: undefined, estAnnualIncome: 4, quantity: 2, paymentFrequency: 'Unknown' }))).toBeUndefined();
  // sorting by DRIP: the biggest buy first, no dividend last
  const ps = [pos({ symbol: 'ON', quantity: 1 }), pos({ symbol: 'NONE', dividendAmount: undefined }), pos({ symbol: 'BUY' })];
  expect(sortPositions(ps, 'drip', -1).map((p) => p.symbol)).toEqual(['BUY', 'ON', 'NONE']);
  expect(sortPositions(ps, 'dripUsd', 1).map((p) => p.symbol)).toEqual(['ON', 'BUY', 'NONE']);
});

test('upcoming dividends look ahead to the end of the month or quarter, or one or three months, MTD by default', () => {
  expect(windowEnd('2026-11-24', 'MTD')).toBe('2026-11-30');
  expect(windowEnd('2026-11-24', '1M')).toBe('2026-12-24');
  expect(windowEnd('2026-11-24', 'QTD')).toBe('2026-12-31');
  expect(windowEnd('2026-11-24', '1Q')).toBe('2027-02-24');
  expect(windowEnd('2027-01-05', 'QTD')).toBe('2027-03-31');
  expect(asDivWindow('QTD')).toBe('QTD');
  expect(asDivWindow('30D')).toBe('MTD');
  expect(asDivWindow('3M')).toBe('1Q'); // the name before 1Q, kept in old prefs
  const pos = (symbol: string, exDate: string): Position => ({ account: 'A', kind: 'position', symbol, description: '', quantity: 1, exDate, fields: {} });
  const ps = [pos('NOV', '2026-11-28'), pos('DEC', '2026-12-10'), pos('FEB', '2027-02-01')];
  expect(upcomingDividends(ps, '2026-11-24', windowEnd('2026-11-24', 'MTD')).map((p) => p.symbol)).toEqual(['NOV']);
  expect(upcomingDividends(ps, '2026-11-24', windowEnd('2026-11-24', '1Q')).map((p) => p.symbol)).toEqual(['NOV', 'DEC', 'FEB']);
});

test('DRIP of an upcoming dividend: per account, short accounts summed, else the smallest margin', () => {
  const acct = (number: string): Account => ({ number, name: number, group: 'G', asOf: '' });
  const pos = (account: string, quantity: number): Position => ({ account, kind: 'position', symbol: 'X', description: '', lastPrice: 52.3, dividendAmount: 0.25, quantity, exDate: '2026-11-28', fields: {} });
  // 0.24 shares make the 6 cents that buy 0.001 share at $52.30
  const ps = [pos('A', 0.1), pos('B', 0.2), pos('C', 1)];
  const accounts = [acct('A'), acct('B'), acct('C')];
  const [u] = upcomingDividends(ps, '2026-11-24');
  const parts = payoutParts(ps, accounts, u!);
  expect(parts.map((p) => p.drip?.shares)).toEqual([0.14, 0.04, -0.76]);
  expect(symbolDrip(parts)).toEqual({ shares: 0.18, usd: 9.43 }); // 7.33 + 2.10: bought in A and B
  expect(symbolDrip(parts.slice(2))).toEqual({ shares: -0.76, usd: -39.75 });
  const both = payoutParts([pos('A', 1), pos('C', 0.5)], accounts, upcomingDividends([pos('A', 1), pos('C', 0.5)], '2026-11-24')[0]!);
  expect(symbolDrip(both)?.shares).toBe(-0.26); // the closer margin of -0.76 and -0.26
  expect(symbolDrip([])).toBeNull();
  expect(dripToBuy([{ shares: 0.14, usd: 7.33 }, null, { shares: -1, usd: -50 }, { shares: 0.04, usd: 2.1 }])).toBe(9.43);
});

test('the name of what is shown: All accounts, a group, up to three accounts by name, else a count', () => {
  const acct = (number: string, name: string): Account => ({ number, name, group: 'G', asOf: '' });
  const words = { all: 'All accounts', count: (n: number) => `${n} accounts` };
  const [a, b, c, d] = [acct('1', 'One'), acct('2', 'Two'), acct('3', 'Two ROTH IRA'), acct('4', 'Four')];
  expect(scopeTitle('all', [a!, b!, c!, d!], words)).toBe('All accounts');
  expect(scopeTitle('none', [], words)).toBe('All accounts');
  expect(scopeTitle('group:Retirement', [c!], words)).toBe('Retirement');
  expect(scopeTitle('account:1', [a!], words)).toBe('One');
  expect(scopeTitle('set:1,2,3', [a!, b!, c!], words)).toBe('One + Two + Two ROTH IRA');
  expect(scopeTitle('set:1,2,3,4', [a!, b!, c!, d!], words)).toBe('4 accounts');
});

// the pay dates as incomeIn built them before payDatesIn: every step up to two years each way, then the ones inside
const STEPS: Record<string, number> = { Monthly: 1, Quarterly: 3, 'Semi-annually': 6, Annually: 12 };
const allPayDates = (payDate: string, step: number | undefined, from: string, to: string): string[] =>
  (step ? Array.from({ length: 2 * Math.ceil(24 / step) + 1 }, (_, i) => addMonths(payDate, (i - Math.ceil(24 / step)) * step)) : [payDate]).filter((d) => d >= from && d <= to);

describe('payDatesIn: only the pay dates inside the period, the same ones the full list of steps gives', () => {
  test('a monthly payer over the year window', () => {
    expect(payDatesIn('2026-11-15', 1, '2026-01-01', '2026-12-31')).toEqual(Array.from({ length: 12 }, (_, i) => `2026-${String(i + 1).padStart(2, '0')}-15`));
  });
  test('an annual payer over the quarter window', () => {
    expect(payDatesIn('2025-11-15', 12, '2026-10-01', '2026-12-31')).toEqual(['2026-11-15']);
    expect(payDatesIn('2025-08-15', 12, '2026-10-01', '2026-12-31')).toEqual([]);
  });
  test('a pay date on the edge of the period counts, the day after does not', () => {
    expect(payDatesIn('2026-09-30', 3, '2026-10-01', '2026-12-31')).toEqual(['2026-12-30']);
    expect(payDatesIn('2026-10-01', 3, '2026-10-01', '2026-12-31')).toEqual(['2026-10-01']);
    expect(payDatesIn('2026-12-31', undefined, '2026-10-01', '2026-12-31')).toEqual(['2026-12-31']);
    expect(payDatesIn('2027-01-01', undefined, '2026-10-01', '2026-12-31')).toEqual([]);
    // the 31st clamped to a shorter month stays inside
    expect(payDatesIn('2026-01-31', 1, '2026-02-01', '2026-02-28')).toEqual(['2026-02-28']);
    // beyond two years no step reaches
    expect(payDatesIn('2020-01-15', 1, '2026-01-01', '2026-12-31')).toEqual([]);
  });
  test('the same as the full list for every frequency, pay day and period over three years', () => {
    const periods = ['2025-02-14', '2026-01-31', '2026-11-24', '2027-06-30'].flatMap((d) => { const b = periodBounds(d); return [b.month, b.quarter, b.year]; });
    let checked = 0;
    [undefined, 1, 3, 6, 12].forEach((step) => {
      for (let day = 0; day < 3 * 365; day += 3) {
        const payDate = new Date(Date.UTC(2024, 5, 1 + day)).toISOString().slice(0, 10);
        periods.forEach(([from, to]) => { expect(payDatesIn(payDate, step, from, to)).toEqual(allPayDates(payDate, step, from, to)); checked += 1; });
      }
    });
    expect(checked).toBeGreaterThan(5000);
  });
  test('incomeIn adds the same amounts in the same order as before', () => {
    const freq = [undefined, ...Object.keys(STEPS)];
    const ps: Position[] = Array.from({ length: 200 }, (_, i) => ({ account: 'A', kind: 'position', symbol: `S${i}`, description: '', dividendAmount: 0.01 * (i % 37) + 0.137, quantity: 1.3 + i / 7, payDate: new Date(Date.UTC(2025, 0, 1 + i * 4)).toISOString().slice(0, 10), paymentFrequency: freq[i % freq.length], fields: {} }));
    const before = (from: string, to: string, today: string) => {
      let paid = 0;
      let coming = 0;
      ps.forEach((p) => allPayDates(p.payDate!, STEPS[p.paymentFrequency ?? ''], from, to).forEach((d) => { if (d <= today) paid += p.dividendAmount! * p.quantity!; else coming += p.dividendAmount! * p.quantity!; }));
      const r = (x: number) => Math.round(x * 100) / 100;
      return { paid: r(paid), coming: r(coming), total: r(paid + coming) };
    };
    ['2026-02-14', '2026-11-24', '2027-01-01'].forEach((today) => {
      const b = periodBounds(today);
      [b.month, b.quarter, b.year].forEach(([from, to]) => expect(incomeIn(ps, from, to, today)).toEqual(before(from, to, today)));
    });
  });
});

test('payout parts over the symbol map are the same as over the positions', () => {
  const acct = (number: string): Account => ({ number, name: number, group: 'G', asOf: '' });
  const pos = (account: string, symbol: string, quantity: number, kind: Position['kind'] = 'position'): Position => ({ account, kind, symbol, description: '', lastPrice: 52.3, dividendAmount: 0.25, quantity, exDate: '2026-11-28', fields: {} });
  const ps = [pos('A', 'X', 0.1), pos('B', 'X', 0.2), pos('A', 'Y', 3), pos('A', 'X', 0.7), pos('C', 'X', 5, 'core'), pos('C', 'Y', 1)];
  const accounts = [acct('C'), acct('A'), acct('B')];
  const map = securitiesBySymbol(ps);
  expect(map.get('X')!.map((p) => p.quantity)).toEqual([0.1, 0.2, 0.7]); // the core row is not a security
  upcomingDividends(ps, '2026-11-24').forEach((u) => expect(payoutParts(map, accounts, u)).toEqual(payoutParts(ps, accounts, u)));
  expect(payoutParts(map, accounts, { ...upcomingDividends(ps, '2026-11-24')[0]!, symbol: 'GONE' })).toEqual([]);
});
