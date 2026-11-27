/// <reference types="bun" />
/// <reference types="node" />
/// <reference lib="esnext" />
// Merge (owner 2026-11-25): one line per ticker over the shown accounts. Every number here is made up
import { expect, test } from 'bun:test';
import type { Account, Position } from '../../shared/model';
import { dripGap, dripMin } from './derive';
import { FIELD_COLUMNS, positionColumn } from './position-columns';
import { FIELD_MERGE, MERGE_KINDS, PROPERTY_MERGE, RAW_OF, fieldMerge, mergeOn, mergePositions, toggleMerge, type MergedPosition } from './merge';
import { DEFAULT_PREFS, loadPrefs } from './prefs';

const acct = (number: string, balance: number): Account => ({ number, name: number, group: 'G', balance, asOf: '' });
// three accounts worth 40,000 together: the base of % of account
const ACCOUNTS = [acct('T0000001', 10000), acct('T0000002', 20000), acct('T0000003', 10000)];
const pos = (account: string, symbol: string, extra: Partial<Position> = {}): Position => ({ account, kind: 'position', symbol, description: `${symbol} DEMO`, fields: {}, ...extra });

const XYZ = [
  pos('T0000001', 'XYZ', { quantity: 10, lastPrice: 100, currentValue: 1000, todayGl: 20, todayGlPct: 2.04, totalGl: 200, totalGlPct: 25, costBasisTotal: 800, costBasisPerShare: 80, percentOfAccount: 10, estAnnualIncome: 30, distRate: 3,
    fields: { quantity: 10, current_value: 1000, today_gl: 20, cost_basis_per_share: 80, percent_of_account: 10, meta_account_type: 'Brokerage', meta_cost_basis_type: 'FIFO', meta_holding_type: 'Cash', volume: 1000, account_number: 'T0000001', note: 'same' } }),
  pos('T0000002', 'XYZ', { quantity: 20, lastPrice: 100.5, currentValue: 2000, todayGl: 40, totalGl: -200, costBasisTotal: 2200, percentOfAccount: 10, estAnnualIncome: 60, sector: 'Energy', distRate: 3.1,
    fields: { quantity: 20, current_value: 2000, today_gl: 40, cost_basis_per_share: 110, percent_of_account: 10, meta_account_type: 'ROTH IRA', meta_cost_basis_type: 'FIFO', meta_holding_type: 'Margin', volume: 1001, account_number: 'T0000002', note: 'same' } }),
  // no today's $ in this account (as Fidelity shows -- for it)
  pos('T0000003', 'XYZ', { quantity: 5, lastPrice: 100, currentValue: 500, totalGl: 100, costBasisTotal: 400, percentOfAccount: 5, estAnnualIncome: 15, sector: 'Utilities',
    fields: { quantity: 5, current_value: 500, cost_basis_per_share: 80, percent_of_account: 5, meta_account_type: 'Brokerage', meta_cost_basis_type: 'FIFO', meta_holding_type: 'Cash', account_number: 'T0000003', note: 'same' } }),
];
const ONE = pos('T0000002', 'ONE', { quantity: 4, lastPrice: 500, currentValue: 2000, todayGl: 30, todayGlPct: 1.52, totalGl: 400, totalGlPct: 25, costBasisTotal: 1600, costBasisPerShare: 400, percentOfAccount: 10, fields: { quantity: 4, current_value: 2000, percent_of_account: 10 } });
const CASH = [pos('T0000001', 'SPAXX', { kind: 'core', currentValue: 300, secYield: 3.5 }), pos('T0000002', 'SPAXX', { kind: 'core', currentValue: 700, secYield: 3.5 })];
const PENDING = [pos('T0000001', 'Pending activity', { kind: 'pending', currentValue: -16 }), pos('T0000003', 'Pending activity', { kind: 'pending', currentValue: -4 })];
const ZERO = [pos('T0000001', 'ZERO', { quantity: 1, currentValue: 50, totalGl: 50, costBasisTotal: 0 }), pos('T0000003', 'ZERO', { quantity: 1, currentValue: 50, costBasisTotal: 0 })];

const merged = mergePositions([CASH[0]!, ...XYZ, ONE, CASH[1]!, ...PENDING, ...ZERO], ACCOUNTS);
// a column's number for a position (every Positions column has one, typed optional)
const value = (key: string, p: Position) => positionColumn(key).value?.(p);
const line = (symbol: string, kind = 'position'): MergedPosition => merged.find((p) => p.symbol === symbol && p.kind === kind)!;

test('one line per ticker and kind, in the order each first comes, with the accounts that hold it', () => {
  expect(merged.map((p) => `${p.kind}:${p.symbol}`)).toEqual(['core:SPAXX', 'position:XYZ', 'position:ONE', 'pending:Pending activity', 'position:ZERO']);
  expect(line('XYZ').accounts).toEqual(['T0000001', 'T0000002', 'T0000003']);
  expect(line('XYZ').account).toBe(''); // no single account: `accounts` lists them
});

test('a ticker in all three accounts: dollars and shares summed, the percents worked out again from the sums', () => {
  const x = line('XYZ');
  expect([x.quantity, x.currentValue, x.todayGl, x.totalGl, x.costBasisTotal, x.estAnnualIncome]).toEqual([35, 3500, 60, 100, 3400, 105]);
  // Today's %: 60 over the value before today's move of the two accounts that give today's $: 980 + 1960 = 2940
  expect(x.todayGlPct).toBe(2.040816);
  // Total %: 100 / 3400; the average cost: 3400 / 35 shares
  expect(x.totalGlPct).toBe(2.941176);
  expect(x.costBasisPerShare).toBe(97.142857);
  // % of account: 3500 of the 40,000 the three accounts are worth together
  expect(x.percentOfAccount).toBe(8.75);
});

test('static fields take the first value given, also when the accounts differ', () => {
  const x = line('XYZ');
  expect(x.lastPrice).toBe(100);
  expect(x.distRate).toBe(3);
  expect(x.sector).toBe('Energy'); // the first account has none
  expect(x.description).toBe('XYZ DEMO');
});

test('the fields JSON: raw sums and percents follow the merged values, static first, agree or nothing, blank goes', () => {
  const f = line('XYZ').fields;
  expect([f.quantity, f.current_value, f.today_gl, f.cost_basis_per_share, f.percent_of_account]).toEqual([35, 3500, 60, 97.142857, 8.75]);
  expect(f.volume).toBe(1000); // static: the first
  expect(f.meta_cost_basis_type).toBe('FIFO'); // agree: all FIFO
  expect('meta_holdingType' in f).toBe(false); // agree: Cash and Margin differ
  expect('meta_acctType' in f).toBe(false); // blank
  expect('actNum' in f).toBe(false); // a field no column shows: only when every account agrees
  expect(f.note).toBe('same');
  // the columns read the merged line like any position
  expect(value('avgCost', line('XYZ'))).toBe(97.142857);
  expect(positionColumn('costMethod').text(line('XYZ'))).toBe('FIFO');
  expect(positionColumn('acctType').text(line('XYZ'))).toBe('');
});

test('a ticker of one account keeps its row; only % of account is worked out over all the shown accounts', () => {
  const o = line('ONE');
  const { percentOfAccount, fields, ...rest } = ONE;
  expect(o).toEqual({ ...rest, percentOfAccount: 5, fields: { ...fields, percent_of_account: 5 }, accounts: ['T0000002'], drip: null, dripAdjUsd: null });
  expect(o.todayGlPct).toBe(1.52); // Fidelity's own, not worked out again
});

test('cash and pending activity merge by symbol among themselves, summed', () => {
  expect(line('SPAXX', 'core')).toMatchObject({ currentValue: 1000, secYield: 3.5, accounts: ['T0000001', 'T0000002'] });
  expect(line('Pending activity', 'pending')).toMatchObject({ currentValue: -20, accounts: ['T0000001', 'T0000003'] });
});

test('a zero cost basis gives an empty Total % and average cost, never NaN or Infinity', () => {
  const z = line('ZERO');
  expect(z.costBasisTotal).toBe(0);
  expect(z.totalGl).toBe(50);
  expect('totalGlPct' in z).toBe(false);
  expect('costBasisPerShare' in z).toBe(false);
  expect('todayGlPct' in z).toBe(false); // no account gives today's $
  expect(value('totalGlPct', z)).toBeUndefined();
  // nothing to divide by at all: no balances and no values
  const lone = mergePositions([pos('T0000001', 'N', { quantity: 1 }), pos('T0000002', 'N', { quantity: 2 })], [acct('T0000001', 0), acct('T0000002', 0)])[0]!;
  expect(lone.quantity).toBe(3);
  expect('percentOfAccount' in lone).toBe(false);
});

test('DRIP of a merged line: each account\'s own DRIP added up (owner: "aggregate drips similarly like we do for gains")', () => {
  // the owner's example: the ticker needs 12 shares, one account holds 5 (+7), the other 20 (-8): the line shows -1
  const d = (account: string, quantity: number) => pos(account, 'DRP', { quantity, lastPrice: 1500, dividendAmount: 0.125 });
  const [m] = mergePositions([d('T0000001', 5), d('T0000002', 20)], ACCOUNTS);
  expect(dripGap(d('T0000001', 5))).toEqual({ shares: 7, usd: 10500 });
  expect(dripGap(d('T0000002', 20))).toEqual({ shares: -8, usd: -12000 });
  expect(m!.drip).toEqual({ shares: -1, usd: -1500 });
  // the DRIP columns read it (not dripGap of the summed 25 shares, which would say -13)
  expect(value('drip', m!)).toBe(-1);
  expect(value('dripUsd', m!)).toBe(-1500);
  // a ticker of one account: its own dripGap
  const [single] = mergePositions([d('T0000001', 5)], ACCOUNTS);
  expect(single!.drip).toEqual(dripGap(d('T0000001', 5)));
  // Min. DRIP is the ticker's own: the merged line shows what each account shows, 12 shares or $18,000
  expect(dripMin(m!)).toEqual({ shares: 12, usd: 18000 });
  expect(dripMin(d('T0000001', 5))).toEqual(dripMin(m!));
  expect(dripMin(d('T0000002', 20))).toEqual(dripMin(m!));
  expect(value('dripMin', m!)).toBe(12);
  expect(value('dripMinUsd', m!)).toBe(18000);
  // the adjusted dollars: far above a dollar here, so the same as DRIP $ and Min. DRIP $
  expect(value('dripAdjUsd', m!)).toBe(-1500);
  expect(value('dripMinAdjUsd', m!)).toBe(18000);
});

test('Adj. DRIP $ of a merged line: the order of each account is brought up to one dollar first, then added up', () => {
  // a cheap ticker: 0.5 share is enough for DRIP, the price is $1 -> an account holding 0.2 has to buy $0.30, shown as $1
  const cheap = (account: string, quantity: number) => pos(account, 'CHP', { quantity, lastPrice: 1, dividendAmount: 0.02 });
  const one = cheap('T0000001', 0.2);
  const gap = dripGap(one)!;
  expect(gap.usd).toBeGreaterThan(0);
  expect(gap.usd).toBeLessThan(1);
  const [single] = mergePositions([one], ACCOUNTS);
  expect(single!.dripAdjUsd).toBe(1);
  expect(value('dripUsd', single!)).toBe(gap.usd); // DRIP $ itself is not changed
  // two accounts short by cents each: two orders of one dollar
  const [both] = mergePositions([cheap('T0000001', 0.2), cheap('T0000002', 0.3)], ACCOUNTS);
  expect(both!.dripAdjUsd).toBe(2);
  expect(value('dripAdjUsd', both!)).toBe(2);
});

test('shares on loan: yes when on loan in any account (owner: "loaned should show yes if loaned in any account")', () => {
  const l = (account: string, isLoaned?: boolean) => pos(account, 'LND', { quantity: 1, fields: isLoaned === undefined ? {} : { is_loaned: isLoaned } });
  const merge = (...ps: Position[]) => mergePositions(ps, ACCOUNTS)[0]!;
  const loaned = (p: Position) => positionColumn('loaned').text(p);
  expect(loaned(merge(l('T0000001', false), l('T0000002', true), l('T0000003', false)))).toBe('✓');
  // none on loan: as one account shows it
  const none = merge(l('T0000001', false), l('T0000002', false), l('T0000003', false));
  expect(none.fields.is_loaned).toBe(false);
  expect(loaned(none)).toBe(loaned(l('T0000001', false)));
  // a missing value in one account does not turn a yes into empty
  expect(loaned(merge(l('T0000001'), l('T0000002', true)))).toBe('✓');
  expect('is_loaned' in merge(l('T0000001'), l('T0000002')).fields).toBe(false);
  expect(fieldMerge('is_loaned')).toBe('any');
});

test('every model field and every Fidelity column has a merge kind, and the raw fields agree with their properties', () => {
  const sample: Required<Omit<Position, 'fields'>> = { account: '', kind: 'position', symbol: '', description: '', cusip: '', securityType: '', securitySubType: '', quantity: 0, lastPrice: 0, lastPriceChange: 0, lastPriceChangePct: 0, currentValue: 0, todayGl: 0, todayGlPct: 0, totalGl: 0, totalGlPct: 0, costBasisTotal: 0, costBasisPerShare: 0, percentOfAccount: 0, distRate: 0, secYield: 0, estAnnualIncome: 0, dividendAmount: 0, paymentFrequency: '', exDate: '', payDate: '', marketCap: 0, marketCapText: '', sector: '', industry: '', low52: 0, high52: 0 };
  expect(Object.keys(PROPERTY_MERGE).sort()).toEqual(Object.keys(sample).sort());
  Object.values(PROPERTY_MERGE).forEach((k) => expect(MERGE_KINDS).toContain(k));
  FIELD_COLUMNS.forEach((c) => {
    expect(MERGE_KINDS).toContain(c.merge);
    expect(fieldMerge(c.field)).toBe(RAW_OF[c.field] ? PROPERTY_MERGE[RAW_OF[c.field]!] : c.merge);
    // a summed or worked-out field column has its merged property to take the value from
    if (c.merge === 'recomputed') expect(RAW_OF[c.field]).toBeDefined();
    if (RAW_OF[c.field]) expect(c.merge).toBe(PROPERTY_MERGE[RAW_OF[c.field]!]);
  });
  expect(FIELD_MERGE.day_range_low).toBe('static');
  expect(fieldMerge('somethingNew')).toBe('agree');
});

test('merge applies with more than one account only; the switch opens Positions; the choice is a remembered pref', () => {
  expect(mergeOn(true, 2)).toBe(true);
  expect(mergeOn(true, 1)).toBe(false);
  expect(mergeOn(false, 3)).toBe(false);
  expect(toggleMerge({ merge: false })).toEqual({ merge: true, tab: 'positions' });
  expect(toggleMerge({ merge: true })).toEqual({ merge: false, tab: 'positions' });
  expect(DEFAULT_PREFS.merge).toBe(false);
  expect(loadPrefs({ getItem: () => '{"merge":true}' }).merge).toBe(true);
  expect(loadPrefs({ getItem: () => '{"merge":"yes"}' }).merge).toBe(false);
});
