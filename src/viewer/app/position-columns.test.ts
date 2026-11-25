/// <reference types="bun" />
/// <reference lib="esnext" />
import { expect, test } from 'bun:test';
import type { Position } from '../../shared/model';
import { columnTypes, filterRows } from '../../shared/typed-columns';
import { positionColumn, sortPositions } from './position-columns';

// made-up positions
const pos = (symbol: string, more: Partial<Position> = {}): Position => ({ account: 'A', kind: 'position', symbol, description: `${symbol} DEMO`, fields: {}, ...more });
const syms = (ps: Position[]) => ps.map((p) => p.symbol).join(' ');
const PS = [
  pos('QQ', { paymentFrequency: 'Quarterly', marketCap: 3e9, exDate: '2026-12-12', payDate: '2027-01-05', sector: 'Energy', lastPrice: 52.3, dividendAmount: 0.25, quantity: 0.1, currentValue: 5.23, low52: 40, high52: 60 }),
  pos('MM', { paymentFrequency: 'Monthly', marketCapText: 'Mid cap ($9.50B)', exDate: '2026-11-30', payDate: '2026-12-03', sector: 'Utilities', lastPrice: 10, dividendAmount: 0.05, quantity: 100, currentValue: 1000, low52: 9, high52: 10 }),
  pos('AA', { paymentFrequency: 'Annually', marketCap: 250e9, marketCapText: 'Large cap ($250.00B)', exDate: '2027-03-01', sector: '--', lastPrice: 200, quantity: 2, currentValue: 400, low52: 190, high52: 400 }),
  pos('SS', { paymentFrequency: 'Semi-annually', marketCap: 800e6, payDate: '2026-12-20', lastPrice: 5, quantity: 10, currentValue: 50 }),
  pos('NN'),
];
const KEYS = ['symbol', 'drip', 'dripUsd', 'currentValue', 'quantity', 'paymentFrequency', 'marketCap', 'high52', 'exDate', 'payDate', 'sector'];
const COLS = KEYS.map(positionColumn);
const TYPES = columnTypes(COLS, PS).types;

test('every Positions column gets its type from what it shows', () => {
  expect(TYPES).toEqual({ symbol: 'string', drip: 'number', dripUsd: 'currency', currentValue: 'currency', quantity: 'number', paymentFrequency: 'frequency', marketCap: 'currency', high52: 'percent', exDate: 'date', payDate: 'date', sector: 'string' });
});

test('payment frequency: desc from monthly to annually, asc from annually to monthly (it was alphabetical)', () => {
  expect(syms(sortPositions(PS, 'paymentFrequency', -1))).toBe('MM QQ SS AA NN');
  expect(syms(sortPositions(PS, 'paymentFrequency', 1))).toBe('AA SS QQ MM NN');
});

test('market cap sorts by the number, also the one inside Fidelity\'s words when no number came', () => {
  expect(syms(sortPositions(PS, 'marketCap', -1))).toBe('AA MM QQ SS NN');
  expect(syms(sortPositions(PS, 'marketCap', 1))).toBe('SS QQ MM AA NN');
  expect(syms(filterRows(PS, COLS, TYPES, { marketCap: '>5B' }))).toBe('MM AA');
});

test('ex and pay dates sort by the calendar, no date last', () => {
  expect(syms(sortPositions(PS, 'exDate', 1))).toBe('MM QQ AA SS NN');
  expect(syms(sortPositions(PS, 'exDate', -1))).toBe('AA QQ MM SS NN');
  expect(syms(sortPositions(PS, 'payDate', 1))).toBe('MM SS QQ AA NN');
  expect(syms(filterRows(PS, COLS, TYPES, { exDate: '<Dec-01-2026' }))).toBe('MM');
  expect(syms(filterRows(PS, COLS, TYPES, { payDate: '2026-12' }))).toBe('MM SS');
});

test('DRIP and DRIP $ sort by the gap, the 52-week range by where the price sits in it; nothing to show goes last', () => {
  // QQ needs 0.14 share more, MM already reinvests; the rest pay no known dividend
  expect(syms(sortPositions(PS, 'drip', -1))).toBe('QQ MM AA SS NN');
  expect(syms(sortPositions(PS, 'dripUsd', 1))).toBe('MM QQ AA SS NN');
  expect(syms(sortPositions(PS, 'high52', -1))).toBe('MM QQ AA SS NN');
  expect(syms(sortPositions(PS, 'high52', 1))).toBe('AA QQ MM SS NN');
  expect(syms(filterRows(PS, COLS, TYPES, { high52: '>=60' }))).toBe('QQ MM');
  expect(syms(filterRows(PS, COLS, TYPES, { drip: '>0' }))).toBe('QQ');
});

test('text columns: A to Z in any case, "--" and nothing last in both directions', () => {
  expect(syms(sortPositions(PS, 'sector', 1))).toBe('QQ MM AA SS NN');
  expect(syms(sortPositions(PS, 'sector', -1))).toBe('MM QQ AA SS NN');
  expect(syms(sortPositions(PS, 'symbol', 1))).toBe('AA MM NN QQ SS');
});

test('the Symbol filter is the search by symbol or name', () => {
  expect(syms(filterRows(PS, COLS, TYPES, { symbol: 'mm' }))).toBe('MM');
  expect(syms(filterRows(PS, COLS, TYPES, { symbol: 'demo' }))).toBe('QQ MM AA SS NN');
  expect(syms(filterRows(PS, COLS, TYPES, { symbol: 'qq, ss' }))).toBe('QQ SS');
  expect(syms(filterRows(PS, COLS, TYPES, { symbol: 'zzz' }))).toBe('');
});

test('a column with no entry reads its own field or the grid field, typed like the rest', () => {
  const ps = [pos('B', { costBasisPerShare: 5, fields: { fooRate: '2.5%' } }), pos('A', { costBasisPerShare: 20, fields: { fooRate: '10%' } }), pos('C')];
  expect(syms(sortPositions(ps, 'costBasisPerShare', -1))).toBe('A B C');
  expect(columnTypes([positionColumn('fooRate')], ps).types.fooRate).toBe('percent');
  expect(syms(sortPositions(ps, 'fooRate', 1))).toBe('B A C');
});
