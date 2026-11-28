/// <reference types="bun" />
/// <reference lib="esnext" />
import { expect, test } from 'bun:test';
import { choicePart, choicesOf, clearChoices, filterParts, pickedChoices, toggleChoice } from './choice-filter';
import { filterRows } from './typed-columns';

const ROWS = ['Demo ···0043', 'Demo ROTH ···0730', 'Other ROTH ···5975', 'Stocks ···7325'].map((account) => ({ account }));
const COLS = [{ key: 'account', text: (r: { account: string }) => r.account }];
const shown = (filter: string) => filterRows(ROWS, COLS, { account: 'string' }, { account: filter }).map((r) => r.account);

test('a pick is an exact match the filter engine understands; several picks are OR', () => {
  expect(choicePart('Demo ···0043')).toBe('="Demo ···0043"');
  // exact: "Demo" alone would also show "Demo ROTH"
  expect(shown(toggleChoice('', 'Demo ···0043'))).toEqual(['Demo ···0043']);
  const two = toggleChoice(toggleChoice('', 'Demo ···0043'), 'Stocks ···7325');
  expect(two).toBe('="Demo ···0043", ="Stocks ···7325"');
  expect(shown(two)).toEqual(['Demo ···0043', 'Stocks ···7325']);
});

test('picking again takes the value out; what was typed by hand stays', () => {
  const all = ROWS.map((r) => r.account);
  let text = toggleChoice('roth', 'Stocks ···7325');
  expect(text).toBe('roth, ="Stocks ···7325"');
  expect(shown(text)).toEqual(['Demo ROTH ···0730', 'Other ROTH ···5975', 'Stocks ···7325']);
  expect(pickedChoices(text, all)).toEqual(['Stocks ···7325']);
  text = toggleChoice(text, 'Stocks ···7325');
  expect(text).toBe('roth');
  expect(pickedChoices(text, all)).toEqual([]);
  expect(clearChoices('roth, ="Stocks ···7325", ="Demo ···0043"', all)).toBe('roth');
  expect(clearChoices('="Stocks ···7325"', all)).toBe('');
});

test('a comma inside quotes does not cut a part; the offered values are the shown texts, once each', () => {
  expect(filterParts('="a, b", c ,, "d"')).toEqual(['="a, b"', 'c', '"d"']);
  expect(pickedChoices('="STOCKS ···7325"', ['Stocks ···7325'])).toEqual(['Stocks ···7325']); // any case
  expect(choicesOf([{ t: 'Dividend' }, { t: 'Interest' }, { t: 'Dividend' }, { t: '' }], (r) => r.t)).toEqual(['Dividend', 'Interest']);
});
