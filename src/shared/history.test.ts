/// <reference types="bun" />
/// <reference types="node" />
/// <reference lib="esnext" />
import { expect, test } from 'bun:test';
import { ALL_PERIODS, PERIODS, cardPeriods, periodLabel, changeOf, combine, mergeHistory, parseBalanceHistory, periodSlice, type Period, type Point } from './history';

// weekdays only, like market closes, from 2025-10-15 to 2026-11-20 (a Friday), value = day number
function closes(from: string, to: string): Point[] {
  const out: Point[] = [];
  for (let d = new Date(`${from}T00:00:00Z`), n = 1; d <= new Date(`${to}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) out.push({ date: d.toISOString().slice(0, 10), value: 1000 + n++ });
  }
  return out;
}

test('BalanceHistory answers: US dates to ISO, sorted; junk gives nothing', () => {
  expect(parseBalanceHistory({ balHistoryDetail: { balances: [{ value: 2, date: '11/21/2026' }, { value: 1, date: '11/20/2026' }, { value: 'x', date: '11/19/2026' }] } }))
    .toEqual([{ date: '2026-11-20', value: 1 }, { date: '2026-11-21', value: 2 }]);
  expect(parseBalanceHistory(null)).toEqual([]);
  expect(parseBalanceHistory({ sysMsg: 'x' })).toEqual([]);
});

test('merge by date (new value wins) and combine accounts: each counts from its first point, gaps carried', () => {
  const h = mergeHistory({ A: [{ date: '2026-01-02', value: 10 }, { date: '2026-01-05', value: 11 }] }, { A: [{ date: '2026-01-05', value: 12 }], B: [{ date: '2026-01-05', value: 100 }, { date: '2026-01-06', value: 101 }] });
  expect(h.A).toEqual([{ date: '2026-01-02', value: 10 }, { date: '2026-01-05', value: 12 }]);
  expect(combine(h, ['A', 'B'])).toEqual([{ date: '2026-01-02', value: 10 }, { date: '2026-01-05', value: 112 }, { date: '2026-01-06', value: 113 }]);
  expect(combine(h, ['B'])).toEqual(h.B!);
  expect(combine(h, ['missing'])).toEqual([]);
});

test('periods start at the right close', () => {
  const s = closes('2025-10-15', '2026-11-20'); // last = Fri 2026-11-20
  const start = (p: Period) => periodSlice(s, p)[0]!.date;
  expect(periodSlice(s, '1D').map((p) => p.date)).toEqual(['2026-11-19', '2026-11-20']);
  expect(periodSlice(s, '3D')).toHaveLength(4);
  expect(start('WTD')).toBe('2026-11-13'); // the Friday before this Monday
  expect(start('1W')).toBe('2026-11-13');
  expect(start('3W')).toBe('2026-10-30');
  expect(start('MTD')).toBe('2026-10-30'); // the last close of October
  expect(start('1M')).toBe('2026-10-20');
  expect(start('QTD')).toBe('2026-09-30');
  expect(start('1Q')).toBe('2026-08-20');
  expect(start('6M')).toBe('2026-05-20');
  expect(start('YTD')).toBe('2025-12-31');
  expect(start('1Y')).toBe('2025-11-20');
  expect(start('3Y')).toBe('2025-10-15'); // shorter history: from its first point
  expect(periodSlice(s, '2D')).toHaveLength(3);
  expect(start('2W')).toBe('2026-11-06');
  expect(start('10M')).toBe('2026-01-20');
  expect(start('11M')).toBe('2025-12-19'); // Dec 20 2025 is a Saturday
  expect(periodLabel('6M')).toBe('6M/2Q');
  expect(periodLabel('3Q')).toBe('9M/3Q');
  expect(periodLabel('3Q', true)).toBe('9M');
  expect(periodLabel('6M', true)).toBe('6M');
  expect(cardPeriods('1M')).toEqual([...PERIODS]);
  expect(cardPeriods('5M').slice(8, 11)).toEqual(['3M', '5M', '6M']); // a big-chart period joins at its place
  expect(PERIODS).not.toContain('1Q');
  expect(start('3Q')).toBe('2026-02-20'); // 9 months back
  expect(PERIODS.every((p) => (ALL_PERIODS as readonly string[]).includes(p))).toBe(true);
  // month ends clamp: from Mar 31 one month back is Feb 28
  const m = closes('2026-02-02', '2026-03-31');
  expect(periodSlice(m, '1M')[0]!.date).toBe('2026-02-27'); // Feb 28 2026 is a Saturday: the close before it
});

test('change over a period: last minus first, percent of the first; too short gives null', () => {
  expect(changeOf([{ date: 'a', value: 200 }, { date: 'b', value: 210 }])).toEqual({ from: { date: 'a', value: 200 }, to: { date: 'b', value: 210 }, change: 10, pct: 5 });
  expect(changeOf([{ date: 'a', value: 1 }])).toBeNull();
});
