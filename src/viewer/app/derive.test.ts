/// <reference types="bun" />
/// <reference types="node" />
/// <reference lib="esnext" />
import { expect, test } from 'bun:test';
import { ROWS, SIDEBAR } from '../../shared/fixtures/grid';
import { buildDataset } from '../../shared/parse';
import { accountsIn, allocation, groupsOf, matches, movers, near52, positionsIn, rangePos, sortPositions, totalsOf, upcomingDividends, validScope } from './derive';

const ds = buildDataset({ rows: ROWS, sidebar: SIDEBAR, asOf: null, builtAt: 't' });

test('scopes: all, a group, an account; an unknown scope falls back to all', () => {
  expect(groupsOf(ds).map((g) => [g.name, g.accounts.length, g.balance])).toEqual([['Investment', 1, 1525.5], ['Retirement', 1, 800]]);
  expect(accountsIn(ds, 'all')).toHaveLength(2);
  expect(accountsIn(ds, 'group:Retirement').map((a) => a.number)).toEqual(['200000002']);
  expect(accountsIn(ds, 'account:X10000001').map((a) => a.name)).toEqual(['Joint']);
  expect(validScope(ds, 'account:gone')).toBe('all');
  expect(validScope(ds, 'group:Investment')).toBe('group:Investment');
});

test('totals and movers', () => {
  const tot = totalsOf(ds.accounts);
  expect(tot.balance).toBe(2325.5);
  expect(tot.todayGl).toBeCloseTo(8.3);
  expect(tot.cash).toBe(25.5);
  const m = movers(positionsIn(ds, ds.accounts));
  expect(m.top.map((p) => p.symbol)).toEqual(['AAAA']);
  expect(m.bottom.map((p) => p.symbol)).toEqual(['BBBB']);
});

test('allocation, dividends, 52-week, sort and search', () => {
  const ps = positionsIn(ds, ds.accounts);
  expect(allocation(ps, (p) => p.sector).map((s) => s.name)).toEqual(['Energy', 'Other', 'Cash']);
  expect(upcomingDividends(ps, '2026-11-20').map((p) => p.symbol)).toEqual(['AAAA']);
  expect(upcomingDividends(ps, '2026-12-13')).toEqual([]);
  expect(rangePos(ps[1]!)).toBeCloseTo(100 / 110);
  expect(near52(ps, 0.1).highs.map((p) => p.symbol)).toEqual(['AAAA']);
  const secs = ps.filter((p) => p.kind === 'position');
  expect(sortPositions(secs, 'todayGlPct', -1).map((p) => p.symbol)).toEqual(['AAAA', 'BBBB']);
  expect(sortPositions(ps, 'symbol', 1)[0]!.symbol).toBe('AAAA');
  expect(matches(ps[1]!, 'alpha')).toBe(true);
  expect(matches(ps[1]!, 'zzz')).toBe(false);
});
