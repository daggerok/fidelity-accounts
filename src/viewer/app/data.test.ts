/// <reference types="bun" />
/// <reference types="node" />
/// <reference lib="esnext" />
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, beforeAll, expect, test } from 'bun:test';

beforeAll(() => GlobalRegistrator.register({ url: 'https://daggerok.github.io/fidelity-accounts/' }));
afterAll(() => GlobalRegistrator.unregister());

const ds = (builtAt: string, history?: Record<string, Array<{ date: string; value: number }>>) => JSON.stringify({ version: 1, builtAt, asOf: null, accounts: [], positions: [], warnings: [], history });

test('a copy without the daily history (the sheet, same time) keeps the history already shown', async () => {
  const { accept, dataset } = await import('./data');
  expect(accept(ds('2026-11-24T04:38:30Z', { A: [{ date: '2026-11-20', value: 1 }] }), 'userscript')).toBe(true);
  expect(accept(ds('2026-11-24T04:38:30Z'), 'sheets')).toBe(true);
  expect(dataset.get().ds!.history).toEqual({ A: [{ date: '2026-11-20', value: 1 }] });
  // a newer copy with a new day adds it
  accept(ds('2026-11-25T04:00:00Z', { A: [{ date: '2026-11-21', value: 2 }] }), 'userscript');
  expect(dataset.get().ds!.history!.A!.map((p) => p.date)).toEqual(['2026-11-20', '2026-11-21']);
  // an older copy is still refused
  expect(accept(ds('2026-11-01T00:00:00Z'), 'cache')).toBe(false);
});
