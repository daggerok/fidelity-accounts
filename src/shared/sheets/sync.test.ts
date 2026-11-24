/// <reference types="bun" />
/// <reference types="node" />
/// <reference lib="esnext" />
import { expect, test } from 'bun:test';
import { ROWS, SIDEBAR } from '../fixtures/grid';
import { buildDataset } from '../parse';
import { balanceRows, dayOf, positionRows, wideRows } from './sync';
import { ACCOUNTS, BALANCES, POSITIONS, TAB_NAMES } from './tabs';

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
  expect(back.fields.marketCap_text).toBe('Large cap ($234.93B)');
  expect(POSITIONS.columns[0]).toBe('account');
  expect(POSITIONS.columns).toContain('cost_basis_total');
  const b = balanceRows(ds);
  expect(b.map((r) => BALANCES.idOf(r))).toEqual(['2026-11-20|X10000001', '2026-11-20|200000002']);
  expect(wideRows(ds)[1]).toMatchObject({ as_of: '2026-11-21T02:00:00.000Z', actNum: 'X10000001', sym_name: 'AAAA', qty: 2.5 });
});
