/// <reference types="bun" />
/// <reference types="node" />
/// <reference lib="esnext" />
import { expect, test } from 'bun:test';
import { COMMAND_MAX_AGE_MS, freshCommand } from './command';

test('a command is used only while fresh and only when known', () => {
  const now = 10_000_000;
  expect(freshCommand(JSON.stringify({ mode: 'sync', at: now - 1000 }), now)?.mode).toBe('sync');
  expect(freshCommand(JSON.stringify({ mode: 'sync', at: now - COMMAND_MAX_AGE_MS }), now)).toBeNull();
  expect(freshCommand(JSON.stringify({ mode: 'sync', at: now + 5000 }), now)).toBeNull();
  expect(freshCommand(JSON.stringify({ mode: 'trade', at: now }), now)).toBeNull();
  expect(freshCommand('{bad', now)).toBeNull();
  expect(freshCommand(null, now)).toBeNull();
});
