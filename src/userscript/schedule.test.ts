/// <reference types="bun" />
/// <reference lib="esnext" />
import { expect, test } from 'bun:test';
import { historyDue, marketOpen, slotOf, txnsPlan } from './schedule';

// November 2026 is EST (UTC-5): 2026-11-24 is a Tuesday, 2026-11-28 a Saturday
const ny = (iso: string) => new Date(iso);

test('market open: 9:30 to 16:00 New York on weekdays', () => {
  expect(marketOpen(ny('2026-11-24T14:30:00Z'))).toBe(true); // Tue 9:30 EST
  expect(marketOpen(ny('2026-11-24T14:29:00Z'))).toBe(false); // 9:29
  expect(marketOpen(ny('2026-11-24T20:59:00Z'))).toBe(true); // 15:59
  expect(marketOpen(ny('2026-11-24T21:00:00Z'))).toBe(false); // 16:00
  expect(marketOpen(ny('2026-11-28T15:00:00Z'))).toBe(false); // Saturday
  expect(marketOpen(ny('2026-07-06T13:30:00Z'))).toBe(true); // Mon 9:30 EDT
});

test('slot: the last workday cutoff at or before the time, weekends skipped', () => {
  expect(slotOf(ny('2026-11-25T14:00:00Z'), [570, 1200])).toBe('2026-11-24@1200'); // Wed 9:00 -> Tue 20:00
  expect(slotOf(ny('2026-11-25T14:31:00Z'), [570, 1200])).toBe('2026-11-25@570'); // Wed 9:31
  expect(slotOf(ny('2026-11-30T12:00:00Z'), [1200])).toBe('2026-11-27@1200'); // Mon 7:00 -> Fri 20:00
});

test('daily values: once after 20:00 New York of each workday, a missed evening at the next chance', () => {
  expect(historyDue(undefined, ny('2026-11-25T14:00:00Z'))).toBe(true);
  expect(historyDue('2026-11-25T01:30:00Z', ny('2026-11-25T14:00:00Z'))).toBe(false); // read Tue 20:30, now Wed 9:00
  expect(historyDue('2026-11-25T01:30:00Z', ny('2026-11-25T22:00:00Z'))).toBe(false); // Wed 17:00: not posted yet
  expect(historyDue('2026-11-25T01:30:00Z', ny('2026-11-26T01:05:00Z'))).toBe(true); // Wed 20:05
  expect(historyDue('2026-11-24T20:00:00Z', ny('2026-11-25T12:00:00Z'))).toBe(true); // read Tue 15:00, Tue evening missed
  expect(historyDue('2026-11-28T01:30:00Z', ny('2026-11-29T18:00:00Z'))).toBe(false); // read Fri 20:30, now Sunday
  expect(historyDue('2026-11-28T01:30:00Z', ny('2026-11-30T15:00:00Z'))).toBe(false); // Monday 10:00
});

test('transactions: after 20:00, nothing until the open, once after the open, every 10 minutes of the session with 👀', () => {
  const tueEvening = '2026-11-25T01:30:00Z'; // Tue 20:30
  expect(txnsPlan(undefined, ny('2026-11-25T13:00:00Z'), false)).toBe('full');
  expect(txnsPlan(tueEvening, ny('2026-11-25T13:00:00Z'), true)).toBeNull(); // Wed 8:00: "no sense to re-read until opening"
  expect(txnsPlan(tueEvening, ny('2026-11-25T14:31:00Z'), false)).toBe('full'); // Wed 9:31
  const wedOpen = '2026-11-25T14:35:00Z'; // Wed 9:35
  expect(txnsPlan(wedOpen, ny('2026-11-25T15:00:00Z'), false)).toBeNull(); // no 👀: once a session
  expect(txnsPlan(wedOpen, ny('2026-11-25T15:00:00Z'), true)).toBe('recent'); // 👀, 25 minutes later
  expect(txnsPlan(wedOpen, ny('2026-11-25T14:40:00Z'), true)).toBeNull(); // 👀, 5 minutes later
  expect(txnsPlan(wedOpen, ny('2026-11-25T22:00:00Z'), true)).toBeNull(); // Wed 17:00: closed, not posted yet
  expect(txnsPlan(wedOpen, ny('2026-11-26T01:01:00Z'), false)).toBe('full'); // Wed 20:01
  expect(txnsPlan('2026-11-24T20:00:00Z', ny('2026-11-25T12:00:00Z'), false)).toBe('full'); // Tue evening missed: Wed 7:00
  expect(txnsPlan('2026-11-28T01:30:00Z', ny('2026-11-28T17:00:00Z'), true)).toBeNull(); // Saturday
  expect(txnsPlan('2026-11-28T01:30:00Z', ny('2026-11-30T14:30:00Z'), false)).toBe('full'); // Monday 9:30
  expect(txnsPlan('not a date', ny('2026-11-25T15:00:00Z'), false)).toBe('full');
  // a sync the owner asked for reads the ten days again at any hour, also on a Saturday, not more often than every 10 minutes
  expect(txnsPlan('2026-11-28T01:30:00Z', ny('2026-11-28T17:00:00Z'), false, true)).toBe('full');
  expect(txnsPlan('2026-11-28T16:55:00Z', ny('2026-11-28T17:00:00Z'), false, true)).toBeNull();
  expect(txnsPlan(wedOpen, ny('2026-11-25T22:00:00Z'), false, true)).toBe('full'); // Wed 17:00, closed
});
