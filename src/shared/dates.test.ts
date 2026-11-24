/// <reference types="bun" />
/// <reference types="node" />
/// <reference lib="esnext" />
import { expect, test } from 'bun:test';
import { addDays, addMonths } from './dates';

test('addMonths clamps the day to the month length', () => {
  expect(addMonths('2026-03-31', -1)).toBe('2026-02-28');
  expect(addMonths('2024-02-29', -12)).toBe('2023-02-28');
  expect(addMonths('2026-11-30', 3)).toBe('2027-02-28');
});

test('addDays crosses month and year borders', () => {
  expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
});
