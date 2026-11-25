/// <reference lib="esnext" />
import { useEffect, useMemo, useRef, useState } from 'react';
import { SlidersIcon } from './icons';
import type { Account, Dataset, Position } from '../../shared/model';
import { dripGap, positionsIn, rangePos, securities, totalsOf } from '../app/derive';
import { FIELD_COLUMNS, fieldText, fieldValue, positionColumn, type FieldGroup } from '../app/position-columns';
import { activeFilters, columnTypes, nextSort, rowTest, sortRows, withFilter, withType } from '../../shared/typed-columns';
import { NoMatch, TypedHead, type HeadColumn, type TableControl } from './TypedHead';
import { t } from '../app/i18n';
import { prefs, setPrefs } from '../app/prefs';
import { useStore } from './useStore';
import { RangeBar } from './RangeBar';
import { Zoom } from './Zoom';
import { CellScroll } from './CellScroll';
import { DRIP_HINT, DRIP_USD_HINT, DripValue } from './Drip';
import { ColumnPicker } from './ColumnPicker';
import { shownKeys } from '../app/columns';
import { DASH, bigUsd, pct, qty, signedPct, signedUsd, signedUsdPct, siteDate, tone, usd } from './format';

// Positions: the columns of Fidelity's "My View", sortable, one block per account with its cash and its total, and a
// grand total when several accounts are shown. Our own columns come first (owner 2026-11-24: DRIP and DRIP $), then
// Fidelity's. Columns are chosen in a window like the ⤢ of the cards and remembered. Every column has a detected type,
// sorts by it and has a filter under its name (owner 2026-11-24; TypedHead, what a column reads: app/position-columns.ts)
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

// the groups of the columns window, in Fidelity's words where it has them; the column names are short (owner 2026-11-25:
// Today's gain/loss -> Today's, Total gain/loss -> Total, Est. annual income -> Est. income, Payment frequency -> Frequency)
const OURS = () => t('Our columns');
const GL = () => t('Gain/loss');
const ACCT = () => t('Account specifics');
const QUOTE = () => t('Quote data');
const DIV = () => t('Dividends and yield');
const FUND = () => t('Fundamentals');
const PERF = () => t('Performance');
const OTHER = () => t('Other');
const FIELD_GROUP: Record<FieldGroup, () => string> = { acct: ACCT, quote: QUOTE, div: DIV, fund: FUND, perf: PERF, other: OTHER };
// the names of the field columns, in Fidelity's words where it has them
const FIELD_LABEL = (): Record<string, string> => ({
  avgCost: t('Average cost basis'), acctType: t('Account type'), costMethod: t('Cost basis method'), hardToBorrow: t('Hard to borrow'),
  lastChange: t('Last price change'), lastChangePct: t('Last price change %'), open: t('Open'), prevClose: t('Previous close'),
  bid: t('Bid'), bidSize: t('Bid size'), ask: t('Ask'), askSize: t('Ask size'), volume: t('Volume'), avgVolume10: t('Avg. volume (10 day)'), avgVolume90: t('Avg. volume (90 day)'),
  high52Price: t('52-week high'), low52Price: t('52-week low'), high52Date: t('52-week high date'), low52Date: t('52-week low date'),
  volatility30: t('Volatility (30 day)'), volatility250: t('Volatility (1 year)'), dividendAmount: t('Dividend amount'),
  peRatio: t('P/E ratio'), shortPct: t('Short %'), shortInterest: t('Short interest'), shortRatio: t('Short interest ratio'), sharesOut: t('Shares outstanding'),
  earningsDate: t('Earnings date'), analystRating: t('Analyst ratings'), industry: t('Industry'), subIndustry: t('Sub-industry'),
  morningstar: t('Morningstar rating'), morningstarCategory: t('Morningstar category'), expenseGross: t('Gross expense ratio'), expenseNet: t('Net expense ratio'),
  returnYtd: t('YTD return'), return1y: t('1-year return'), return3y: t('3-year return'), return5y: t('5-year return'), return10y: t('10-year return'),
  cusip: t('CUSIP'), securityType: t('Security type'), optionable: t('Optionable'), currency: t('Currency'),
});
const fieldCols = (): Col[] => {
  const label = FIELD_LABEL();
  return FIELD_COLUMNS.map((c) => ({ key: c.key, group: FIELD_GROUP[c.group](), label: label[c.key] ?? c.key, cell: (p: Position) => {
    const text = fieldText(p, c) || DASH;
    return c.format === 'signedPct' || c.format === 'signedUsd' ? glCell(fieldValue(p, c), text) : text;
  } }));
};
const lowHigh = (p: Position): string => { const lo = p.fields.dayRange_low; const hi = p.fields.dayRange_high; return typeof lo === 'number' && typeof hi === 'number' ? `${usd(lo)} - ${usd(hi)}` : DASH; };

export const COLUMNS = (): Col[] => [
  { key: 'drip', label: 'DRIP', group: OURS(), hint: DRIP_HINT(), cell: (p) => dripOf(p, (d) => <DripValue value={d.shares} as="shares" />) },
  { key: 'dripUsd', label: 'DRIP $', group: OURS(), hint: DRIP_USD_HINT(), cell: (p) => dripOf(p, (d) => <DripValue value={d.usd} as="usd" />) },
  { key: 'todayGlPct', group: GL(), label: t("Today's %"), cell: (p) => glCell(p.todayGlPct, signedPct(p.todayGlPct)), total: (_ps, a) => { const x = totalsOf(a); return glCell(x.todayGlPct ?? undefined, signedPct(x.todayGlPct)); } },
  { key: 'todayGl', group: GL(), label: t("Today's $"), cell: (p) => glCell(p.todayGl, signedUsd(p.todayGl)), total: (_ps, a) => { const x = totalsOf(a); return glCell(x.todayGl, signedUsd(x.todayGl)); } },
  { key: 'totalGlPct', group: GL(), label: t('Total %'), cell: (p) => glCell(p.totalGlPct, signedPct(p.totalGlPct)), total: (_ps, a) => { const x = totalsOf(a); return glCell(x.totalGlPct ?? undefined, signedPct(x.totalGlPct)); } },
  { key: 'totalGl', group: GL(), label: t('Total $'), cell: (p) => glCell(p.totalGl, signedUsd(p.totalGl)), total: (_ps, a) => { const x = totalsOf(a); return glCell(x.totalGl, signedUsd(x.totalGl)); } },
  { key: 'costBasisTotal', group: ACCT(), label: t('Cost basis total'), cell: (p) => usd(p.costBasisTotal) },
  { key: 'currentValue', group: ACCT(), label: t('Current value'), cell: (p) => usd(p.currentValue), total: (_ps, a) => usd(totalsOf(a).balance) },
  { key: 'quantity', group: ACCT(), label: t('Quantity'), cell: (p) => qty(p.quantity) },
  { key: 'lastPrice', group: QUOTE(), label: t('Last price'), cell: (p) => usd(p.lastPrice) },
  { key: 'percentOfAccount', group: ACCT(), label: t('% of account'), cell: (p) => pct(p.percentOfAccount) },
  { key: 'distRate', group: DIV(), label: t('Dist. rate'), cell: (p) => pct(p.distRate) },
  { key: 'secYield', group: DIV(), label: t('SEC yield'), cell: (p) => pct(p.secYield) },
  { key: 'estAnnualIncome', group: DIV(), label: t('Est. income'), cell: (p) => usd(p.estAnnualIncome), total: (ps) => usd(sum(ps, (p) => p.estAnnualIncome)) },
  { key: 'paymentFrequency', group: DIV(), label: t('Frequency'), cell: (p) => p.paymentFrequency ?? DASH },
  { key: 'marketCap', group: QUOTE(), label: t('Market cap'), cell: (p) => (p.marketCapText ?? bigUsd(p.marketCap)) },
  { key: 'high52', group: QUOTE(), label: t('52-week range'), cell: (p) => <Range p={p} /> },
  { key: 'exDate', group: DIV(), label: t('Ex-date'), cell: (p) => siteDate(p.exDate) },
  { key: 'payDate', group: DIV(), label: t('Pay date'), cell: (p) => siteDate(p.payDate) },
  { key: 'sector', group: QUOTE(), label: t('Sector'), cell: (p) => p.sector ?? DASH },
  // the rest of Fidelity's columns, hidden until turned on (prefs NEW_COLUMN_KEYS)
  { key: 'todayGlBoth', group: GL(), label: t("Today's ($ and %)"), cell: (p) => glCell(p.todayGl, p.todayGl === undefined ? DASH : signedUsdPct(p.todayGl, p.todayGlPct)), total: (_ps, a) => { const x = totalsOf(a); return glCell(x.todayGl, signedUsdPct(x.todayGl, x.todayGlPct)); } },
  { key: 'totalGlBoth', group: GL(), label: t('Total ($ and %)'), cell: (p) => glCell(p.totalGl, p.totalGl === undefined ? DASH : signedUsdPct(p.totalGl, p.totalGlPct)), total: (_ps, a) => { const x = totalsOf(a); return glCell(x.totalGl, signedUsdPct(x.totalGl, x.totalGlPct)); } },
  { key: 'dayRange', group: QUOTE(), label: t("Day's range"), cell: lowHigh },
  ...fieldCols(),
];

// Only the rows in view are drawn (owner 2026-11-24: Positions lagged and the tabs stopped answering): 1,100 positions
// were 21,000 cells, drawn again on every new copy from 👀 Watch. Rows have one fixed height, the columns fixed widths,
// spacer rows stand for the rows above and below the window
const ROW = 50;
// the Symbol column: narrower than the 240 it was (owner 2026-11-24: "that column width can be 2 less, if we have that
// scroll"; then "make it little bit wider" so the name, its badge and the columns icon share one line),
// a long name scrolls inside its cell (CellScroll)
const SYMBOL_W = 150;
const OVERSCAN = 12;
// wide enough for a name in two lines with its type badge and for a filter like >2026-12-01
const WIDE: Record<string, number> = { high52: 150, paymentFrequency: 160, marketCap: 160, sector: 160, dayRange: 160, todayGlBoth: 170, totalGlBoth: 170 };
FIELD_COLUMNS.forEach((c) => { if (c.width) WIDE[c.key] = c.width; });
const width = (key: string): number => WIDE[key] ?? 128;
const SYMBOL = 'symbol';

interface Line { key: string; cls: string; cells: () => React.ReactNode }

export function Positions({ ds, accounts }: { ds: Dataset; accounts: Account[] }) {
  const pr = useStore(prefs);
  const [showCols, setShowCols] = useState(false);
  const colsButton = useRef<HTMLButtonElement>(null);
  const every = COLUMNS();
  const byKey = new Map(every.map((c) => [c.key, c]));
  const cols = shownKeys(every.map((c) => c.key), pr.columns, pr.hidden).map((k) => byKey.get(k)!);
  const colKeys = cols.map((c) => c.key).join(',');
  const all = useMemo(() => positionsIn(ds, accounts), [ds, accounts]);
  const several = accounts.length > 1;
  // the Symbol column and every column of the table, also the hidden ones: a filter keeps working when its column is
  // switched off, as in the investments apps (Clear filters and its number tell that one is on)
  const typed = useMemo(() => [SYMBOL].concat(every.map((c) => c.key)).map(positionColumn), [every.length]);
  // types come from all the securities shown, before any filter, so a filter never changes the type of its own column
  const { types, detected } = useMemo(() => columnTypes(typed, securities(all), pr.types), [typed, all, pr.types]);
  const filters = useMemo(() => withFilter(pr.filters, SYMBOL, pr.search), [pr.filters, pr.search]);
  const filtered = activeFilters(filters) > 0;
  // the securities that pass the filters, in the chosen order: filtered and sorted once, then cut by account
  const shown = useMemo(() => {
    const test = rowTest(typed, types, filters);
    const kept = test ? securities(all).filter(test) : securities(all);
    return sortRows(kept, positionColumn(pr.sort.key), types[pr.sort.key] ?? columnTypes([positionColumn(pr.sort.key)], kept).types[pr.sort.key]!, pr.sort.dir);
  }, [all, typed, types, filters, pr.sort.key, pr.sort.dir]);
  const control: TableControl = {
    sort: pr.sort, filters, types, detected,
    onSort: (key) => setPrefs({ sort: nextSort(pr.sort, key, types[key] ?? 'string') }),
    onFilter: (key, value) => setPrefs(key === SYMBOL ? { search: value } : { filters: withFilter(prefs.get().filters, key, value) }),
    onType: (key, reset) => setPrefs({ types: withType(prefs.get().types, key, types[key] ?? 'string', detected[key] ?? 'string', reset) }),
  };

  const lines = useMemo(() => {
    const out: Line[] = [];
    accounts.forEach((a) => {
      const own = all.filter((p) => p.account === a.number);
      const cash = own.filter((p) => p.kind === 'core');
      const pending = own.filter((p) => p.kind === 'pending');
      const secs = shown.filter((p) => p.account === a.number);
      // an account with no row left by the filters is not shown
      if (filtered && !secs.length) return;
      out.push({ key: `${a.number}-h`, cls: 'acct-row', cells: () => <td colSpan={cols.length + 1}><span className="font-semibold">{a.name}</span> <span className="text-xs text-slate-500">{a.number}</span></td> });
      cash.forEach((p) => out.push({ key: `${a.number}-c-${p.symbol}`, cls: 'cash-row', cells: () => <>
        <td><CellScroll className="font-semibold">{t('Cash')} <span className="text-xs font-normal text-slate-500">{p.description}</span></CellScroll><div className="text-xs text-slate-500">{p.symbol}</div></td>
        {cols.map((c) => <td key={c.key}>{c.key === 'currentValue' ? usd(p.currentValue) : c.key === 'secYield' || c.key === 'distRate' ? c.cell(p) : ''}</td>)}
      </> }));
      secs.forEach((p) => out.push({ key: `${a.number}-${p.symbol}`, cls: '', cells: () => <>
        <td><div className="font-semibold">{p.symbol}</div><CellScroll className="text-xs text-slate-500 dark:text-slate-400">{p.description}</CellScroll></td>
        {cols.map((c) => <td key={c.key}>{c.cell(p)}</td>)}
      </> }));
      pending.forEach((p) => out.push({ key: `${a.number}-p`, cls: '', cells: () => <><td>{t('Pending activity')}</td>{cols.map((c) => <td key={c.key}>{c.key === 'currentValue' ? signedUsd(p.currentValue) : ''}</td>)}</> }));
      out.push({ key: `${a.number}-t`, cls: 'total-row', cells: () => <><td>{t('Account total')}</td>{cols.map((c) => <td key={c.key}>{c.total ? c.total(own, [a]) : ''}</td>)}</> });
    });
    if (filtered && !shown.length) out.push({ key: 'none', cls: '', cells: () => <NoMatch span={cols.length + 1} /> });
    if (several) out.push({ key: 'grand', cls: 'total-row', cells: () => <><td>{t('Grand total')}</td>{cols.map((c) => <td key={c.key}>{c.total ? c.total(all, accounts) : ''}</td>)}</> });
    return out;
    // cols follow colKeys; the rest are the inputs of the rows (no lint in this repo)
  }, [all, shown, accounts, filtered, colKeys, several]);

  const box = useRef<HTMLDivElement>(null);
  const headBox = useRef<HTMLDivElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
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
    // the header is its own table above the scrolling rows (owner 2026-11-24: the scrollbar starts at the first row, not
    // beside the header): it follows the rows sideways; a sideways swipe or a focused filter on the header moves the rows
    const head = headBox.current;
    const follow = () => { if (head && head.scrollLeft !== el.scrollLeft) head.scrollLeft = el.scrollLeft; };
    const lead = () => { if (head && el.scrollLeft !== head.scrollLeft) el.scrollLeft = head.scrollLeft; };
    const wheel = (e: WheelEvent) => { if (!head || !e.deltaX) return; el.scrollLeft += e.deltaX; e.preventDefault(); };
    el.addEventListener('scroll', follow, { passive: true });
    head?.addEventListener('scroll', lead, { passive: true });
    head?.addEventListener('wheel', wheel, { passive: false });
    return () => { cancelAnimationFrame(frame); el.removeEventListener('scroll', on); el.removeEventListener('scroll', follow); head?.removeEventListener('scroll', lead); head?.removeEventListener('wheel', wheel); ro.disconnect(); };
  }, []);
  // the table reaches down to the footer (owner 2026-11-24: "fix main area", it stopped at 70% of the window): its
  // height is the room between its top and the footer, measured again on a resize
  const [fill, setFill] = useState<number | null>(null);
  useEffect(() => {
    const el = wrap.current;
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
  const total = securities(all).length;
  const head: HeadColumn[] = [{ key: SYMBOL, label: t('Symbol'), align: 'left', wrap: true }];
  cols.forEach((c) => head.push({ key: c.key, label: c.label, hint: c.hint }));
  const on = activeFilters(filters);
  const tableWidth = SYMBOL_W + cols.reduce((sum, c) => sum + width(c.key), 0);

  return (
    <div className="flex min-h-0 flex-col gap-3" data-positions>
      <Zoom open={showCols} title={t('Columns')} origin={colsButton} narrow onClose={() => setShowCols(false)}>
        <ColumnPicker cols={every} order={pr.columns} hidden={pr.hidden} onChange={setPrefs} />
      </Zoom>
      {/* one rounded box: the header table on top, the rows below it in their own scroll box, so the vertical scrollbar
          runs beside the rows only; both tables share the column widths, and both keep a scrollbar gutter so they line up */}
      <div ref={wrap} className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700" style={{ height: fill ?? '70vh' }} data-positions-box>
        <div ref={headBox} className="flex-none overflow-hidden bg-[#f8fafc] [scrollbar-gutter:stable] dark:bg-[#1e293b]" data-positions-head>
        <table className="pos-table border-separate border-spacing-0 text-sm" style={{ tableLayout: 'fixed', width: tableWidth, minWidth: '100%' }}>
          <colgroup><col style={{ width: SYMBOL_W }} />{cols.map((c) => <col key={c.key} style={{ width: width(c.key) }} />)}</colgroup>
          {/* the Symbol filter is the search by symbol or name (owner 2026-11-24), the number of positions sits inside it on
              the right and follows the filters; Clear filters and the columns icon follow the Symbol name */}
          <TypedHead control={control}
            cols={head}
            inputs={{ [SYMBOL]: { placeholder: t('Symbol'), note: on ? `${shown.length}/${total}` : String(total), noteTitle: on ? t('{n} of {total} positions', { n: shown.length, total }) : t('{n} positions', { n: total }) } }}
            extras={{ [SYMBOL]: (
              <span className="ml-auto flex flex-none items-center gap-1">
                {on > 0 && <button type="button" className="rounded-md border border-[var(--brand-ring)] px-1.5 text-[0.7rem] font-medium leading-5 text-[var(--brand-strong)] hover:bg-[var(--brand-soft)]" title={t('Clear all {n} filters', { n: on })} onClick={() => setPrefs({ search: '', filters: {} })} data-clear-filters>{t('Clear')} {on}</button>}
                {/* an icon, not a word (owner 2026-11-24: "so it will be clear that we are configuring") */}
                <button ref={colsButton} type="button" className={`grid size-6 place-items-center rounded text-slate-500 hover:text-slate-900 dark:hover:text-white ${showCols ? 'bg-slate-200 dark:bg-slate-700' : ''}`} title={t('Columns: choose what the table shows')} aria-label={t('Columns: choose what the table shows')} onClick={() => setShowCols(true)} aria-haspopup="dialog" data-columns-button><SlidersIcon /></button>
              </span>
            ) }} />
        </table>
        </div>
      <div ref={box} className="min-h-0 flex-1 overflow-auto [scrollbar-gutter:stable]" data-rows={lines.length} data-drawn={last - first}>
        <table className="pos-table border-separate border-spacing-0 text-sm" style={{ tableLayout: 'fixed', width: tableWidth, minWidth: '100%' }}>
          <colgroup><col style={{ width: SYMBOL_W }} />{cols.map((c) => <col key={c.key} style={{ width: width(c.key) }} />)}</colgroup>
          <tbody>
            {first > 0 && <tr aria-hidden="true" className="pos-spacer" style={{ height: first * ROW }}><td colSpan={cols.length + 1} /></tr>}
            {lines.slice(first, last).map((l) => <tr key={l.key} className={l.cls} style={{ height: ROW }}>{l.cells()}</tr>)}
            {last < lines.length && <tr aria-hidden="true" className="pos-spacer" style={{ height: (lines.length - last) * ROW }}><td colSpan={cols.length + 1} /></tr>}
          </tbody>
        </table>
      </div>
      </div>
    </div>
  );
}
