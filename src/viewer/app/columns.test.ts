/// <reference types="bun" />
/// <reference lib="esnext" />
import { expect, test } from 'bun:test';
import { arrange, filterColumns, moveKey, orderAfterDrag, shownKeys, toggleKeys, turnOnFirst } from './columns';

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

test('an own column switched on goes to the front, in its default place among the own ones already there', () => {
  const all = ['o1', 'o2', 'o3', 'o4', 'a', 'b', 'c'];
  const own = ['o1', 'o2', 'o3', 'o4'];
  const shown = (order: string[], hidden: string[]) => order.filter((k) => hidden.indexOf(k) < 0);
  // the owner's order: b, a, c; no own column shown yet: the first one goes to the very front
  let order = turnOnFirst(all, ['b', 'a', 'c'], ['o1', 'o2', 'o3', 'o4'], 'o3', own);
  let hidden = ['o1', 'o2', 'o4'];
  expect(shown(order, hidden)).toEqual(['o3', 'b', 'a', 'c']);
  // the next ones take their default places beside it, before or after
  order = turnOnFirst(all, order, hidden, 'o1', own); hidden = ['o2', 'o4'];
  expect(shown(order, hidden)).toEqual(['o1', 'o3', 'b', 'a', 'c']);
  order = turnOnFirst(all, order, hidden, 'o4', own); hidden = ['o2'];
  expect(shown(order, hidden)).toEqual(['o1', 'o3', 'o4', 'b', 'a', 'c']);
  // an own column the owner moved away from the front stays where it was put; a new one still goes to the front
  const moved = ['b', 'o1', 'a', 'c', 'o2', 'o3', 'o4'];
  expect(shown(turnOnFirst(all, moved, ['o3', 'o4'], 'o2', own), ['o3', 'o4'])).toEqual(['o2', 'b', 'o1', 'a', 'c']);
  // every key is still there, once
  expect(order.slice().sort()).toEqual(all.slice().sort());
});
