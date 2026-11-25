import { useEffect, useMemo, useRef, useState } from 'react';
import { SlidersIcon } from './icons';
import type { Account, Dataset, Position } from '../../shared/model';
import { dripGap, matches, positionsIn, rangePos, sortPositions, totalsOf } from '../app/derive';
import { t } from '../app/i18n';
import { prefs, setPrefs } from '../app/prefs';
import { useStore } from './useStore';
import { RangeBar } from './RangeBar';
import { Zoom } from './Zoom';
import { DRIP_HINT, DRIP_USD_HINT, DripValue } from './Drip';
import { ColumnPicker } from './ColumnPicker';
import { shownKeys } from '../app/columns';
import { DASH, bigUsd, pct, qty, signedPct, signedUsd, siteDate, tone, usd } from './format';

// Positions: the columns of Fidelity's "My View", sortable, one block per account with its cash and its total, and a
// grand total when several accounts are shown. Our own columns come first (owner 2026-11-24: DRIP and DRIP $), then
// Fidelity's. Columns are chosen in a window like the ⤢ of the cards and remembered
interface Col { key: string; label: string; group: string; hint?: string; cell: (p: Position) => React.ReactNode; total?: (ps: Position[], a: Account[]) => React.ReactNode }

const sum = (ps: Position[], f: (p: Position) => number | undefined) => ps.reduce((s, p) => s + (f(p) ?? 0), 0);
const glCell = (v: number | undefined, text: string) => <span className={tone(v)}>{text}</span>;

function Range({ p }: { p: Position }) {
  const r = rangePos(p);
  if (r === null) return <>{DASH}</>;
  return (
    <span className="inline-flex flex-col items-stretch gap-0.5 align-middle" style={{ width: '7rem' }} title={`${usd(p.low52)} - ${usd(p.high52)}`}>
      <RangeBar pos={r} shape="diamond" />
      <span className="flex justify-between text-[10px] text-slate-500"><span>{usd(p.low52)}</span><span>{usd(p.high52)}</span></span>
    </span>
  );
}

const dripOf = (p: Position, f: (d: { shares: number; usd: number }) => React.ReactNode) => { const d = dripGap(p); return d ? f(d) : DASH; };

// the groups of the columns window, in Fidelity's words where it has them
const OURS = () => t('Our columns');
const GL = () => t('Gain/loss');
const ACCT = () => t('Account specifics');
const QUOTE = () => t('Quote data');
const DIV = () => t('Dividends and yield');

export const COLUMNS = (): Col[] => [
  { key: 'drip', label: 'DRIP', group: OURS(), hint: DRIP_HINT(), cell: (p) => dripOf(p, (d) => <DripValue value={d.shares} as="shares" />) },
  { key: 'dripUsd', label: 'DRIP $', group: OURS(), hint: DRIP_USD_HINT(), cell: (p) => dripOf(p, (d) => <DripValue value={d.usd} as="usd" />) },
  { key: 'todayGlPct', group: GL(), label: t("Today's gain/loss %"), cell: (p) => glCell(p.todayGlPct, signedPct(p.todayGlPct)), total: (_ps, a) => { const x = totalsOf(a); return glCell(x.todayGlPct ?? undefined, signedPct(x.todayGlPct)); } },
  { key: 'todayGl', group: GL(), label: t("Today's gain/loss $"), cell: (p) => glCell(p.todayGl, signedUsd(p.todayGl)), total: (_ps, a) => { const x = totalsOf(a); return glCell(x.todayGl, signedUsd(x.todayGl)); } },
  { key: 'totalGlPct', group: GL(), label: t('Total gain/loss %'), cell: (p) => glCell(p.totalGlPct, signedPct(p.totalGlPct)), total: (_ps, a) => { const x = totalsOf(a); return glCell(x.totalGlPct ?? undefined, signedPct(x.totalGlPct)); } },
  { key: 'totalGl', group: GL(), label: t('Total gain/loss $'), cell: (p) => glCell(p.totalGl, signedUsd(p.totalGl)), total: (_ps, a) => { const x = totalsOf(a); return glCell(x.totalGl, signedUsd(x.totalGl)); } },
  { key: 'costBasisTotal', group: ACCT(), label: t('Cost basis total'), cell: (p) => usd(p.costBasisTotal) },
  { key: 'currentValue', group: ACCT(), label: t('Current value'), cell: (p) => usd(p.currentValue), total: (_ps, a) => usd(totalsOf(a).balance) },
  { key: 'quantity', group: ACCT(), label: t('Quantity'), cell: (p) => qty(p.quantity) },
  { key: 'lastPrice', group: QUOTE(), label: t('Last price'), cell: (p) => usd(p.lastPrice) },
  { key: 'percentOfAccount', group: ACCT(), label: t('% of account'), cell: (p) => pct(p.percentOfAccount) },
  { key: 'distRate', group: DIV(), label: t('Dist. rate'), cell: (p) => pct(p.distRate) },
  { key: 'secYield', group: DIV(), label: t('SEC yield'), cell: (p) => pct(p.secYield) },
  { key: 'estAnnualIncome', group: DIV(), label: t('Est. annual income'), cell: (p) => usd(p.estAnnualIncome), total: (ps) => usd(sum(ps, (p) => p.estAnnualIncome)) },
  { key: 'paymentFrequency', group: DIV(), label: t('Payment frequency'), cell: (p) => p.paymentFrequency ?? DASH },
  { key: 'marketCap', group: QUOTE(), label: t('Market cap'), cell: (p) => (p.marketCapText ?? bigUsd(p.marketCap)) },
  { key: 'high52', group: QUOTE(), label: t('52-week range'), cell: (p) => <Range p={p} /> },
  { key: 'exDate', group: DIV(), label: t('Ex-date'), cell: (p) => siteDate(p.exDate) },
  { key: 'payDate', group: DIV(), label: t('Pay date'), cell: (p) => siteDate(p.payDate) },
  { key: 'sector', group: QUOTE(), label: t('Sector'), cell: (p) => p.sector ?? DASH },
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
  const colsButton = useRef<HTMLButtonElement>(null);
  const every = COLUMNS();
  const byKey = new Map(every.map((c) => [c.key, c]));
  const cols = shownKeys(every.map((c) => c.key), pr.columns, pr.hidden).map((k) => byKey.get(k)!);
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
  // height is the room between its top and the footer, measured again on a resize
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
  }, []);
  const first = Math.max(0, Math.floor(view.top / ROW) - OVERSCAN);
  const last = Math.min(lines.length, Math.ceil((view.top + view.height) / ROW) + OVERSCAN);
  const count = all.filter((p) => p.kind === 'position').length;
  const tableWidth = 240 + cols.reduce((sum, c) => sum + width(c.key), 0);

  return (
    <div className="flex min-h-0 flex-col gap-3" data-positions>
      <Zoom open={showCols} title={t('Columns')} origin={colsButton} narrow onClose={() => setShowCols(false)}>
        <ColumnPicker cols={every} order={pr.columns} hidden={pr.hidden} onChange={setPrefs} />
      </Zoom>
      <div ref={box} className="min-h-0 overflow-auto rounded-xl border border-slate-200 dark:border-slate-700" style={{ height: fill ?? '70vh' }} data-rows={lines.length} data-drawn={last - first}>
        <table className="pos-table border-separate border-spacing-0 text-sm" style={{ tableLayout: 'fixed', width: tableWidth, minWidth: '100%' }}>
          <colgroup><col style={{ width: 240 }} />{cols.map((c) => <col key={c.key} style={{ width: width(c.key) }} />)}</colgroup>
          <thead>
            <tr>
              {/* the search lives in the Symbol header (owner 2026-11-24): "Symbol" is its placeholder, the number of positions
                  sits inside it on the right; the sort by symbol keeps a small arrow, the columns icon follows */}
              <th className="!cursor-default" data-symbol-head>
                <div className="flex items-center gap-1">
                  <div className="relative min-w-0 flex-1">
                    <input className="w-full rounded-md border border-slate-300 bg-white py-1 pl-2 pr-10 text-xs font-medium text-slate-900 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                      placeholder={t('Symbol')} aria-label={t('Search symbol or name')} title={t('Search symbol or name')} value={pr.search} onChange={(e) => setPrefs({ search: e.target.value })} data-search />
                    <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-[0.7rem] font-normal text-slate-500" title={t('{n} positions', { n: count })}>{count}</span>
                  </div>
                  <button type="button" className="rounded px-1 text-slate-500 hover:text-slate-900 dark:hover:text-white" title={t('Sort by symbol')} onClick={() => sortBy('symbol')}>{arrow('symbol').trim() || '⇅'}</button>
                  {/* an icon, not a word (owner 2026-11-24: "so it will be clear that we are configuring") */}
                  <button ref={colsButton} type="button" className={`grid size-6 place-items-center rounded text-slate-500 hover:text-slate-900 dark:hover:text-white ${showCols ? 'bg-slate-200 dark:bg-slate-700' : ''}`} title={t('Columns: choose what the table shows')} aria-label={t('Columns: choose what the table shows')} onClick={() => setShowCols(true)} aria-haspopup="dialog" data-columns-button><SlidersIcon /></button>
                </div>
              </th>
              {cols.map((c) => <th key={c.key} onClick={() => sortBy(c.key)} className="whitespace-normal" title={c.hint}>{c.label}{arrow(c.key)}</th>)}
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
