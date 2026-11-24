/// <reference types="bun" />
/// <reference lib="esnext" />
import { expect, test } from 'bun:test';
import { createSheetsQueue } from './sheets-queue';
import type { DataSet } from '../shared/sheets/sync';

test('sets asked during a write go in the next round, together', async () => {
  const rounds: DataSet[][] = [];
  let release: () => void = () => {};
  const q = createSheetsQueue({ ready: () => true, waiting: () => {}, failed: () => {}, write: (sets) => { rounds.push(sets); return rounds.length === 1 ? new Promise<void>((r) => { release = r; }) : Promise.resolve(); } });
  const first = q.add(['summary', 'positions']);
  void q.add(['transactions']);
  void q.add(['summary']);
  release();
  await first;
  expect(rounds).toEqual([['summary', 'positions'], ['transactions', 'summary']]);
  expect(q.pending()).toEqual([]);
});

test('no token: the sets wait for retry; a failed write keeps them for the next try', async () => {
  let token = false;
  let fail = true;
  const written: DataSet[][] = [];
  let waited = 0;
  const errors: unknown[] = [];
  const q = createSheetsQueue({ ready: () => token, waiting: () => { waited++; }, failed: (e) => errors.push(e), write: async (sets) => { if (fail) throw new Error('429'); written.push(sets); } });
  await q.add(['positions']);
  expect(waited).toBe(1);
  expect(q.pending()).toEqual(['positions']);
  token = true;
  await q.retry();
  expect(errors).toHaveLength(1);
  expect(q.pending()).toEqual(['positions']);
  fail = false;
  await q.retry();
  expect(written).toEqual([['positions']]);
  expect(q.pending()).toEqual([]);
});
