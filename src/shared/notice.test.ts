/// <reference types="bun" />
/// <reference lib="esnext" />
import { expect, test } from 'bun:test';
import { NOTICE_MAX_AGE_MS, freshNotice, makeNotice, pushNotice, type Notice } from './notice';

test('a notice is shown only while fresh and well formed', () => {
  const now = 5_000_000;
  expect(freshNotice(makeNotice('ok', 'read: 2 accounts', now - 1000), now)).toEqual({ at: now - 1000, level: 'ok', text: 'read: 2 accounts' });
  expect(freshNotice(makeNotice('error', 'sheets: 403', now), now)?.level).toBe('error');
  expect(freshNotice(makeNotice('ok', 'old', now - NOTICE_MAX_AGE_MS), now)).toBeNull();
  expect(freshNotice(makeNotice('ok', '', now), now)).toBeNull();
  expect(freshNotice(JSON.stringify({ at: now, level: 'warn', text: 'x' }), now)).toBeNull();
  expect(freshNotice('{', now)).toBeNull();
  expect(freshNotice(null, now)).toBeNull();
  expect(freshNotice(makeNotice('ok', 'x'.repeat(500), now), now)?.text).toHaveLength(300);
});

test('popups: newest last, no repeats, at most three', () => {
  const n = (at: number, text = `n${at}`): Notice => ({ at, level: 'ok', text });
  expect(pushNotice([n(1), n(2)], n(2)).map((x) => x.at)).toEqual([1, 2]);
  expect(pushNotice([n(1), n(2), n(3)], n(4)).map((x) => x.at)).toEqual([2, 3, 4]);
  expect(pushNotice([], n(5)).map((x) => x.at)).toEqual([5]);
});
