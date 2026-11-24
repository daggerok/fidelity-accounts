/// <reference types="bun" />
/// <reference types="node" />
/// <reference lib="esnext" />
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, beforeAll, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { CLAUSES, checkBalanceHistory, checkGridRows, checkPage, describe, mergeReport, type Finding } from './contract';
import { ROWS } from './fixtures/grid';

beforeAll(() => GlobalRegistrator.register({ url: 'https://digital.fidelity.com/ftgw/digital/portfolio/positions' }));
afterAll(() => GlobalRegistrator.unregister());

const errors = (fs: Finding[]) => fs.filter((f) => f.level === 'error');
const clone = () => JSON.parse(JSON.stringify(ROWS)) as Array<Record<string, unknown>>;

test('the map is accurate: unique ids, every file it points to exists', () => {
  const ids = CLAUSES.map((c) => c.id);
  expect(new Set(ids).size).toBe(ids.length);
  CLAUSES.forEach((c) => c.usedIn.forEach((f) => expect(existsSync(join(__dirname, '..', '..', f))).toBe(true)));
});

test('rows shaped like the Fidelity ones pass; every kind of change is caught with its entry', () => {
  expect(errors(checkGridRows(clone()))).toEqual([]);
  expect(checkGridRows([])[0]!.id).toBe('grid.api');
  const gone = clone().map((r) => { if (r.rowType === 'POSITION') delete r.curVal; return r; });
  expect(errors(checkGridRows(gone))).toEqual([{ id: 'grid.fields', level: 'error', problem: 'POSITION.curVal is gone' }]);
  const renamed = clone().map((r) => (r.rowType === 'POSITION' ? { ...r, rowType: 'HOLDING' } : r));
  expect(checkGridRows(renamed).map((f) => `${f.level} ${f.id} ${f.problem}`)).toEqual(['error grid.rowTypes no POSITION rows', 'warning grid.rowTypes a new row kind: HOLDING']);
  const plain = clone().map((r) => (r.rowType === 'POSITION' ? { ...r, qty: 2.5 } : r));
  expect(errors(checkGridRows(plain))[0]!.problem).toContain('POSITION.qty is not a { val, disp } cell');
  const dates = clone().map((r) => (r.rowType === 'POSITION' && r.exDvDte ? { ...r, exDvDte: { val: 1, disp: '2026-12-12' } } : r));
  expect(errors(checkGridRows(dates))[0]!.id).toBe('grid.dates');
  const fraction = clone().map((r) => (r.rowType === 'POSITION' && r.todGLPct ? { ...r, todGLPct: { val: 0.0101, disp: '+1.01%' } } : r));
  // a fraction under 0.5 is skipped as too small to judge; a value of 1.5 shown as 150% is not
  expect(errors(checkGridRows(fraction))).toEqual([]);
  const unit = clone().map((r) => (r.rowType === 'POSITION' && r.todGLPct ? { ...r, todGLPct: { val: 1.5, disp: '+150.00%' } } : r));
  expect(errors(checkGridRows(unit))[0]!.id).toBe('grid.percents');
});

test('a portfolio page: the account list, the As of line, the refresh button', () => {
  document.body.innerHTML = `<div class="acct-selector__group"><h3 class="acct-selector__group-name">Investment</h3>
    <div class="acct-selector__acct-wrapper"><span class="acct-selector__acct-name">A</span><span class="acct-selector__acct-num">X1</span><div class="acct-selector__balance-wrapper"></div></div></div>
    <p>As of Nov-20-2026 4:01 p.m. ET</p><button>Refresh Positions</button>`;
  expect(checkPage(document, true)).toEqual([]);
  document.body.innerHTML = '<div class="accounts-v2"></div>';
  expect(checkPage(document, true).map((f) => `${f.level} ${f.id}`)).toEqual(['error sidebar', 'warning asOf', 'warning refresh']);
  expect(checkPage(document, false).map((f) => f.id)).toEqual(['sidebar', 'asOf']);
});

test('BalanceHistory answers', () => {
  expect(checkBalanceHistory({ balHistoryDetail: { balances: [{ value: 1, date: '11/20/2026' }] } })).toEqual([]);
  expect(checkBalanceHistory({ data: [] })[0]!.problem).toContain('no balHistoryDetail.balances');
  expect(checkBalanceHistory({ balHistoryDetail: { balances: [{ value: '1', date: '2026-11-20' }] } })[0]!.id).toBe('balanceHistory');
});

test('a report names the files to fix, and a later partial check keeps the other results', () => {
  expect(describe({ id: 'sidebar', level: 'error', problem: 'not found: .x' })).toBe('✗ sidebar: not found: .x (fix in src/userscript/read.ts)');
  const a = { at: '1', checked: ['grid.fields', 'sidebar'], findings: [{ id: 'grid.fields', level: 'error' as const, problem: 'p' }] };
  const b = { at: '2', checked: ['sidebar'], findings: [] };
  expect(mergeReport(a, b).findings.map((f) => f.id)).toEqual(['grid.fields']);
  expect(mergeReport(a, { at: '3', checked: ['grid.fields'], findings: [] }).findings).toEqual([]);
});
