/// <reference types="bun" />
/// <reference types="node" />
/// <reference lib="esnext" />
import { expect, test } from 'bun:test';
import { ROWS, SIDEBAR } from './fixtures/grid';
import { mergeDatasets, parseDataset } from './model';
import { buildDataset } from './parse';
import { sampleDataset } from './sample';

const full = buildDataset({ rows: ROWS, sidebar: SIDEBAR, asOf: null, builtAt: '2026-11-20T10:00:00.000Z' });

test('parseDataset refuses junk and other versions', () => {
  expect(parseDataset(JSON.stringify(full))?.positions.length).toBe(4);
  expect(parseDataset('{bad')).toBeNull();
  expect(parseDataset(JSON.stringify({ ...full, version: 99 }))).toBeNull();
});

test('a read of one account replaces only that account', () => {
  const one = buildDataset({ rows: ROWS.filter((r) => r.actNum === '200000002'), sidebar: SIDEBAR, asOf: null, builtAt: '2026-11-21T10:00:00.000Z' });
  one.positions[0]!.quantity = 11;
  const m = mergeDatasets(full, one);
  expect(m.builtAt).toBe('2026-11-21T10:00:00.000Z');
  expect(m.positions.filter((p) => p.account === 'X10000001')).toHaveLength(3);
  expect(m.positions.find((p) => p.symbol === 'BBBB')?.quantity).toBe(11);
  expect(m.accounts).toHaveLength(2);
  expect(mergeDatasets(null, one)).toBe(one);
});

test('the demo data is made up and complete', () => {
  const d = sampleDataset(new Date('2026-11-20T12:00:00Z'));
  expect(d.accounts).toHaveLength(5);
  expect(d.positions.every((p) => p.fields.demo === true)).toBe(true);
  expect(d.accounts.every((a) => /^(X0+\d|0+\d)$/.test(a.number))).toBe(true);
  expect(parseDataset(JSON.stringify(d))).not.toBeNull();
});
