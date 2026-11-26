/// <reference lib="esnext" />
import type { Position } from '../../shared/model';
import type { TypedColumn } from '../../shared/typed-columns';
import { rangeRows, type RangeRow } from '../app/derive';
import { t } from '../app/i18n';
import { RangeBar } from './RangeBar';
import type { HeadColumn } from './TypedHead';
import { ZoomTable } from './ZoomTable';
import { pct, qty, signedPct, signedUsd, tone, usd } from './format';

// the big 52-week table (owner 2026-11-24: "more info here"): highs and lows apart, where the price sits in its range,
// how far from the high and the low, today's move and what is held in the shown accounts. One head for both parts: a
// sort or a filter works inside each; with no sort chosen the nearest to the high and to the low come first
type RangeLine = RangeRow & { high: boolean };
const RANGE_COLS = (): (TypedColumn<RangeLine> & HeadColumn)[] => [
  { key: 'symbol', label: t('Symbol'), text: (r) => `${r.symbol} ${r.sector ?? ''} ${r.description}` },
  { key: 'pos', label: t('52-week range'), text: (r) => pct(r.pos * 100), value: (r) => r.pos * 100 },
  { key: 'lastPrice', label: t('Last price'), text: (r) => usd(r.lastPrice), value: (r) => r.lastPrice },
  { key: 'fromHigh', label: t('From the high'), text: (r) => signedPct(r.fromHigh), value: (r) => r.fromHigh },
  { key: 'fromLow', label: t('From the low'), text: (r) => signedPct(r.fromLow), value: (r) => r.fromLow },
  { key: 'shares', label: t('Shares'), text: (r) => qty(r.shares), value: (r) => r.shares },
  { key: 'value', label: t('Value'), text: (r) => usd(r.value), value: (r) => r.value },
  { key: 'totalGl', label: t('Total'), text: (r) => signedUsd(r.totalGl), value: (r) => r.totalGl },
];

export function RangeTable({ highs, lows }: { highs: Position[]; lows: Position[] }) {
  const all: RangeLine[] = rangeRows(highs).sort((a, b) => b.pos - a.pos).map((r) => ({ ...r, high: true }))
    .concat(rangeRows(lows).sort((a, b) => a.pos - b.pos).map((r) => ({ ...r, high: false })));
  const section = (title: string, cls: string, rows: RangeLine[], high: boolean) => rows.length > 0 && (
    <tbody>
      <tr><td colSpan={8} className={`px-2 pt-4 pb-1 text-sm font-semibold ${cls}`}>{title}</td></tr>
      {rows.map((r) => (
        <tr key={r.symbol} className="border-t border-slate-100 dark:border-slate-800 [&>td]:px-2 [&>td]:py-1.5">
          <td className="max-w-[18rem]"><div><span className="font-semibold">{r.symbol}</span> <span className="text-xs text-slate-500 dark:text-slate-400">{r.sector ?? ''}</span></div><div className="truncate text-xs text-slate-500 dark:text-slate-400" title={r.description}>{r.description}</div></td>
          <td>
            <div className="flex items-center justify-end gap-2 num text-xs text-slate-500 dark:text-slate-400">
              <span>{usd(r.low52)}</span>
              <RangeBar pos={r.pos} color={high ? 'var(--gain)' : 'var(--loss)'} className="w-24 flex-none" title={pct(r.pos * 100)} />
              <span>{usd(r.high52)}</span>
            </div>
          </td>
          <td className="num text-right"><div className="font-medium">{usd(r.lastPrice)}</div><div className={`text-xs ${tone(r.dayPct)}`}>{signedPct(r.dayPct)}</div></td>
          <td className="num text-right">{signedPct(r.fromHigh)}</td>
          <td className="num text-right">{signedPct(r.fromLow)}</td>
          <td className="num text-right">{qty(r.shares)}</td>
          <td className="num text-right">{usd(r.value)}</td>
          <td className={`num text-right ${tone(r.totalGl)}`}><div>{signedUsd(r.totalGl)}</div><div className="text-xs">{signedPct(r.totalGlPct)}</div></td>
        </tr>
      ))}
    </tbody>
  );
  return (
    <ZoomTable cols={RANGE_COLS()} rows={all} name="range-table" className="w-full whitespace-nowrap text-sm"
      body={(shown, noMatch) => (
        <>
          {section(t('Near the high'), 'gain', shown.filter((r) => r.high), true)}
          {section(t('Near the low'), 'loss', shown.filter((r) => !r.high), false)}
          {noMatch && <tbody>{noMatch}</tbody>}
        </>
      )} />
  );
}
