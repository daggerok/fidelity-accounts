/// <reference types="bun" />
/// <reference types="node" />
/// <reference lib="esnext" />
import { expect, test } from 'bun:test';
import { signedUsdPct } from './format';

test('signedUsdPct writes the $ and the % of a change', () => {
  expect(signedUsdPct(12.3, 1.25)).toBe('+$12.30 (+1.25%)');
  expect(signedUsdPct(-4, -0.5)).toBe('-$4.00 (-0.50%)');
  expect(signedUsdPct(undefined, null)).toBe('-- (--)');
});
