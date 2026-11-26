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
  expect(accept(ds('2026-11-24T04:38:30Z', { A: [{ date: '2026-11-20', value: 1 }] }), 'sheets')).toBe(true);
  expect(accept(ds('2026-11-24T04:38:30Z'), 'sheets')).toBe(true);
  expect(dataset.get().ds!.history).toEqual({ A: [{ date: '2026-11-20', value: 1 }] });
  // a newer copy with a new day adds it
  accept(ds('2026-11-25T04:00:00Z', { A: [{ date: '2026-11-21', value: 2 }] }), 'sheets');
  expect(dataset.get().ds!.history!.A!.map((p) => p.date)).toEqual(['2026-11-20', '2026-11-21']);
  // an older copy is still refused
  expect(accept(ds('2026-11-01T00:00:00Z'), 'cache')).toBe(false);
});

test('a dataset already checked (the sheet) is taken as it is, with the same rules as JSON', async () => {
  const { accept, dataset } = await import('./data');
  const { parseDataset } = await import('../../shared/model');
  const before = dataset.get().ds!;
  const next = parseDataset(ds('2026-11-26T04:00:00Z'))!;
  expect(accept(next, 'sheets')).toBe(true);
  // the history already shown stays, an older object is refused like older JSON
  expect(dataset.get().ds!.history).toEqual(before.history);
  expect(dataset.get().ds!.builtAt).toBe('2026-11-26T04:00:00Z');
  expect(accept(parseDataset(ds('2026-11-02T00:00:00Z'))!, 'sheets')).toBe(false);
});

test('a transactions store built from the sheet is taken as it is; a newer one shown is kept', async () => {
  const { acceptTxns, transactions } = await import('./data');
  const store = { version: 1 as const, at: '2026-11-25T10:00:00Z', synced: { A: '2026-11-25' }, rows: [] };
  acceptTxns(store);
  expect(transactions.get()).toBe(store);
  acceptTxns(JSON.stringify({ ...store, at: '2026-11-24T10:00:00Z' }));
  expect(transactions.get()).toBe(store);
  acceptTxns({ version: 2 } as never);
  expect(transactions.get()).toBe(store);
});
