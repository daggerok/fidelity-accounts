/// <reference types="bun" />
/// <reference types="node" />
/// <reference lib="esnext" />
import { expect, test } from 'bun:test';
import { ROWS, SIDEBAR } from '../fixtures/grid';
import { buildDataset } from '../parse';
import { SheetsError } from './client';
import { balanceRows, betaRows, betasFromRows, changedSets, readSets, datasetFromTabs, dayOf, fingerprint, parseSignal, positionRows, syncedRows, txnStoreFromTabs, wideRows } from './sync';
import { ACCOUNTS, BALANCES, BETAS, POSITIONS, TAB_NAMES, TRANSACTIONS, TXN_SYNCED } from './tabs';
import type { TxnStore } from '../transactions';

const ds = buildDataset({ rows: ROWS, sidebar: SIDEBAR, asOf: 'As of Nov-20-2026 4:01 p.m. ET', builtAt: '2026-11-21T02:00:00.000Z' });

test('the day of the numbers comes from the page, else from the read', () => {
  expect(dayOf(ds)).toBe('2026-11-20');
  expect(dayOf({ ...ds, asOf: null })).toBe('2026-11-21');
});

test('rows of the fidelity_* tabs round-trip and keep account numbers as text', () => {
  TAB_NAMES.forEach((n) => expect(n.startsWith('fidelity_')).toBe(true));
  const a = ACCOUNTS.toRow(ds.accounts[1]!);
  expect(a[0]).toBe('200000002');
  expect(ACCOUNTS.fromRow(a)).toMatchObject({ number: '200000002', name: 'ROTH IRA', group: 'Retirement', balance: 800 });
  const rows = positionRows(ds);
  const back = POSITIONS.fromRow(POSITIONS.toRow(rows[1]!))!;
  expect(back).toMatchObject({ account: 'X10000001', symbol: 'AAAA', quantity: 2.5, exDate: '2026-12-12' });
  expect(back.fields.market_cap_text).toBe('Large cap ($234.93B)');
  expect(POSITIONS.columns[0]).toBe('account');
  expect(POSITIONS.columns).toContain('cost_basis_total');
  const b = balanceRows(ds);
  expect(b.map((r) => BALANCES.idOf(r))).toEqual(['2026-11-20|X10000001', '2026-11-20|200000002']);
  expect(wideRows(ds)[1]).toMatchObject({ as_of: '2026-11-21T02:00:00.000Z', account_number: 'X10000001', symbol_name: 'AAAA', quantity: 2.5 });
});

const store: TxnStore = { version: 1, at: '2026-11-24T17:00:00.000Z', synced: { X10000001: '2026-11-24', '200000002': '2026-11-23' }, rows: [
  { account: 'X10000001', date: '2026-11-20', mnemonic: 'DIV', cat: 'DV', sub: 'VP', dir: 'D', symbol: 'AAAA', qty: 0, net: 1.25, desc: 'DIVIDEND RECEIVED', cancelled: false },
  { account: '200000002', date: '2026-11-21', mnemonic: '', cat: '', sub: '', dir: '', symbol: '', qty: 0, net: -10, desc: '', cancelled: true },
] };

test('transactions round-trip through their two tabs', () => {
  const rows = store.rows.map((r) => TRANSACTIONS.fromRow(TRANSACTIONS.toRow(r))!);
  const synced = syncedRows(store).map((r) => TXN_SYNCED.fromRow(TXN_SYNCED.toRow(r))!);
  expect(txnStoreFromTabs(rows, synced)).toEqual({ ...store, synced: { '200000002': '2026-11-23', X10000001: '2026-11-24' } });
  expect(txnStoreFromTabs([], [])).toBeNull(); // never written
});

test('the sheet sets go into the shown dataset, the rest stays', () => {
  const accounts = ds.accounts.map((a) => ACCOUNTS.fromRow(ACCOUNTS.toRow(a))!);
  const positions = positionRows(ds).map((p) => POSITIONS.fromRow(POSITIONS.toRow(p))!);
  const days = balanceRows(ds).map((b) => BALANCES.fromRow(BALANCES.toRow(b))!);
  const full = datasetFromTabs(null, { accounts, positions, days })!;
  expect(full.builtAt).toBe(ds.builtAt);
  expect(full.positions).toEqual(ds.positions);
  expect(Object.keys(full.history!).sort()).toEqual(['200000002', 'X10000001']);
  // a later summary only: new accounts and time, positions kept
  const later = accounts.map((a) => ({ ...a, balance: 1, asOf: '2026-11-22T00:00:00.000Z' }));
  const next = datasetFromTabs(full, { accounts: later, days: [] })!;
  expect(next.builtAt).toBe('2026-11-22T00:00:00.000Z');
  expect(next.accounts[0]!.balance).toBe(1);
  expect(next.positions).toEqual(ds.positions);
  expect(next.history).toEqual(full.history); // no days in the sheet: the shown history stays
  expect(datasetFromTabs(null, { accounts: [], positions: [] })).toBeNull();
});

test('only sets newer in fidelity_updates are read again; a signal names known sets only', () => {
  expect(changedSets({ summary: 'b', positions: 'a', transactions: 'a' }, { summary: 'a', positions: 'a' })).toEqual(['summary', 'transactions']);
  expect(changedSets({}, {})).toEqual([]);
  expect(parseSignal(JSON.stringify({ at: 1, sets: ['positions', 'nope'] }))).toEqual({ at: 1, sets: ['positions'] });
  expect(parseSignal(JSON.stringify({ at: 1, sets: ['nope'] }))).toBeNull();
  expect(parseSignal('broken')).toBeNull();
});

test('a set with the same content has the same print, whatever the read time', () => {
  const data = { ds, store };
  const again = { ds: { ...ds, builtAt: 'later', accounts: ds.accounts.map((a) => ({ ...a, asOf: 'later' })) }, store };
  expect(fingerprint('summary', again)).toBe(fingerprint('summary', data)!);
  expect(fingerprint('positions', again)).toBe(fingerprint('positions', data)!);
  const moved = { ds: { ...ds, positions: ds.positions.map((p, i) => (i === 1 ? { ...p, lastPrice: (p.lastPrice ?? 0) + 1 } : p)) }, store };
  expect(fingerprint('positions', moved)).not.toBe(fingerprint('positions', data)!);
  expect(fingerprint('transactions', { ds, store: null })).toBeNull();
  expect(fingerprint('summary', { ds: null, store })).toBeNull();
});

test('a tab not created yet reads as empty, other errors still fail the read', async () => {
  const fake = (failing: string, status: number) => ({
    readRows: async <T,>(spec: { name: string }): Promise<T[]> => { if (spec.name === failing) throw new SheetsError(`Google Sheets ${status} on read ${spec.name}`, status); return []; },
  });
  expect(await readSets(fake(TXN_SYNCED.name, 400), ['transactions'])).toEqual({ txns: [], synced: [] });
  await expect(readSets(fake(POSITIONS.name, 500), ['positions'])).rejects.toThrow('500');
});

test('betas round-trip through fidelity_betas, go into the shown dataset and print without their day', () => {
  const betas = { AAAA: { beta: 1.25, source: 'stock5y' as const, asOf: '2026-11-25T10:00:00.000Z' }, BBBB: { beta: 0.8, source: 'calcMonthly' as const, months: 36, asOf: '2026-11-25T10:00:00.000Z' } };
  const rows = betaRows(betas).map((r) => BETAS.fromRow(BETAS.toRow(r))!);
  expect(BETAS.columns).toEqual(['symbol', 'beta', 'source', 'months', 'as_of']);
  expect(betasFromRows(rows)).toEqual(betas);
  const shown = datasetFromTabs(ds, { betas: rows })!;
  expect(shown.betas).toEqual(betas);
  expect(shown.betasAt).toBe('2026-11-25T10:00:00.000Z');
  expect(shown.positions).toEqual(ds.positions);
  expect(datasetFromTabs(shown, { betas: [] })!.betas).toEqual(betas); // an empty tab keeps the shown betas
  const data = { ds: { ...ds, betas }, store };
  const later = { ds: { ...ds, betas: { AAAA: { ...betas.AAAA, asOf: 'later' }, BBBB: { ...betas.BBBB, asOf: 'later' } } }, store };
  expect(fingerprint('betas', later)).toBe(fingerprint('betas', data)!);
  expect(fingerprint('betas', { ds: { ...ds, betas: { ...betas, AAAA: { ...betas.AAAA, beta: 1.3 } } }, store })).not.toBe(fingerprint('betas', data)!);
  expect(fingerprint('betas', { ds, store })).toBeNull();
  expect(parseSignal(JSON.stringify({ at: 1, sets: ['betas'] }))).toEqual({ at: 1, sets: ['betas'] });
});

test('a beta tab not created yet reads as empty', async () => {
  const fake = { readRows: async <T,>(spec: { name: string }): Promise<T[]> => { throw new SheetsError(`Google Sheets 400 on read ${spec.name}`, 400); } };
  expect(await readSets(fake, ['betas'])).toEqual({ betas: [] });
});
