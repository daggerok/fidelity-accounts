/// <reference types="bun" />
/// <reference types="node" />
/// <reference lib="esnext" />
import { expect, test } from 'bun:test';
import { COMMAND_MAX_AGE_MS, SYNC_GAP_MS, freshCommand, syncAllowed } from './command';

test('sync commands are at least 10 seconds apart', () => {
  const now = 10_000_000;
  expect(syncAllowed(undefined, now)).toBe(true); // none taken yet
  expect(syncAllowed(null, now)).toBe(true);
  expect(syncAllowed(now - 5_000, now)).toBe(false); // a loop of posts
  expect(syncAllowed(now - SYNC_GAP_MS + 1, now)).toBe(false);
  expect(syncAllowed(now - SYNC_GAP_MS, now)).toBe(true); // a reload 10 seconds later
  expect(syncAllowed(now - 10 * 60_000, now)).toBe(true);
  expect(syncAllowed(now + 60_000, now)).toBe(true); // the clock was set back: not stuck
});

test('a command is used only while fresh and only when known', () => {
  const now = 10_000_000;
  expect(freshCommand(JSON.stringify({ mode: 'sync', at: now - 1000 }), now)?.mode).toBe('sync');
  expect(freshCommand(JSON.stringify({ mode: 'sync', at: now - COMMAND_MAX_AGE_MS }), now)).toBeNull();
  expect(freshCommand(JSON.stringify({ mode: 'sync', at: now + 5000 }), now)).toBeNull();
  expect(freshCommand(JSON.stringify({ mode: 'trade', at: now }), now)).toBeNull();
  expect(freshCommand('{bad', now)).toBeNull();
  expect(freshCommand(null, now)).toBeNull();
});
