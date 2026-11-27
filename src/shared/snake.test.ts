/// <reference types="bun" />
/// <reference lib="esnext" />
import { expect, test } from 'bun:test';
import { DATASET_VERSION, parseDataset } from './model';
import { flatten } from './parse';
import { ROWS } from './fixtures/grid';
import { growHeader, WIDE_FIRST } from './sheets/tabs';
import { snakeCase, snakeKeys } from './snake';

test('every name is snake_case: our own and the ones of Fidelity, a snake_case name stays', () => {
  expect(['todayGlPct', 'todGLPct', 'fifTwo_low', 'isHTB', 'meta_cstbasType', 'marketCap_text', 'beta3y', 'qty'].map(snakeCase))
    .toEqual(['today_gl_pct', 'tod_gl_pct', 'fif_two_low', 'is_htb', 'meta_cstbas_type', 'market_cap_text', 'beta3y', 'qty']);
  expect(snakeCase(snakeCase('lstPrcPrevCls'))).toBe('lst_prc_prev_cls');
  expect(snakeKeys({ actNum: 'X1', sym_name: 'AAA' })).toEqual({ act_num: 'X1', sym_name: 'AAA' });
});

test('no field of a grid row keeps a capital letter', () => {
  ROWS.forEach((r) => Object.keys(flatten(r)).forEach((k) => expect(k).toBe(k.toLowerCase())));
});

test('a copy stored before this naming reads with the new names', () => {
  const old = JSON.stringify({ version: DATASET_VERSION, builtAt: '2026-11-21T02:00:00.000Z', accounts: [], warnings: [], positions: [{ account: 'X1', kind: 'position', symbol: 'AAA', description: '', fields: { lstPrc: 10, sym_name: 'AAA' } }] });
  expect(parseDataset(old)!.positions[0]!.fields).toEqual({ lst_prc: 10, sym_name: 'AAA' });
});

test('the wide tab: a header with the old names starts again, a snake_case one only grows', () => {
  expect(growHeader(['as_of', 'actNum', 'lstPrc'], ['as_of', 'act_num', 'lst_prc'])).toEqual(WIDE_FIRST.concat(['lst_prc']));
  expect(growHeader(WIDE_FIRST.concat(['qty']), ['qty', 'lst_prc'])).toEqual(WIDE_FIRST.concat(['qty', 'lst_prc']));
});
