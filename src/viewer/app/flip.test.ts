/// <reference types="bun" />
/// <reference lib="esnext" />
import { expect, test } from 'bun:test';
import { moved } from './flip';

test('an item that changed its place slides from where it was; new and still ones do not', () => {
  const before = new Map([['a', 0], ['b', 62]]);
  // c came on top and pushed a and b down
  expect(moved(before, new Map([['c', 0], ['a', 62], ['b', 124]]))).toEqual([{ key: 'a', from: -62 }, { key: 'b', from: -62 }]);
  // a left: b moves up into its place
  expect(moved(before, new Map([['b', 0]]))).toEqual([{ key: 'b', from: 62 }]);
  expect(moved(before, new Map([['a', 0], ['b', 62.4]]))).toEqual([]); // less than a pixel
  expect(moved(new Map(), new Map([['a', 0]]))).toEqual([]);
});
