/// <reference types="bun" />
/// <reference lib="esnext" />
import { expect, test } from 'bun:test';
import { rowWindow, sameWindow } from './row-window';

test('the window of rows drawn: the same inside one row, one step when a row edge is crossed', () => {
  expect(rowWindow(0, 800, 50, 12)).toEqual({ first: 0, end: 28 });
  // 10 -> 40 px: still the same rows
  expect(sameWindow(rowWindow(10, 800, 50, 12), rowWindow(40, 800, 50, 12))).toBe(true);
  // past a 50 px edge the end moves by one row
  expect(rowWindow(60, 800, 50, 12)).toEqual({ first: 0, end: 30 });
  expect(rowWindow(1000, 800, 50, 12)).toEqual({ first: 8, end: 48 });
  // a taller box draws more rows
  expect(rowWindow(1000, 1200, 50, 12).end).toBe(56);
  expect(sameWindow({ first: 1, end: 2 }, { first: 1, end: 3 })).toBe(false);
});
