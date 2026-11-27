/// <reference types="bun" />
/// <reference lib="esnext" />
import { expect, test } from 'bun:test';
import { sameOffset, slotOffset } from './travel';

test('a slot offset is counted from the box the control is positioned in, in whole pixels', () => {
  expect(slotOffset({ left: 300.4, top: 20 }, { left: 16, top: 16 })).toEqual({ x: 284, y: 4 });
  expect(slotOffset({ left: 16, top: 16 }, { left: 16, top: 16 })).toEqual({ x: 0, y: 0 });
});

test('offsets are the same only when both are known and equal', () => {
  expect(sameOffset({ x: 1, y: 2 }, { x: 1, y: 2 })).toBe(true);
  expect(sameOffset({ x: 1, y: 2 }, { x: 1, y: 3 })).toBe(false);
  expect(sameOffset(null, { x: 1, y: 2 })).toBe(false);
  expect(sameOffset(null, null)).toBe(false);
});
