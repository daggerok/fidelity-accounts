/// <reference types="bun" />
/// <reference types="node" />
/// <reference lib="esnext" />
import { expect, test } from 'bun:test';
import { clockTime, maskAccount, readTime, shortUsd, signedUsdPct } from './format';

test('shortUsd prints thousands as K and a million and more as M', () => {
  expect(shortUsd(850000)).toBe('$850.0K');
  expect(shortUsd(1250000)).toBe('$1.25M');
  expect(shortUsd(1e6)).toBe('$1.00M');
  expect(shortUsd(999.5)).toBe('$999.50');
});

test('maskAccount keeps the last four of a made-up number', () => {
  expect(maskAccount('X12345678')).toBe('···5678');
  expect(maskAccount('123')).toBe('···123');
  expect(maskAccount('')).toBe('');
});

test('readTime and clockTime follow the app language, not the browser locale', () => {
  // noon UTC is the same day in every time zone from UTC-11 to UTC+11
  const at = '2026-12-12T12:00:00.000Z';
  expect(readTime(at, 'en')).toContain('Dec');
  expect(readTime(at, 'ru')).toContain('дек');
  expect(readTime(at, 'en')).toContain('12');
  expect(clockTime(at, 'en')).toMatch(/\d{2}:00/);
  expect(clockTime(at, 'ru')).toMatch(/^\d{2}:00$/);
});

test('signedUsdPct writes the $ and the % of a change', () => {
  expect(signedUsdPct(12.3, 1.25)).toBe('+$12.30 (+1.25%)');
  expect(signedUsdPct(-4, -0.5)).toBe('-$4.00 (-0.50%)');
  expect(signedUsdPct(undefined, null)).toBe('-- (--)');
});
