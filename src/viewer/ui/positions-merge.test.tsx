/// <reference types="bun" />
/// <reference types="node" />
/// <reference lib="esnext" />
// Merge in the Positions table and its switch next to the Positions tab (owner 2026-11-25). Every number here is made up
import { afterAll, beforeAll, expect, test } from 'bun:test';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import type { Account, Dataset, Position } from '../../shared/model';

beforeAll(() => {
  GlobalRegistrator.register({ url: 'https://daggerok.github.io/fidelity-accounts/' });
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterAll(() => GlobalRegistrator.unregister());

const acct = (number: string, balance: number): Account => ({ number, name: `Demo ${number.slice(-1)}`, group: 'G', balance, asOf: '' });
const pos = (account: string, symbol: string, extra: Partial<Position> = {}): Position => ({ account, kind: 'position', symbol, description: `${symbol} DEMO`, quantity: 1, currentValue: 100, fields: {}, ...extra });
const ACCOUNTS = [acct('T0000001', 1000), acct('T0000002', 1000)];
const DS: Dataset = {
  version: 1, builtAt: '2026-11-25T15:00:00Z', asOf: null, warnings: [], accounts: ACCOUNTS,
  positions: [pos('T0000001', 'SPAXX', { kind: 'core' }), pos('T0000001', 'AAA'), pos('T0000001', 'BBB'), pos('T0000002', 'SPAXX', { kind: 'core' }), pos('T0000002', 'AAA'), pos('T0000002', 'CCC')],
};

test('every Positions column has a merge kind, the same as the field it shows', async () => {
  const { COLUMNS } = await import('./Positions');
  const { MERGE_KINDS, PROPERTY_MERGE } = await import('../app/merge');
  const cols = COLUMNS();
  expect(cols.length).toBeGreaterThan(70);
  cols.forEach((c) => {
    expect(MERGE_KINDS).toContain(c.merge);
    // high52 is the 52-week range: static like the high itself
    if (c.key in PROPERTY_MERGE) expect(`${c.key}:${c.merge}`).toBe(`${c.key}:${PROPERTY_MERGE[c.key as keyof typeof PROPERTY_MERGE]}`);
  });
});

test('merged: one line per ticker, no account headers or totals, one total; one account: as before; the switch', async () => {
  const { act } = await import('react');
  const { createRoot } = await import('react-dom/client');
  const { Positions } = await import('./Positions');
  const { MergeButton } = await import('./IconButtons');
  const { prefs, setPrefs } = await import('../app/prefs');
  setPrefs({ merge: false, tab: 'summary', search: '', filters: {} });
  document.body.innerHTML = '<div id="root"></div>';
  const root = createRoot(document.getElementById('root')!);
  const draw = (accounts: Account[]) => act(async () => { root.render(<><MergeButton accounts={accounts.length} /><Positions ds={DS} accounts={accounts} /></>); });
  const rows = () => Number(document.querySelector('[data-rows]')!.getAttribute('data-rows'));
  const button = () => document.querySelector<HTMLButtonElement>('[data-merge]')!;
  await draw(ACCOUNTS);
  // per account: header, cash, 2 securities, total; twice; the grand total
  expect(rows()).toBe(11);
  // the switch belongs to the Positions tab: on another one it looks off, and a click opens Positions merged
  expect(button().disabled).toBe(false);
  expect(button().getAttribute('data-merge-here')).toBe('no');
  expect(button().className).toContain('opacity-40');
  expect(button().title).toBe('Open Positions merged: one line per ticker over the shown accounts');
  expect(button().getAttribute('aria-pressed')).toBe('false');
  await act(async () => { button().click(); });
  expect(prefs.get()).toMatchObject({ merge: true, tab: 'positions' });
  expect(button().getAttribute('aria-pressed')).toBe('true');
  expect(button().className).toContain('accent');
  // merged: SPAXX, AAA, BBB, CCC and the one total
  expect(rows()).toBe(5);
  expect(document.querySelector('.acct-row')).toBeNull();
  expect(Array.from(document.querySelectorAll('.total-row')).map((r) => r.textContent?.slice(0, 11))).toEqual(['Grand total']);
  // the Symbol filter counts the merged lines
  expect(document.querySelector('[data-positions-head]')!.textContent).toContain('3');
  // one account: the table as before and the switch dimmed, its choice kept
  await draw(ACCOUNTS.slice(0, 1));
  expect(rows()).toBe(5); // header, cash, 2 securities, total
  expect(button().disabled).toBe(true);
  expect(button().getAttribute('aria-pressed')).toBe('false');
  expect(button().title).toBe('Merge positions: choose more than one account first');
  expect(prefs.get().merge).toBe(true);
  await act(async () => { root.unmount(); });
  setPrefs({ merge: false });
});

test('a filter shows only the rows it found, with the totals of what was found: no cash, no account or grand total', async () => {
  const { act } = await import('react');
  const { createRoot } = await import('react-dom/client');
  const { Positions } = await import('./Positions');
  const { setPrefs } = await import('../app/prefs');
  setPrefs({ merge: false, search: 'aaa', filters: {} });
  document.body.innerHTML = '<div id="root"></div>';
  const root = createRoot(document.getElementById('root')!);
  await act(async () => { root.render(<Positions ds={DS} accounts={ACCOUNTS} />); });
  const rows = () => Number(document.querySelector('[data-rows]')!.getAttribute('data-rows'));
  const totals = () => Array.from(document.querySelectorAll('.total-row')).map((r) => r.querySelector('td')!.textContent);
  // per account: header and the one security found; twice; then the total of what was found (no account total: one
  // row an account has nothing to add up)
  expect(rows()).toBe(5);
  expect(document.querySelector('.cash-row')).toBeNull();
  expect(totals()).toEqual(['Found: 2']);
  expect(document.querySelectorAll('.acct-row').length).toBe(2);
  await act(async () => { setPrefs({ merge: true }); });
  // merged: the one line of the ticker and the total of what was found
  expect(rows()).toBe(2);
  expect(document.querySelector('.cash-row')).toBeNull();
  expect(totals()).toEqual(['Found: 1']);
  // two tickers found in one account: that account gets its own total too
  await act(async () => { setPrefs({ merge: false, search: '', filters: { currentValue: '>0' } }); });
  expect(totals()).toEqual(['Found in the account: 2', 'Found in the account: 2', 'Found: 4']);
  await act(async () => { setPrefs({ search: '', filters: {}, merge: true }); });
  // the filter cleared: the cash and the total are back
  await act(async () => { setPrefs({ search: '' }); });
  expect(rows()).toBe(5);
  expect(document.querySelectorAll('.cash-row').length).toBe(1);
  expect(document.querySelectorAll('.total-row').length).toBe(1);
  await act(async () => { root.unmount(); });
  setPrefs({ merge: false, search: '' });
});
