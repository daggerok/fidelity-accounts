/// <reference types="bun" />
/// <reference types="node" />
/// <reference lib="esnext" />
import { expect, test } from 'bun:test';
import { chipActivates, rovingIndex, trapIndex } from './focus';

test('Tab and Shift+Tab wrap around inside a window and bring an outside focus in', () => {
  expect(trapIndex(3, 2, false)).toBe(0);
  expect(trapIndex(3, 0, true)).toBe(2);
  expect(trapIndex(3, 1, false)).toBeNull();
  expect(trapIndex(3, 1, true)).toBeNull();
  expect(trapIndex(3, -1, false)).toBe(0);
  expect(trapIndex(3, -1, true)).toBe(2);
  expect(trapIndex(1, 0, false)).toBe(0);
  expect(trapIndex(0, -1, false)).toBeNull();
});

test('the arrow keys step through the tabs and wrap, Home and End jump', () => {
  expect(rovingIndex(2, 0, 'ArrowRight')).toBe(1);
  expect(rovingIndex(2, 1, 'ArrowRight')).toBe(0);
  expect(rovingIndex(2, 0, 'ArrowLeft')).toBe(1);
  expect(rovingIndex(3, 1, 'Home')).toBe(0);
  expect(rovingIndex(3, 1, 'End')).toBe(2);
  expect(rovingIndex(3, 1, 'ArrowDown')).toBeNull();
});

test('Enter and Space press a chip only when they come to the chip itself', () => {
  expect(chipActivates('Enter', true)).toBe(true);
  expect(chipActivates(' ', true)).toBe(true);
  expect(chipActivates('Enter', false)).toBe(false);
  expect(chipActivates(' ', false)).toBe(false);
  expect(chipActivates('a', true)).toBe(false);
});
