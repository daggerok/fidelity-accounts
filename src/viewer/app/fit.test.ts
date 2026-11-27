/// <reference types="bun" />
/// <reference lib="esnext" />
import { expect, test } from 'bun:test';
import { FIT_SELF_MS, fitCount, fitRestarts, phoneColumnWidth } from './fit';

test('rows grow into the room left under the card and shrink when it runs past the footer, within min and max', () => {
  expect(fitCount(5, 130, 27 * 2, 5, 20)).toBe(7); // two more pairs of movers fit into 130 px
  expect(fitCount(8, 100, 47, 8, 30)).toBe(10);
  expect(fitCount(8, 46, 47, 8, 30)).toBe(8); // less than a row: as is
  expect(fitCount(12, -10, 47, 8, 30)).toBe(11); // runs past: one row less
  expect(fitCount(9, -500, 47, 8, 30)).toBe(8); // never under the card's own count
  expect(fitCount(8, 5000, 47, 8, 12)).toBe(12); // never more rows than there are
  expect(fitCount(8, 100, 47, 8, 3)).toBe(8); // fewer rows than the minimum: the minimum stays the bound
  expect(fitCount(6, 100, 0, 5, 20)).toBe(6); // nothing measured yet
});

test('rounds start again on a change of the page, or of the cards long after a card changed its own rows', () => {
  expect(fitRestarts(true, 0)).toBe(true); // the settings slide: always
  expect(fitRestarts(false, 16)).toBe(false); // the cards moved a frame after our own change: not again
  expect(fitRestarts(false, FIT_SELF_MS + 1)).toBe(true); // new data minutes later
  expect(fitRestarts(false, Infinity)).toBe(true); // no own change yet
});

test('on a phone the Symbol column and four columns fill the box', () => {
  // 390 px screen: 16 px gutters and the 1 px borders leave 356
  expect(phoneColumnWidth(356)).toBe(69);
  expect(76 + 4 + 4 * phoneColumnWidth(356)).toBeLessThanOrEqual(356);
  expect(phoneColumnWidth(341)).toBe(65); // 375 px
  expect(phoneColumnWidth(200)).toBe(60); // never narrower
  expect(phoneColumnWidth(600)).toBe(84); // never wider
});
