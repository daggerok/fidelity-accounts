import { useEffect, useMemo, useRef, useState } from 'react';
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

// Only the rows in view are drawn (owner 2026-11-24: Positions lagged and the tabs stopped answering): 1,100 positions
// were 21,000 cells, drawn again on every new copy from 👀 Watch. Rows have one fixed height, the columns fixed widths,
// spacer rows stand for the rows above and below the window
const ROW = 50;
const OVERSCAN = 12;
const width = (key: string): number => (key === 'high52' ? 150 : key === 'paymentFrequency' || key === 'marketCap' || key === 'sector' ? 160 : 112);

interface Line { key: string; cls: string; cells: () => React.ReactNode }

export function Positions({ ds, accounts }: { ds: Dataset; accounts: Account[] }) {
  const pr = useStore(prefs);
  const [showCols, setShowCols] = useState(false);
  const cols = COLUMNS().filter((c) => pr.hidden.indexOf(c.key) < 0);
  const colKeys = cols.map((c) => c.key).join(',');
  const all = useMemo(() => positionsIn(ds, accounts).filter((p) => matches(p, pr.search)), [ds, accounts, pr.search]);
  const sortBy = (key: string) => setPrefs({ sort: { key, dir: pr.sort.key === key ? (pr.sort.dir === 1 ? -1 : 1) : key === 'symbol' ? 1 : -1 } });
  const arrow = (key: string) => (pr.sort.key === key ? (pr.sort.dir === 1 ? ' ▲' : ' ▼') : '');
  const several = accounts.length > 1;

  const lines = useMemo(() => {
    const out: Line[] = [];
    accounts.forEach((a) => {
      const own = all.filter((p) => p.account === a.number);
      const cash = own.filter((p) => p.kind === 'core');
      const pending = own.filter((p) => p.kind === 'pending');
      const secs = sortPositions(own.filter((p) => p.kind === 'position'), pr.sort.key, pr.sort.dir);
      if (pr.search && !secs.length) return;
      out.push({ key: `${a.number}-h`, cls: 'acct-row', cells: () => <td colSpan={cols.length + 1}><span className="font-semibold">{a.name}</span> <span className="text-xs text-slate-500">{a.number}</span></td> });
      cash.forEach((p) => out.push({ key: `${a.number}-c-${p.symbol}`, cls: 'cash-row', cells: () => <>
        <td><div className="truncate font-semibold">{t('Cash')} <span className="text-xs font-normal text-slate-500">{p.description}</span></div><div className="text-xs text-slate-500">{p.symbol}</div></td>
        {cols.map((c) => <td key={c.key}>{c.key === 'currentValue' ? usd(p.currentValue) : c.key === 'secYield' || c.key === 'distRate' ? c.cell(p) : ''}</td>)}
      </> }));
      secs.forEach((p) => out.push({ key: `${a.number}-${p.symbol}`, cls: '', cells: () => <>
        <td><div className="font-semibold">{p.symbol}</div><div className="truncate text-xs text-slate-500 dark:text-slate-400" title={p.description}>{p.description}</div></td>
        {cols.map((c) => <td key={c.key}>{c.cell(p)}</td>)}
      </> }));
      pending.forEach((p) => out.push({ key: `${a.number}-p`, cls: '', cells: () => <><td>{t('Pending activity')}</td>{cols.map((c) => <td key={c.key}>{c.key === 'currentValue' ? signedUsd(p.currentValue) : ''}</td>)}</> }));
      out.push({ key: `${a.number}-t`, cls: 'total-row', cells: () => <><td>{t('Account total')}</td>{cols.map((c) => <td key={c.key}>{c.total ? c.total(own, [a]) : ''}</td>)}</> });
    });
    if (several) out.push({ key: 'grand', cls: 'total-row', cells: () => <><td>{t('Grand total')}</td>{cols.map((c) => <td key={c.key}>{c.total ? c.total(all, accounts) : ''}</td>)}</> });
    return out;
    // cols follow colKeys; the rest are the inputs of the rows (no lint in this repo)
  }, [all, accounts, pr.sort.key, pr.sort.dir, pr.search, colKeys, several]);

  const box = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ top: 0, height: 800 });
  useEffect(() => {
    const el = box.current;
    if (!el) return undefined;
    let frame = 0;
    const on = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => setView({ top: el.scrollTop, height: el.clientHeight })); };
    on();
    el.addEventListener('scroll', on, { passive: true });
    const ro = new ResizeObserver(on);
    ro.observe(el);
    return () => { cancelAnimationFrame(frame); el.removeEventListener('scroll', on); ro.disconnect(); };
  }, []);
  // the table reaches down to the footer (owner 2026-11-24: "fix main area", it stopped at 70% of the window): its
  // height is the room between its top and the footer, measured again on a resize or when the columns panel opens
  const [fill, setFill] = useState<number | null>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return undefined;
    const measure = () => {
      const foot = document.querySelector('footer')?.getBoundingClientRect().top ?? window.innerHeight;
      setFill(Math.max(240, Math.floor(foot - el.getBoundingClientRect().top)));
    };
    measure();
    window.addEventListener('resize', measure);
    const ro = new ResizeObserver(measure);
    if (el.parentElement) ro.observe(el.parentElement);
    return () => { window.removeEventListener('resize', measure); ro.disconnect(); };
  }, [showCols]);
  const first = Math.max(0, Math.floor(view.top / ROW) - OVERSCAN);
  const last = Math.min(lines.length, Math.ceil((view.top + view.height) / ROW) + OVERSCAN);
  const tableWidth = 240 + cols.reduce((sum, c) => sum + width(c.key), 0);

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
      <div ref={box} className="min-h-0 overflow-auto rounded-xl border border-slate-200 dark:border-slate-700" style={{ height: fill ?? '70vh' }} data-rows={lines.length} data-drawn={last - first}>
        <table className="pos-table border-separate border-spacing-0 text-sm" style={{ tableLayout: 'fixed', width: tableWidth, minWidth: '100%' }}>
          <colgroup><col style={{ width: 240 }} />{cols.map((c) => <col key={c.key} style={{ width: width(c.key) }} />)}</colgroup>
          <thead>
            <tr>
              <th onClick={() => sortBy('symbol')}>{t('Symbol')}{arrow('symbol')}</th>
              {cols.map((c) => <th key={c.key} onClick={() => sortBy(c.key)} className="whitespace-normal">{c.label}{arrow(c.key)}</th>)}
            </tr>
          </thead>
          <tbody>
            {first > 0 && <tr aria-hidden="true" className="pos-spacer" style={{ height: first * ROW }}><td colSpan={cols.length + 1} /></tr>}
            {lines.slice(first, last).map((l) => <tr key={l.key} className={l.cls} style={{ height: ROW }}>{l.cells()}</tr>)}
            {last < lines.length && <tr aria-hidden="true" className="pos-spacer" style={{ height: (lines.length - last) * ROW }}><td colSpan={cols.length + 1} /></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
