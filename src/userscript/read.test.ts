/// <reference types="bun" />
/// <reference types="node" />
/// <reference lib="esnext" />
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, beforeAll, expect, test } from 'bun:test';

beforeAll(() => GlobalRegistrator.register({ url: 'https://digital.fidelity.com/ftgw/digital/portfolio/positions' }));
afterAll(() => GlobalRegistrator.unregister());

// the account list as the site renders it (made-up names, numbers and amounts)
const acct = (name: string, num: string, bal: string, gl: string, pct: string, cls = 'gain') => `
  <div class="acct-selector__acct-wrapper"><div class="acct-selector__acct-content"><div class="acct-selector__acct-title">
    <span class="acct-selector__acct-name"><span>${name}</span></span><span class="acct-selector__acct-num">${num}</span></div>
    <div class="acct-selector__balance-wrapper"><span class="sr-only">, balance:</span><span>${bal}</span>
      <span class="sr-only">, gains/losses:</span><span class="acct-selector__money--${cls}">${gl}</span><span class="acct-selector__money--${cls}">${pct}</span></div></div></div>`;

test('the account list: groups, names, numbers, balances, today change', async () => {
  const { readSidebar, readAsOf } = await import('./read');
  document.body.innerHTML = `<div class="acct-selector__acct-list">
    <div class="acct-selector__group"><div class="acct-selector__group-title"><h3 class="acct-selector__group-name">Investment</h3><span class="acct-selector__group-balance">$3,000.00</span></div>
      ${acct('Joint', 'X10000001', '$2,000.50', '+$20.10', '(+1.01%)')}${acct('Kids', 'X10000002', '$999.50', '-$5.00', '(-0.50%)', 'loss')}</div>
    <div class="acct-selector__group"><h3 class="acct-selector__group-name">Retirement</h3>${acct('ROTH IRA', '200000003', '$1,234.00', '+$1.00', '(+0.08%)')}</div>
  </div><p>As of Nov-20-2026 4:01 p.m. ET</p>`;
  expect(readSidebar(document)).toEqual([
    { group: 'Investment', name: 'Joint', number: 'X10000001', balance: 2000.5, todayGl: 20.1, todayGlPct: 1.01 },
    { group: 'Investment', name: 'Kids', number: 'X10000002', balance: 999.5, todayGl: -5, todayGlPct: -0.5 },
    { group: 'Retirement', name: 'ROTH IRA', number: '200000003', balance: 1234, todayGl: 1, todayGlPct: 0.08 },
  ]);
  expect(readAsOf(document)).toBe('As of Nov-20-2026 4:01 p.m. ET');
  document.body.innerHTML = '<p>nothing here</p>';
  expect(readSidebar(document)).toEqual([]);
  expect(readAsOf(document)).toBeNull();
});
