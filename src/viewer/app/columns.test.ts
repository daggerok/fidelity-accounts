/// <reference types="bun" />
/// <reference lib="esnext" />
import { expect, test } from 'bun:test';
import { arrange, filterColumns, moveKey, orderAfterDrag, shownKeys, toggleKeys } from './columns';

const ALL = ['drip', 'dripUsd', 'gl', 'value', 'price'];

test('the owner order comes first, unknown and repeated keys drop, new columns keep their default place after it', () => {
  expect(arrange(ALL, [])).toEqual(ALL);
  expect(arrange(ALL, ['price', 'gone', 'gl', 'price'])).toEqual(['price', 'gl', 'drip', 'dripUsd', 'value']);
  expect(shownKeys(ALL, ['price', 'gl'], ['drip', 'value'])).toEqual(['price', 'gl', 'dripUsd']);
});

test('a dragged column lands at the index it was dropped on', () => {
  expect(moveKey(['a', 'b', 'c', 'd'], 'a', 2)).toEqual(['b', 'c', 'a', 'd']);
  expect(moveKey(['a', 'b', 'c', 'd'], 'd', 0)).toEqual(['d', 'a', 'b', 'c']);
  expect(moveKey(['a', 'b', 'c'], 'b', 9)).toEqual(['a', 'c', 'b']);
  expect(moveKey(['a', 'b', 'c'], 'b', -1)).toEqual(['b', 'a', 'c']);
});

test('after a drag the hidden columns keep their order behind the shown ones', () => {
  expect(orderAfterDrag(ALL, [], ['dripUsd'], ['price', 'drip', 'gl', 'value'])).toEqual(['price', 'drip', 'gl', 'value', 'dripUsd']);
});

test('a column or a whole group goes on or off', () => {
  expect(toggleKeys(['a'], ['b', 'c'], false)).toEqual(['a', 'b', 'c']);
  expect(toggleKeys(['a', 'b', 'c'], ['b', 'c'], true)).toEqual(['a']);
  expect(toggleKeys(['a', 'b'], ['b'], false)).toEqual(['a', 'b']);
});

test('the filter matches the column name in any case', () => {
  const cols = [{ label: 'DRIP $' }, { label: "Today's gain/loss %" }, { label: 'Total gain/loss $' }];
  expect(filterColumns(cols, '  GAIN ').map((c) => c.label)).toEqual(["Today's gain/loss %", 'Total gain/loss $']);
  expect(filterColumns(cols, '')).toHaveLength(3);
  // the full Fidelity name counts too: a short name is found by a word of the long one
  expect(filterColumns([{ label: "Today's %", hint: "Today's gain/loss %" }, { label: 'Value', hint: 'Current value' }], 'current').map((c) => c.label)).toEqual(['Value']);
});
