import { useState } from 'react';
import type { Account, Dataset, Position } from '../../shared/model';
import { matches, positionsIn, rangePos, sortPositions, totalsOf } from '../app/derive';
import { t } from '../app/i18n';
import { prefs, setPrefs } from '../app/prefs';
import { useStore } from './useStore';
import { DASH, bigUsd, pct, qty, signedPct, signedUsd, siteDate, tone, usd } from './format';

// Positions: the columns of Fidelity's "My View", sortable, one block per account with its cash and its total, and a
// grand total when several accounts are shown. Columns can be switched off (remembered)
interface Col { key: string; label: string; cell: (p: Position) => React.ReactNode; total?: (ps: Position[], a: Account[]) => React.ReactNode }

const sum = (ps: Position[], f: (p: Position) => number | undefined) => ps.reduce((s, p) => s + (f(p) ?? 0), 0);
const glCell = (v: number | undefined, text: string) => <span className={tone(v)}>{text}</span>;

function Range({ p }: { p: Position }) {
  const r = rangePos(p);
  if (r === null) return <>{DASH}</>;
  return (
    <span className="inline-flex flex-col items-stretch gap-0.5 align-middle" style={{ width: '7rem' }} title={`${usd(p.low52)} - ${usd(p.high52)}`}>
      <span className="relative h-1.5 rounded-full bg-slate-200 dark:bg-slate-700"><span className="absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rotate-45 bg-slate-800 dark:bg-slate-200" style={{ left: `${r * 100}%` }} /></span>
      <span className="flex justify-between text-[10px] text-slate-500"><span>{usd(p.low52)}</span><span>{usd(p.high52)}</span></span>
    </span>
  );
}

export const COLUMNS = (): Col[] => [
  { key: 'todayGlPct', label: t("Today's gain/loss %"), cell: (p) => glCell(p.todayGlPct, signedPct(p.todayGlPct)), total: (_ps, a) => { const x = totalsOf(a); return glCell(x.todayGlPct ?? undefined, signedPct(x.todayGlPct)); } },
  { key: 'todayGl', label: t("Today's gain/loss $"), cell: (p) => glCell(p.todayGl, signedUsd(p.todayGl)), total: (_ps, a) => { const x = totalsOf(a); return glCell(x.todayGl, signedUsd(x.todayGl)); } },
  { key: 'totalGlPct', label: t('Total gain/loss %'), cell: (p) => glCell(p.totalGlPct, signedPct(p.totalGlPct)), total: (_ps, a) => { const x = totalsOf(a); return glCell(x.totalGlPct ?? undefined, signedPct(x.totalGlPct)); } },
  { key: 'totalGl', label: t('Total gain/loss $'), cell: (p) => glCell(p.totalGl, signedUsd(p.totalGl)), total: (_ps, a) => { const x = totalsOf(a); return glCell(x.totalGl, signedUsd(x.totalGl)); } },
  { key: 'costBasisTotal', label: t('Cost basis total'), cell: (p) => usd(p.costBasisTotal) },
  { key: 'currentValue', label: t('Current value'), cell: (p) => usd(p.currentValue), total: (_ps, a) => usd(totalsOf(a).balance) },
  { key: 'quantity', label: t('Quantity'), cell: (p) => qty(p.quantity) },
  { key: 'lastPrice', label: t('Last price'), cell: (p) => usd(p.lastPrice) },
  { key: 'percentOfAccount', label: t('% of account'), cell: (p) => pct(p.percentOfAccount) },
  { key: 'distRate', label: t('Dist. rate'), cell: (p) => pct(p.distRate) },
  { key: 'secYield', label: t('SEC yield'), cell: (p) => pct(p.secYield) },
  { key: 'estAnnualIncome', label: t('Est. annual income'), cell: (p) => usd(p.estAnnualIncome), total: (ps) => usd(sum(ps, (p) => p.estAnnualIncome)) },
  { key: 'paymentFrequency', label: t('Payment frequency'), cell: (p) => p.paymentFrequency ?? DASH },
  { key: 'marketCap', label: t('Market cap'), cell: (p) => (p.marketCapText ?? bigUsd(p.marketCap)) },
  { key: 'high52', label: t('52-week range'), cell: (p) => <Range p={p} /> },
  { key: 'exDate', label: t('Ex-date'), cell: (p) => siteDate(p.exDate) },
  { key: 'payDate', label: t('Pay date'), cell: (p) => siteDate(p.payDate) },
  { key: 'sector', label: t('Sector'), cell: (p) => p.sector ?? DASH },
];

export function Positions({ ds, accounts }: { ds: Dataset; accounts: Account[] }) {
  const pr = useStore(prefs);
  const [showCols, setShowCols] = useState(false);
  const cols = COLUMNS().filter((c) => pr.hidden.indexOf(c.key) < 0);
  const all = positionsIn(ds, accounts).filter((p) => matches(p, pr.search));
  const sortBy = (key: string) => setPrefs({ sort: { key, dir: pr.sort.key === key ? (pr.sort.dir === 1 ? -1 : 1) : key === 'symbol' ? 1 : -1 } });
  const arrow = (key: string) => (pr.sort.key === key ? (pr.sort.dir === 1 ? ' ▲' : ' ▼') : '');
  const several = accounts.length > 1;

  const block = (a: Account) => {
    const own = all.filter((p) => p.account === a.number);
    const cash = own.filter((p) => p.kind === 'core');
    const pending = own.filter((p) => p.kind === 'pending');
    const secs = sortPositions(own.filter((p) => p.kind === 'position'), pr.sort.key, pr.sort.dir);
    if (pr.search && !secs.length) return null;
    return [
      <tr key={`${a.number}-h`} className="acct-row"><td colSpan={cols.length + 1}><span className="font-semibold">{a.name}</span> <span className="text-xs text-slate-500">{a.number}</span></td></tr>,
      ...cash.map((p) => (
        <tr key={`${a.number}-c-${p.symbol}`} className="cash-row">
          <td><div className="font-semibold">{t('Cash')} <span className="text-xs font-normal text-slate-500">{p.description}</span></div><div className="text-xs text-slate-500">{p.symbol}</div></td>
          {cols.map((c) => <td key={c.key}>{c.key === 'currentValue' ? usd(p.currentValue) : c.key === 'secYield' || c.key === 'distRate' ? c.cell(p) : ''}</td>)}
        </tr>
      )),
      ...secs.map((p) => (
        <tr key={`${a.number}-${p.symbol}`} data-symbol={p.symbol}>
          <td><div className="font-semibold">{p.symbol}</div><div className="max-w-[14rem] truncate text-xs text-slate-500 dark:text-slate-400" title={p.description}>{p.description}</div></td>
          {cols.map((c) => <td key={c.key}>{c.cell(p)}</td>)}
        </tr>
      )),
      ...pending.map((p) => (
        <tr key={`${a.number}-p`}><td>{t('Pending activity')}</td>{cols.map((c) => <td key={c.key}>{c.key === 'currentValue' ? signedUsd(p.currentValue) : ''}</td>)}</tr>
      )),
      <tr key={`${a.number}-t`} className="total-row"><td>{t('Account total')}</td>{cols.map((c) => <td key={c.key}>{c.total ? c.total(own, [a]) : ''}</td>)}</tr>,
    ];
  };

  return (
    <div className="flex min-h-0 flex-col gap-3" data-positions>
      <div className="flex flex-wrap items-center gap-2">
        <input className="inp max-w-xs" placeholder={t('Search symbol or name')} value={pr.search} onChange={(e) => setPrefs({ search: e.target.value })} />
        <span className="text-sm text-slate-500">{t('{n} positions', { n: all.filter((p) => p.kind === 'position').length })}</span>
        <div className="flex-1" />
        <button type="button" className={`btn sm ${showCols ? 'active' : ''}`} onClick={() => setShowCols((v) => !v)} aria-expanded={showCols}>{t('Columns')}</button>
      </div>
      {showCols && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 rounded-xl border border-slate-200 p-3 text-sm dark:border-slate-700">
          {COLUMNS().map((c) => (
            <label key={c.key} className="flex items-center gap-1.5">
              <input type="checkbox" checked={pr.hidden.indexOf(c.key) < 0} onChange={(e) => setPrefs({ hidden: e.target.checked ? pr.hidden.filter((k) => k !== c.key) : pr.hidden.concat(c.key) })} />{c.label}
            </label>
          ))}
        </div>
      )}
      <div className="min-h-0 overflow-auto rounded-xl border border-slate-200 dark:border-slate-700" style={{ maxHeight: '70vh' }}>
        <table className="pos-table w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th onClick={() => sortBy('symbol')}>{t('Symbol')}{arrow('symbol')}</th>
              {cols.map((c) => <th key={c.key} onClick={() => sortBy(c.key)}>{c.label}{arrow(c.key)}</th>)}
            </tr>
          </thead>
          <tbody>
            {accounts.map((a) => block(a))}
            {several && <tr className="total-row"><td>{t('Grand total')}</td>{cols.map((c) => <td key={c.key}>{c.total ? c.total(all, accounts) : ''}</td>)}</tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
