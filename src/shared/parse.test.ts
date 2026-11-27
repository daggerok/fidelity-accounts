/// <reference types="bun" />
/// <reference types="node" />
/// <reference lib="esnext" />
import { expect, test } from 'bun:test';
import { ROWS, SIDEBAR } from './fixtures/grid';
import { buildDataset, flatten, isoDate, money, positionOf } from './parse';

test('dates and money as the site shows them', () => {
  expect(isoDate('Dec-12-2026')).toBe('2026-12-12');
  expect(isoDate('--')).toBeNull();
  expect(money('$1,234.56')).toBe(1234.56);
  expect(money('-$12.00')).toBe(-12);
  expect(money('(+5.71%)')).toBe(5.71);
  expect(money('--')).toBeUndefined();
  expect(money('Quarterly')).toBeUndefined();
});

test('flatten keeps every field: dates as ISO, numbers as numbers, words for codes, numbers with words twice', () => {
  const f = flatten(ROWS[2]!);
  expect(f.ex_dv_dte).toBe('2026-12-12');
  expect(f.qty).toBe(2.5);
  expect(f.dividend_frequency).toBe('Quarterly');
  expect(f.market_cap).toBe(234930000000);
  expect(f.market_cap_text).toBe('Large cap ($234.93B)');
  expect(f.fif_two_low).toBe(300);
  expect(f.sym_desc).toBe('ALPHA DEMO CORP');
  expect(f.meta_security_type).toBe('Equity');
  expect(f.sec_yld).toBeUndefined(); // "--"
  expect(f.mstar_rate).toBeUndefined();
  expect(f.display_icons).toBe('[{"type":"E"}]');
  expect(Object.keys(f).some((k) => k.startsWith('tradActns'))).toBe(false);
});

test('a position row becomes a Position; account rows do not', () => {
  const p = positionOf(ROWS[2]!)!;
  expect(p).toMatchObject({ account: 'X10000001', kind: 'position', symbol: 'AAAA', quantity: 2.5, lastPrice: 400, currentValue: 1000, todayGlPct: 1, exDate: '2026-12-12', payDate: '2027-01-05', paymentFrequency: 'Quarterly', low52: 300, high52: 410, sector: 'Energy' });
  expect(positionOf(ROWS[1]!)).toMatchObject({ kind: 'core', symbol: 'SPAXX', currentValue: 25.5, secYield: 3.58 });
  expect(positionOf(ROWS[3]!)).toMatchObject({ kind: 'pending', symbol: 'Pending activity', currentValue: -16.46 });
  expect(positionOf(ROWS[0]!)).toBeNull();
  expect(positionOf(ROWS[5]!)).toBeNull();
});

test('buildDataset: accounts from the list completed by the grid totals, cash and pending summed', () => {
  const ds = buildDataset({ rows: ROWS, sidebar: SIDEBAR, asOf: 'As of Nov-20-2026 4:01 p.m. ET', builtAt: '2026-11-20T21:01:00.000Z' });
  expect(ds.accounts.map((a) => [a.number, a.group, a.type])).toEqual([['X10000001', 'Investment', 'Brokerage'], ['200000002', 'Retirement', 'ROTH IRA']]);
  expect(ds.accounts[0]).toMatchObject({ balance: 1525.5, todayGl: 12.3, totalGl: 100, costBasis: 900, estAnnualIncome: 25, cash: 25.5, pending: -16.46 });
  expect(ds.positions.map((p) => `${p.account}:${p.kind}:${p.symbol}`)).toEqual(['X10000001:core:SPAXX', 'X10000001:position:AAAA', 'X10000001:pending:Pending activity', '200000002:position:BBBB']);
  expect(ds.warnings).toEqual([]);
  // an account seen only in the grid lands in "Other"
  const lone = buildDataset({ rows: ROWS, sidebar: [], asOf: null, builtAt: 't' });
  expect(lone.accounts.map((a) => a.group)).toEqual(['Other', 'Other']);
  expect(buildDataset({ rows: [], sidebar: [], asOf: null, builtAt: 't' }).warnings).toEqual(['the positions grid had no rows']);
});
