/// <reference lib="esnext" />
import type { Position } from '../../shared/model';
import type { TypedColumn } from '../../shared/typed-columns';
import { t } from '../app/i18n';
import { GainLoss } from './GainLoss';
import type { HeadColumn } from './TypedHead';
import { ZoomTable } from './ZoomTable';
import { signedPct, signedUsd } from './format';

// The top and bottom movers of the Summary: the card's lists and the lists of its ⤢ window
// each row has its own transition name, so on % and $ the rows glide to their new places; `at` keeps the card's and
// the big window's names apart (a name used twice cancels the whole transition). A table with no borders (owner
// 2026-11-24): tickers, names and values ("$ (%)" as one column) each aligned; the lists share one table so the top and
// the bottom line up too
const MoverRow = ({ p, at }: { p: Position; at: 'card' | 'big' }) => (
  <tr data-fit-row style={{ viewTransitionName: `mv-${at}-${p.symbol.replace(/\W/g, '_')}` } as React.CSSProperties}>
    <td className="whitespace-nowrap py-1 pr-2 align-baseline font-semibold">{p.symbol}</td>
    <td className="w-full max-w-0 truncate py-1 align-baseline text-xs text-slate-500 dark:text-slate-400" title={p.description}>{p.description}</td>
    <td className="whitespace-nowrap py-1 pl-3 text-right align-baseline"><GainLoss usd={p.todayGl} pct={p.todayGlPct} /></td>
  </tr>
);

export function Movers({ lists, at }: { lists: Position[][]; at: 'card' | 'big' }) {
  return (
    <table className="w-full text-sm" data-movers>
      {lists.map((list, i) => (
        <tbody key={i}>
          {i > 0 && list.length > 0 && <tr aria-hidden><td colSpan={3} className="h-3" /></tr>}
          {list.map((p) => <MoverRow key={p.symbol} p={p} at={at} />)}
        </tbody>
      ))}
    </table>
  );
}

// one list of the big movers window with the shared head: the change sorts and filters by what the % and $ switch shows
export function MoversBig({ list, by }: { list: Position[]; by: 'pct' | 'usd' }) {
  const cols: (TypedColumn<Position> & HeadColumn)[] = [
    { key: 'symbol', label: t('Symbol'), align: 'left', text: (p) => p.symbol },
    { key: 'name', label: t('Name'), align: 'left', text: (p) => p.description },
    by === 'usd'
      ? { key: 'today', label: t("Today's"), text: (p) => signedUsd(p.todayGl), value: (p) => p.todayGl }
      : { key: 'today', label: t("Today's"), text: (p) => signedPct(p.todayGlPct), value: (p) => p.todayGlPct },
  ];
  return <ZoomTable cols={cols} rows={list} name="movers" row={(p) => <MoverRow key={p.symbol} p={p} at="big" />} />;
}
