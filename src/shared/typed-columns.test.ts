/// <reference types="bun" />
/// <reference lib="esnext" />
import { expect, test } from 'bun:test';
import { ALL_TYPES, activeFilters, cleanFilters, cleanTypes, columnTypes, compile, detectType, filterRows, isoDates, nextSort, perYear, sortRows, withFilter, withType, type TypedColumn } from './typed-columns';

// made-up rows
interface Row { sym: string; price?: number; yld?: number; ex?: string; freq?: string; cap?: number; note?: string }
const ROWS: Row[] = [
  { sym: 'AAAA', price: 400, yld: 2.5, ex: 'Dec-12-2026', freq: 'Quarterly', cap: 234930000000, note: 'Energy' },
  { sym: 'BBBB', price: 80.5, yld: 11.25, ex: 'Nov-30-2026', freq: 'Monthly', cap: 5200000, note: 'Real Estate' },
  { sym: 'CCCC', price: 1250, yld: 0.4, ex: 'Jan-05-2027', freq: 'Annually', note: 'energy services' },
  { sym: 'DDDD', freq: 'Semi-annually', cap: 91000000000 },
  { sym: 'EEEE', price: 9.99, yld: 5, ex: 'Dec-01-2026', freq: 'Monthly', cap: 700000000, note: '--' },
];
const usd = (n?: number) => (n === undefined ? '--' : `$${n.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
const C: Record<string, TypedColumn<Row>> = {
  sym: { key: 'sym', text: (r) => r.sym },
  price: { key: 'price', text: (r) => usd(r.price), value: (r) => r.price },
  yld: { key: 'yld', text: (r) => (r.yld === undefined ? '--' : `${r.yld.toFixed(2)}%`), value: (r) => r.yld },
  ex: { key: 'ex', text: (r) => r.ex ?? '--' },
  freq: { key: 'freq', text: (r) => r.freq ?? '' },
  cap: { key: 'cap', text: (r) => (r.cap === undefined ? '--' : `$${(r.cap / 1e9).toFixed(2)}B`), value: (r) => r.cap },
  note: { key: 'note', text: (r) => r.note ?? '' },
};
const COLS = Object.keys(C).map((k) => C[k]!);
const TYPES = columnTypes(COLS, ROWS).types;
const NOW = Date.UTC(2026, 10, 24);
const syms = (rows: Row[]) => rows.map((r) => r.sym).join(' ');
const keep = (key: string, filter: string) => syms(filterRows(ROWS, COLS, TYPES, { [key]: filter }, NOW));

test('types are detected from the cell texts: money, percent, the Fidelity date, frequency, text', () => {
  expect(TYPES).toEqual({ sym: 'string', price: 'currency', yld: 'percent', ex: 'date', freq: 'frequency', cap: 'currency', note: 'string' });
  expect(detectType(['1', '2.5', '-3', '--'])).toBe('number');
  expect(detectType(['2026-12-12', '2027-01-05'])).toBe('date');
  expect(detectType(['Monthly', 'Quarterly', 'Semi-annually', 'Annually', 'n/a'])).toBe('frequency');
  expect(detectType([])).toBe('string');
  expect(detectType(['--', ''])).toBe('string');
  // 80% of the filled cells must agree, as in the engine
  expect(detectType(['Monthly', 'Monthly', 'Monthly', 'Monthly', 'other'])).toBe('frequency');
  expect(detectType(['Monthly', 'Monthly', 'Monthly', 'other', 'words'])).toBe('string');
  expect(detectType(['$1.00', '$2.00', '$3.00', 'x', 'y'])).toBe('string');
  expect(isoDates('>Dec-01-2026 <jan-5-2027, Foo-01-2026')).toBe('>2026-12-01 <2027-01-05, Foo-01-2026');
});

test('a type set by the owner wins, the detected one is kept next to it', () => {
  const t = columnTypes(COLS, ROWS, { note: 'frequency' });
  expect(t.types.note).toBe('frequency');
  expect(t.detected.note).toBe('string');
});

test('payment frequency sorts by payments a year: desc from monthly to annually, asc the reverse, empty last', () => {
  expect([perYear('Monthly'), perYear('Quarterly'), perYear('Semi-annually'), perYear('Annually')]).toEqual([12, 4, 2, 1]);
  expect(perYear('Semi-Annual')).toBe(2);
  expect(Number.isNaN(perYear('sometimes'))).toBe(true);
  const rows = ROWS.concat({ sym: 'NONE' });
  expect(syms(sortRows(rows, C.freq!, 'frequency', -1))).toBe('BBBB EEEE AAAA DDDD CCCC NONE');
  expect(syms(sortRows(rows, C.freq!, 'frequency', 1))).toBe('CCCC DDDD AAAA BBBB EEEE NONE');
  // as text it was alphabetical: Annually, Monthly, Quarterly, Semi-annually
  expect(syms(sortRows(ROWS, C.freq!, 'string', 1))).toBe('CCCC BBBB EEEE AAAA DDDD');
});

test('numbers, money, percents and dates sort by value, empty cells last in both directions, ties keep their order', () => {
  expect(syms(sortRows(ROWS, C.price!, TYPES.price!, -1))).toBe('CCCC AAAA BBBB EEEE DDDD');
  expect(syms(sortRows(ROWS, C.price!, TYPES.price!, 1))).toBe('EEEE BBBB AAAA CCCC DDDD');
  expect(syms(sortRows(ROWS, C.cap!, TYPES.cap!, -1))).toBe('AAAA DDDD EEEE BBBB CCCC');
  expect(syms(sortRows(ROWS, C.ex!, TYPES.ex!, 1))).toBe('BBBB EEEE AAAA CCCC DDDD');
  expect(syms(sortRows(ROWS, C.ex!, TYPES.ex!, -1))).toBe('CCCC AAAA EEEE BBBB DDDD');
  expect(syms(sortRows(ROWS, C.note!, 'string', 1))).toBe('AAAA CCCC BBBB DDDD EEEE'); // any case, "--" is empty
  expect(syms(sortRows(ROWS, C.note!, 'string', -1))).toBe('BBBB CCCC AAAA DDDD EEEE');
  // a number column without the exact value reads its text
  expect(syms(sortRows(ROWS, { key: 'p', text: C.price!.text }, 'currency', -1))).toBe('CCCC AAAA BBBB EEEE DDDD');
});

test('number, money and percent filters: comparisons, ranges, suffixes, $, empty', () => {
  expect(keep('price', '>100')).toBe('AAAA CCCC');
  expect(keep('price', '>$1000')).toBe('CCCC');
  expect(keep('price', '>1K')).toBe('CCCC');
  expect(keep('price', '>$1,000')).toBe('AAAA BBBB CCCC EEEE'); // the engine's comma is always OR: >$1 or =000, so thousands go without it
  expect(keep('price', '>=80.5 <=400')).toBe('AAAA BBBB');
  expect(keep('price', '<10, >1000')).toBe('CCCC EEEE');
  expect(keep('price', '50..500')).toBe('AAAA BBBB');
  expect(keep('price', '?')).toBe('DDDD');
  expect(keep('price', '!?')).toBe('AAAA BBBB CCCC EEEE');
  expect(keep('cap', '>1B')).toBe('AAAA DDDD');
  expect(keep('cap', '..700M')).toBe('BBBB EEEE');
  expect(keep('yld', '>5')).toBe('BBBB');
  expect(keep('yld', '>=5%')).toBe('BBBB EEEE');
  expect(keep('yld', '!>5')).toBe('AAAA CCCC DDDD EEEE'); // an empty cell passes a negated condition
});

test('date filters take ISO and the Fidelity form, whole months and ranges', () => {
  expect(keep('ex', '>2026-12-01')).toBe('AAAA CCCC');
  expect(keep('ex', '>Dec-01-2026')).toBe('AAAA CCCC');
  expect(keep('ex', '>=Dec-01-2026')).toBe('AAAA CCCC EEEE');
  expect(keep('ex', '2026-12')).toBe('AAAA EEEE');
  expect(keep('ex', '2026-11..2026-12')).toBe('AAAA BBBB EEEE');
  expect(keep('ex', 'today.. <2027')).toBe('AAAA BBBB EEEE');
  expect(keep('ex', '+1m..')).toBe('CCCC');
});

test('frequency filters take words, their starts, or payments a year', () => {
  expect(keep('freq', 'monthly')).toBe('BBBB EEEE');
  expect(keep('freq', 'Monthly, quarterly')).toBe('AAAA BBBB EEEE');
  expect(keep('freq', '!monthly')).toBe('AAAA CCCC DDDD');
  expect(keep('freq', '>=quarterly')).toBe('AAAA BBBB EEEE');
  expect(keep('freq', '<4')).toBe('CCCC DDDD');
  expect(keep('freq', 'semi')).toBe('DDDD');
  expect(keep('freq', 'semi-annually, ann')).toBe('CCCC DDDD');
  expect(keep('freq', '1..2')).toBe('CCCC DDDD');
  expect(compile('sometimes', 'frequency')).toEqual({ ok: false, error: 'cannot read "sometimes" as payment frequency' });
});

test('text filters: contains in any case, space is AND, comma is OR, ! is NOT, quotes keep a phrase', () => {
  expect(keep('note', 'energy')).toBe('AAAA CCCC');
  expect(keep('note', 'ENERGY services')).toBe('CCCC');
  expect(keep('note', 'estate, services')).toBe('BBBB CCCC');
  expect(keep('note', '!energy')).toBe('BBBB DDDD EEEE');
  expect(keep('note', '"real estate"')).toBe('BBBB');
  expect(keep('note', '=energy')).toBe('AAAA');
  expect(keep('note', '?')).toBe('DDDD EEEE');
});

test('filters of several columns all apply; one that cannot be read is ignored and says why', () => {
  expect(syms(filterRows(ROWS, COLS, TYPES, { freq: 'monthly', price: '<50' }, NOW))).toBe('EEEE');
  expect(syms(filterRows(ROWS, COLS, TYPES, { price: 'abc', freq: 'monthly' }, NOW))).toBe('BBBB EEEE');
  expect(compile('abc', 'currency')).toEqual({ ok: false, error: 'cannot read "abc" as money' });
  expect(compile('  ', 'string')).toBeNull();
  expect(filterRows(ROWS, COLS, TYPES, {})).toBe(ROWS);
  expect(activeFilters({ a: '>1', b: ' ', c: 'x' })).toBe(2);
});

test('header rules: sort direction, a filter set and removed, the type cycle, saved values cleaned', () => {
  expect(nextSort(null, 'note', 'string')).toEqual({ key: 'note', dir: 1 });
  expect(nextSort({ key: 'note', dir: 1 }, 'note', 'string')).toEqual({ key: 'note', dir: -1 });
  expect(nextSort({ key: 'note', dir: 1 }, 'price', 'currency')).toEqual({ key: 'price', dir: -1 });
  expect(nextSort({ key: 'note', dir: 1 }, 'freq', 'frequency')).toEqual({ key: 'freq', dir: -1 }); // monthly first
  expect(withFilter({ a: '1' }, 'b', '>2')).toEqual({ a: '1', b: '>2' });
  expect(withFilter({ a: '1', b: '>2' }, 'a', ' ')).toEqual({ b: '>2' });
  expect(withType({}, 'a', 'string', 'string', false)).toEqual({ a: 'number' });
  expect(withType({ a: 'time' }, 'a', 'time', 'string', false)).toEqual({ a: 'frequency' });
  expect(withType({ a: 'frequency' }, 'a', 'frequency', 'string', false)).toEqual({}); // round the cycle: detected again
  expect(withType({ a: 'date' }, 'a', 'date', 'number', true)).toEqual({});
  expect(ALL_TYPES).toHaveLength(8);
  expect(cleanFilters({ a: '>1', b: '', c: 3 })).toEqual({ a: '>1' });
  expect(cleanTypes({ a: 'percent', b: 'x' })).toEqual({ a: 'percent' });
});
