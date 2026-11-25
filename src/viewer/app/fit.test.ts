/// <reference types="bun" />
/// <reference lib="esnext" />
import { expect, test } from 'bun:test';
import { fitCount } from './fit';

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
