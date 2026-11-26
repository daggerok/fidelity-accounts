/// <reference types="bun" />
/// <reference lib="esnext" />
import { expect, test } from 'bun:test';
import { ROWS, SIDEBAR } from '../../shared/fixtures/grid';
import { accountBeta } from '../../shared/beta';
import { combine } from '../../shared/history';
import { buildDataset } from '../../shared/parse';
import { allocation, estAnnualOf, incomeFacts, near52, ofKind, periodBounds, positionsIn, totalsOf, upcomingDividends, windowEnd } from './derive';
import { accountBetas, dividendsView, incomeView, summaryBase } from './summary';

const ds = buildDataset({ rows: ROWS, sidebar: SIDEBAR, asOf: null, builtAt: 't' });
const today = '2026-11-20';

test('the Summary parts give what the cards worked out inline before', () => {
  [ds.accounts, ds.accounts.slice(0, 1), ds.accounts.slice(1)].forEach((accounts) => {
    const ps = positionsIn(ds, accounts);
    const base = summaryBase(ds, accounts);
    expect(base).toEqual({
      tot: totalsOf(accounts), ps, n52: near52(ps),
      sectors: allocation(ps, (p) => p.sector || p.securityType), types: allocation(ps, (p) => p.securityType),
      balance: combine(ds.history, accounts.map((a) => a.number)),
    });
    (['all', 'etf', 'stock', 'none'] as const).forEach((kind) => {
      (['MTD', '1M', 'QTD', '1Q'] as const).forEach((w) => {
        const until = windowEnd(today, w);
        expect(dividendsView(ps, kind, w, today)).toEqual({ ps: ofKind(ps, kind), until, divs: upcomingDividends(ofKind(ps, kind), today, until) });
      });
      const b = periodBounds(today);
      const store = { version: 1 as const, at: 'x', synced: Object.fromEntries(accounts.map((a) => [a.number, today])), rows: [] };
      [null, store].forEach((txns) => {
        const facts = (x: [string, string]) => incomeFacts(txns, accounts, ps, kind, x[0], x[1], today);
        expect(incomeView(txns, accounts, ps, kind, today, base.tot.estAnnualIncome)).toEqual({ Y: facts(b.year), Q: facts(b.quarter), M: facts(b.month), estAnnual: estAnnualOf(kind, base.tot.estAnnualIncome, ps) });
      });
    });
    const betas = accountBetas(ps, accounts, ds.betas);
    accounts.forEach((a) => expect(betas.get(a.number)).toEqual(accountBeta(ps, a.number, ds.betas)));
  });
});

test('the dividends window: the payouts until the end of the month by default, the quarter ahead on 1Q', () => {
  const ps = positionsIn(ds, ds.accounts);
  expect(dividendsView(ps, 'all', 'MTD', today).until).toBe('2026-11-30');
  expect(dividendsView(ps, 'all', '1Q', today).until).toBe('2027-02-20');
});
