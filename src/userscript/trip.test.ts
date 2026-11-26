/// <reference types="bun" />
/// <reference lib="esnext" />
import { expect, test } from 'bun:test';
import { TRIP_MAX_MS, TRIP_STALE_MS, backNow, freshTrip, pageName, tripFrom } from './trip';

const SUMMARY = 'https://digital.fidelity.com/ftgw/digital/portfolio/summary';

test('the way back: a Fidelity portfolio page other than Positions', () => {
  expect(tripFrom(SUMMARY)).toBe(SUMMARY);
  expect(tripFrom('https://digital.fidelity.com/ftgw/digital/portfolio/activity#x')).toBe('https://digital.fidelity.com/ftgw/digital/portfolio/activity#x');
  expect(tripFrom('https://digital.fidelity.com/ftgw/digital/portfolio/positions')).toBeNull();
  expect(tripFrom('https://digital.fidelity.com/ftgw/digital/portfolio/positions?a=1')).toBeNull();
  expect(tripFrom('https://example.com/ftgw/digital/portfolio/summary')).toBeNull();
  expect(tripFrom('not a url')).toBeNull();
});

test('a kept trip counts while fresh and well formed', () => {
  const now = 1_000_000_000;
  expect(freshTrip({ from: SUMMARY, at: now - 5_000 }, now)).toEqual({ from: SUMMARY, at: now - 5_000 });
  expect(freshTrip({ from: SUMMARY, at: now - TRIP_STALE_MS }, now)).toBeNull();
  expect(freshTrip({ from: SUMMARY, at: now + 1 }, now)).toBeNull();
  expect(freshTrip({ from: 'https://example.com/', at: now }, now)).toBeNull();
  expect(freshTrip(null, now)).toBeNull();
  expect(freshTrip('x', now)).toBeNull();
});

test('back after the read once nothing runs, or after 3 minutes anyway', () => {
  const trip = { from: SUMMARY, at: 0 };
  expect(backNow({ trip, now: 20_000, read: false, busy: false })).toBe(false);
  expect(backNow({ trip, now: 20_000, read: true, busy: true })).toBe(false);
  expect(backNow({ trip, now: 20_000, read: true, busy: false })).toBe(true);
  expect(backNow({ trip, now: TRIP_MAX_MS, read: false, busy: true })).toBe(true);
});

test('page name for the panel', () => {
  expect(pageName(SUMMARY)).toBe('summary');
  expect(pageName('https://digital.fidelity.com/')).toBe('portfolio');
});
