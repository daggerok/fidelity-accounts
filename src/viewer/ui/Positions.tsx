/// <reference lib="esnext" />
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { SlidersIcon } from './icons';
import type { Account, Dataset, Position } from '../../shared/model';
import { dripMin, dripMinAdj, dripMinAdjUsd, positionsIn, rangePos, rowDrip, rowDripAdj, rowDripAdjUsd, securities, totalsOf } from '../app/derive';
import { FIELD_COLUMNS, fieldText, fieldValue, positionColumn, type FieldGroup } from '../app/position-columns';
import { mergeOn, mergePositions, type MergeKind } from '../app/merge';
import { activeFilters, columnTypes, nextSort, rowTest, sortRows, withFilter, withType } from '../../shared/typed-columns';
import { NoMatch, TypedHead, type HeadColumn, type TableControl } from './TypedHead';
import { lang, t } from '../app/i18n';
import { DEFAULT_PREFS, prefs, setPrefs } from '../app/prefs';
import { useStore } from './useStore';
import { PHONE_QUERY, useMedia } from './useMedia';
import { useFill } from './useFill';
import { PHONE_EDGE, PHONE_SYMBOL_W, phoneColumnWidth } from '../app/fit';
import { RangeBar } from './RangeBar';
import { Zoom } from './Zoom';
import { CellScroll } from './CellScroll';
import { DRIP_ADJ_HINT, DRIP_ADJ_USD_HINT, DRIP_HINT, DRIP_MIN_ADJ_HINT, DRIP_MIN_ADJ_USD_HINT, DRIP_MIN_HINT, DRIP_MIN_USD_HINT, DRIP_USD_HINT, DripValue } from './Drip';
import { ColumnPicker } from './ColumnPicker';
import { shownKeys } from '../app/columns';
import { rowWindow, sameWindow } from '../app/row-window';
import { squashAsk } from '../app/squash';
import { DASH, bigUsd, maskAccount, pct, qty, signedPct, signedUsd, signedUsdPct, siteDate, tone, usd } from './format';

// Positions: the columns of Fidelity's "My View", sortable, one block per account with its cash and its total, and a
// grand total when several accounts are shown (merged: one line per ticker over them, app/merge.ts). Our own columns come first (owner 2026-11-24: DRIP and DRIP $), then
// Fidelity's. Columns are chosen in a window like the ⤢ of the cards and remembered. Every column has a detected type,
// sorts by it and has a filter under its name (owner 2026-11-24; TypedHead, what a column reads: app/position-columns.ts)
// `merge`: how the column joins a ticker's rows of several accounts when merge is on (app/merge.ts), chosen with the column
interface Col { key: string; label: string; group: string; merge: MergeKind; hint?: string; cell: (p: Position) => React.ReactNode; total?: (ps: Position[], a: Account[]) => React.ReactNode }

const sum = (ps: Position[], f: (p: Position) => number | undefined) => ps.reduce((s, p) => s + (f(p) ?? 0), 0);
const glCell = (v: number | undefined, text: string) => <span className={tone(v)}>{text}</span>;

function Range({ p }: { p: Position }) {
  const r = rangePos(p);
  if (r === null) return <>{DASH}</>;
  return (
    <span className="inline-flex flex-col items-stretch gap-0.5 align-middle" style={{ width: '7rem' }} title={`${usd(p.low52)} - ${usd(p.high52)}`}>
      <RangeBar pos={r} shape="diamond" />
      <span className="flex justify-between text-[10px] text-slate-500 dark:text-slate-400"><span>{usd(p.low52)}</span><span>{usd(p.high52)}</span></span>
    </span>
  );
}

const dripOf = (p: Position, f: (d: { shares: number; usd: number }) => React.ReactNode, of = rowDrip) => { const d = of(p); return d ? f(d) : DASH; };

// the groups of the columns window, in Fidelity's words where it has them; the column names are short (owner 2026-11-25:
// Today's gain/loss -> Today's, Total gain/loss -> Total, Est. annual income -> Est. income, Payment frequency -> Frequency;
// then "in both i18n", the same way: words the column does not need go, Fidelity's full name stays as the hint)
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
const FIELD_LABEL = (): Record<string, [string, string]> => ({
  avgCost: [t('Average cost'), t('Average cost basis')], acctType: [t('Account type'), t('Account type')], costMethod: [t('Cost method'), t('Cost basis method')],
  hardToBorrow: [t('Hard to borrow'), t('Hard to borrow')], lastChange: [t('Change $'), t('Last price change')], lastChangePct: [t('Change %'), t('Last price change %')],
  open: [t('Open'), t('Open')], prevClose: [t('Previous close'), t('Previous close')], bid: [t('Bid'), t('Bid')], bidSize: [t('Bid size'), t('Bid size')],
  ask: [t('Ask'), t('Ask')], askSize: [t('Ask size'), t('Ask size')], volume: [t('Volume'), t('Volume')],
  avgVolume10: [t('10-day volume'), t('Avg. volume (10 day)')], avgVolume90: [t('90-day volume'), t('Avg. volume (90 day)')],
  high52Price: [t('52-week high'), t('52-week high')], low52Price: [t('52-week low'), t('52-week low')], high52Date: [t('High date'), t('52-week high date')], low52Date: [t('Low date'), t('52-week low date')],
  volatility30: [t('Volatility 30D'), t('Volatility (30 day)')], volatility250: [t('Volatility 1Y'), t('Volatility (1 year)')], dividendAmount: [t('Dividend'), t('Dividend amount')],
  peRatio: [t('P/E'), t('P/E ratio')], shortPct: [t('Short %'), t('Short %')], shortInterest: [t('Short interest'), t('Short interest')], shortRatio: [t('Short ratio'), t('Short interest ratio')],
  sharesOut: [t('Outstanding'), t('Shares outstanding')], earningsDate: [t('Earnings'), t('Earnings date')], analystRating: [t('Analysts'), t('Analyst ratings')],
  industry: [t('Industry'), t('Industry')], subIndustry: [t('Sub-industry'), t('Sub-industry')], morningstar: [t('Morningstar'), t('Morningstar rating')], morningstarCategory: [t('Category'), t('Morningstar category')],
  expenseGross: [t('Gross expense'), t('Gross expense ratio')], expenseNet: [t('Net expense'), t('Net expense ratio')],
  returnYtd: [t('YTD'), t('YTD return')], return1y: [t('1-year'), t('1-year return')], return3y: [t('3-year'), t('3-year return')], return5y: [t('5-year'), t('5-year return')], return10y: [t('10-year'), t('10-year return')],
  distRateDate: [t('Dist. date'), t('Dist. rate date')], secYieldDate: [t('SEC date'), t('SEC yield date')],
  volatility10: [t('Volatility 10D'), t('Volatility (10 day)')], volatility60: [t('Volatility 60D'), t('Volatility (60 day)')], volatility90: [t('Volatility 90D'), t('Volatility (90 day)')], volatility120: [t('Volatility 120D'), t('Volatility (120 day)')],
  prevShortInterest: [t('Prior short'), t('Previous short interest')], industryGroup: [t('Industry group'), t('Industry group')],
  news: [t('News'), t('Latest news headline')], holdingType: [t('Holding'), t('Holding type')], loaned: [t('Loaned'), t('Shares on loan')],
  cusip: [t('CUSIP'), t('CUSIP')], securityType: [t('Type'), t('Security type')], optionable: [t('Optionable'), t('Optionable')], currency: [t('Currency'), t('Currency')],
});
const fieldCols = (): Col[] => {
  const label = FIELD_LABEL();
  return FIELD_COLUMNS.map((c) => ({ key: c.key, group: FIELD_GROUP[c.group](), merge: c.merge, label: label[c.key]?.[0] ?? c.key, hint: label[c.key]?.[1], cell: (p: Position) => {
    const text = fieldText(p, c) || DASH;
    // the news column shows how fresh the latest headline is, the headline itself in the tooltip
    if (c.key === 'news') return <span title={typeof p.fields.text === 'string' ? p.fields.text : undefined}>{text}</span>;
    return c.format === 'signedPct' || c.format === 'signedUsd' ? glCell(fieldValue(p, c), text) : text;
  } }));
};
const lowHigh = (p: Position): string => { const lo = p.fields.day_range_low; const hi = p.fields.day_range_high; return typeof lo === 'number' && typeof hi === 'number' ? `${usd(lo)} - ${usd(hi)}` : DASH; };

// The merge kind of each column (owner 2026-11-25, merge): "Today's $ should have sum of all Today's $ for all accounts.
// same for total. cost bases, value, quantity, also should be sum across accounts", "Today's % should be aggregated", "%
// of account should be aggregated, meaning for all 3 accts in total how much % this ticker is weighed", "last price is the
// same", "Dist rate, sec yield are static. est income aggregated. frequency, marketcap, 52-week, ex-date, pay day, sector -
// static"; DRIP and DRIP $: each account's own number added up, "when we have merge, we want to aggregate drips similarly
// like we do for gains". The ($ and %) pairs sum the dollars, their % is worked out as Today's % and Total %
export const COLUMNS = (): Col[] => [
  // DRIP in pairs (owner 2026-11-27): the regular column is the adjusted one, the buy or the threshold as an order Fidelity
  // takes, worth at least $1 (derive.ts adjustedDrip), and has the plain name; right after it its plain calculation,
  // named Non-adj. and off unless turned on. The keys keep their first meaning (drip = the calculation, dripAdj = the
  // order), so saved views stay as they are. A merged line adds up each account's order; Min. DRIP is the threshold,
  // from the last price and the dividend only, so static. What shows by default: app/position-columns.ts DEFAULT_HIDDEN
  { key: 'dripAdj', merge: 'sum', label: 'DRIP', group: OURS(), hint: DRIP_ADJ_HINT(), cell: (p) => { const d = rowDripAdj(p); return d === null ? DASH : <DripValue value={d.shares} as="shares" />; } },
  { key: 'drip', merge: 'sum', label: t('Non-adj. DRIP'), group: OURS(), hint: DRIP_HINT(), cell: (p) => dripOf(p, (d) => <DripValue value={d.shares} as="shares" />) },
  { key: 'dripAdjUsd', merge: 'sum', label: 'DRIP $', group: OURS(), hint: DRIP_ADJ_USD_HINT(), cell: (p) => { const v = rowDripAdjUsd(p); return v === null ? DASH : <DripValue value={v} as="usd" />; } },
  { key: 'dripUsd', merge: 'sum', label: t('Non-adj. DRIP $'), group: OURS(), hint: DRIP_USD_HINT(), cell: (p) => dripOf(p, (d) => <DripValue value={d.usd} as="usd" />) },
  { key: 'dripMinAdj', merge: 'static', label: t('Min. DRIP'), group: OURS(), hint: DRIP_MIN_ADJ_HINT(), cell: (p) => dripOf(p, (d) => <DripValue value={d.shares} as="shares" min />, dripMinAdj) },
  { key: 'dripMin', merge: 'static', label: t('Non-adj. min. DRIP'), group: OURS(), hint: DRIP_MIN_HINT(), cell: (p) => dripOf(p, (d) => <DripValue value={d.shares} as="shares" min />, dripMin) },
  { key: 'dripMinAdjUsd', merge: 'static', label: t('Min. DRIP $'), group: OURS(), hint: DRIP_MIN_ADJ_USD_HINT(), cell: (p) => { const v = dripMinAdjUsd(p); return v === null ? DASH : <DripValue value={v} as="usd" min />; } },
  { key: 'dripMinUsd', merge: 'static', label: t('Non-adj. min. DRIP $'), group: OURS(), hint: DRIP_MIN_USD_HINT(), cell: (p) => dripOf(p, (d) => <DripValue value={d.usd} as="usd" min />, dripMin) },
  { key: 'todayGlPct', merge: 'recomputed', group: GL(), label: t("Today's %"), hint: t("Today's gain/loss %"), cell: (p) => glCell(p.todayGlPct, signedPct(p.todayGlPct)), total: (_ps, a) => { const x = totalsOf(a); return glCell(x.todayGlPct ?? undefined, signedPct(x.todayGlPct)); } },
  { key: 'todayGl', merge: 'sum', group: GL(), label: t("Today's $"), hint: t("Today's gain/loss $"), cell: (p) => glCell(p.todayGl, signedUsd(p.todayGl)), total: (_ps, a) => { const x = totalsOf(a); return glCell(x.todayGl, signedUsd(x.todayGl)); } },
  { key: 'totalGlPct', merge: 'recomputed', group: GL(), label: t('Total %'), hint: t('Total gain/loss %'), cell: (p) => glCell(p.totalGlPct, signedPct(p.totalGlPct)), total: (_ps, a) => { const x = totalsOf(a); return glCell(x.totalGlPct ?? undefined, signedPct(x.totalGlPct)); } },
  { key: 'totalGl', merge: 'sum', group: GL(), label: t('Total $'), hint: t('Total gain/loss $'), cell: (p) => glCell(p.totalGl, signedUsd(p.totalGl)), total: (_ps, a) => { const x = totalsOf(a); return glCell(x.totalGl, signedUsd(x.totalGl)); } },
  { key: 'costBasisTotal', merge: 'sum', group: ACCT(), label: t('Cost basis'), hint: t('Cost basis total'), cell: (p) => usd(p.costBasisTotal) },
  { key: 'currentValue', merge: 'sum', group: ACCT(), label: t('Value'), hint: t('Current value'), cell: (p) => usd(p.currentValue), total: (_ps, a) => usd(totalsOf(a).balance) },
  { key: 'quantity', merge: 'sum', group: ACCT(), label: t('Quantity'), cell: (p) => qty(p.quantity) },
  { key: 'lastPrice', merge: 'static', group: QUOTE(), label: t('Last price'), cell: (p) => usd(p.lastPrice) },
  { key: 'percentOfAccount', merge: 'recomputed', group: ACCT(), label: t('% of account'), cell: (p) => pct(p.percentOfAccount) },
  { key: 'distRate', merge: 'static', group: DIV(), label: t('Dist. rate'), cell: (p) => pct(p.distRate) },
  { key: 'secYield', merge: 'static', group: DIV(), label: t('SEC yield'), cell: (p) => pct(p.secYield) },
  { key: 'estAnnualIncome', merge: 'sum', group: DIV(), label: t('Est. income'), hint: t('Est. annual income'), cell: (p) => usd(p.estAnnualIncome), total: (ps) => usd(sum(ps, (p) => p.estAnnualIncome)) },
  { key: 'paymentFrequency', merge: 'static', group: DIV(), label: t('Frequency'), hint: t('Payment frequency'), cell: (p) => p.paymentFrequency ?? DASH },
  { key: 'marketCap', merge: 'static', group: QUOTE(), label: t('Market cap'), cell: (p) => (p.marketCapText ?? bigUsd(p.marketCap)) },
  { key: 'high52', merge: 'static', group: QUOTE(), label: t('52-week'), hint: t('52-week range'), cell: (p) => <Range p={p} /> },
  { key: 'exDate', merge: 'static', group: DIV(), label: t('Ex-date'), cell: (p) => siteDate(p.exDate) },
  { key: 'payDate', merge: 'static', group: DIV(), label: t('Pay date'), cell: (p) => siteDate(p.payDate) },
  { key: 'sector', merge: 'static', group: QUOTE(), label: t('Sector'), cell: (p) => p.sector ?? DASH },
  // the rest of Fidelity's columns, hidden until turned on (prefs NEW_COLUMN_KEYS)
  { key: 'todayGlBoth', merge: 'sum', group: GL(), label: t("Today's $ & %"), hint: t("Today's gain/loss ($ and %)"), cell: (p) => glCell(p.todayGl, p.todayGl === undefined ? DASH : signedUsdPct(p.todayGl, p.todayGlPct)), total: (_ps, a) => { const x = totalsOf(a); return glCell(x.todayGl, signedUsdPct(x.todayGl, x.todayGlPct)); } },
  { key: 'totalGlBoth', merge: 'sum', group: GL(), label: t('Total $ & %'), hint: t('Total gain/loss ($ and %)'), cell: (p) => glCell(p.totalGl, p.totalGl === undefined ? DASH : signedUsdPct(p.totalGl, p.totalGlPct)), total: (_ps, a) => { const x = totalsOf(a); return glCell(x.totalGl, signedUsdPct(x.totalGl, x.totalGlPct)); } },
  { key: 'dayRange', merge: 'static', group: QUOTE(), label: t("Day's range"), cell: lowHigh },
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
// every column name on one line (owner 2026-11-25: "they all must be one-liners"): a column is at least as wide as its
// name in the header font, plus the cell padding, the type badge and room for the sort arrow, in any language
let ruler: CanvasRenderingContext2D | null | undefined;
const nameWidth = (text: string): number => {
  if (ruler === undefined) ruler = typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d');
  if (!ruler) return text.length * 7;
  ruler.font = '600 12px Inter, ui-sans-serif, system-ui, sans-serif';
  return ruler.measureText(text).width;
};
const HEAD_ROOM = 16 + 4 + 32 + 14; // padding, gap, badge, arrow
// `phone` is the width of a plain column on a phone (app/fit.ts phoneColumnWidth), 0 elsewhere: there the names wrap
// and the type badges are hidden (index.css .pos-table.compact), so a column needs no room for them; a wide one keeps
// its share
const width = (c: { key: string; label: string }, phone = 0): number => (phone
  ? (WIDE[c.key] ? Math.round(WIDE[c.key]! * 0.62) : phone)
  : Math.max(WIDE[c.key] ?? 128, Math.ceil(nameWidth(c.label) + HEAD_ROOM)));
const SYMBOL = 'symbol';
// the first and the last cell sit one card padding (24 px) from the box edge, like the logo, Summary and the card titles
// (owner 2026-11-25: "we need to fix spacing here as well"); a cell has 8 px of its own, the edge columns get the rest
const EDGE = 16;
const colWidth = (cols: { key: string; label: string }[], i: number, phone = 0): number => width(cols[i]!, phone) + (i === cols.length - 1 ? (phone ? PHONE_EDGE : EDGE) : 0);
const symbolWidth = (phone: number): number => (phone ? PHONE_SYMBOL_W + PHONE_EDGE : SYMBOL_W + EDGE);
/** the column widths both tables share: Symbol, then every chosen column (memo: the widths measure the names in a canvas) */
const Cols = memo(function Cols({ cols, phone }: { cols: { key: string; label: string }[]; phone: number }) {
  return <colgroup><col style={{ width: symbolWidth(phone) }} />{cols.map((c, i) => <col key={c.key} style={{ width: colWidth(cols, i, phone) }} />)}</colgroup>;
});

// The header table, a child of its own so a scroll of the rows does not draw it again: its props stay the same until the
// columns (new with the language too), the sort, the filters or the counts change
const PositionsHead = memo(function PositionsHead({ cols, control, tableWidth, phone, shown, total, on, showCols, colsButton, onCols }: { cols: Col[]; control: TableControl; tableWidth: number; phone: number; shown: number; total: number; on: number; showCols: boolean; colsButton: React.RefObject<HTMLButtonElement | null>; onCols: (open: boolean) => void }) {
  const head: HeadColumn[] = [{ key: SYMBOL, label: t('Symbol'), wrap: true }];
  cols.forEach((c) => head.push({ key: c.key, label: c.label, hint: c.hint }));
  return (
    <table className={`pos-table border-separate border-spacing-0 text-sm ${phone ? 'compact' : ''}`} style={{ tableLayout: 'fixed', width: tableWidth, minWidth: '100%' }}>
      <Cols cols={cols} phone={phone} />
      {/* the Symbol filter is the search by symbol or name (owner 2026-11-24), the number of positions sits inside it on
          the right and follows the filters; the columns icon stands before the Symbol name (Clear Filters floats above the
          table, it belongs to every column) */}
      <TypedHead control={control}
        cols={head}
        inputs={{ [SYMBOL]: { placeholder: t('Symbol'), note: on ? `${shown}/${total}` : String(total), noteTitle: on ? t('{n} of {total} positions', { n: shown, total }) : t('{n} positions', { n: total }) } }}
        extras={{ [SYMBOL]: (
          <span className="-ml-1 flex flex-none items-center">
            {/* an icon, not a word (owner 2026-11-24: "so it will be clear that we are configuring"), at the left, right
                before the word Symbol (owner 2026-11-25: floating between the name and the badge "looks ugly"; the word stays,
                it is what sorts by symbol: a bare sort mark in its place "looks ugly" too). As tall as a type badge (18 px),
                so the icon, the name and the badge stand on one line: a 24 px box lifted the icon above them */}
            <button ref={colsButton} type="button" className={`hit grid h-[18px] w-6 place-items-center rounded text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white ${showCols ? 'bg-slate-200 dark:bg-slate-700' : ''}`} title={t('Columns: choose what the table shows')} aria-label={t('Columns: choose what the table shows')} onClick={() => onCols(true)} aria-haspopup="dialog" data-columns-button><SlidersIcon /></button>
          </span>
        ) }} />
    </table>
  );
});

interface Line { key: string; cls: string; cells: () => React.ReactNode }

// Memoised with stable props from App (the accounts under useMemo), so App drawing again on a status message of the script
// does not draw the table again
// `onAsk`: what a scroll of the rows asks of the page on a phone (app/squash.ts); `layout` changes when the page around
// the table changed its height, so the table measures its room again
export const Positions = memo(function Positions({ ds, accounts, onAsk, layout }: { ds: Dataset; accounts: Account[]; onAsk?: (ask: 'squash' | 'open') => void; layout?: unknown }) {
  const pr = useStore(prefs);
  // the column names are words: built again on a switch of the language only, not on every draw (~93 columns, ~250 t())
  const language = useStore(lang);
  const [showCols, setShowCols] = useState(false);
  const colsButton = useRef<HTMLButtonElement>(null);
  const every = useMemo(() => COLUMNS(), [language]);
  const cols = useMemo(() => {
    const byKey = new Map(every.map((c) => [c.key, c]));
    return shownKeys(every.map((c) => c.key), pr.columns, pr.hidden).map((k) => byKey.get(k)!);
  }, [every, pr.columns, pr.hidden]);
  const colKeys = cols.map((c) => c.key).join(',');
  const all = useMemo(() => positionsIn(ds, accounts), [ds, accounts]);
  const several = accounts.length > 1;
  // merge (owner 2026-11-25): with several accounts shown and the switch next to the Positions tab on, one line per
  // ticker; everything below (types, filters, sort, the count, the row window) works on these lines
  const merging = mergeOn(pr.merge, accounts.length);
  const rows = useMemo((): Position[] => (merging ? mergePositions(all, accounts) : all), [all, accounts, merging]);
  // the Symbol column and every column of the table, also the hidden ones: a filter keeps working when its column is
  // switched off, as in the investments apps (Clear filters and its number tell that one is on)
  const typed = useMemo(() => [SYMBOL].concat(every.map((c) => c.key)).map(positionColumn), [every.length]);
  // types come from all the securities shown, before any filter, so a filter never changes the type of its own column
  const { types, detected } = useMemo(() => columnTypes(typed, securities(rows), pr.types), [typed, rows, pr.types]);
  const filters = useMemo(() => withFilter(pr.filters, SYMBOL, pr.search), [pr.filters, pr.search]);
  const filtered = activeFilters(filters) > 0;
  // the securities that pass the filters, in the chosen order: filtered and sorted once, then cut by account
  const shown = useMemo(() => {
    const test = rowTest(typed, types, filters);
    const kept = test ? securities(rows).filter(test) : securities(rows);
    return sortRows(kept, positionColumn(pr.sort.key), types[pr.sort.key] ?? columnTypes([positionColumn(pr.sort.key)], kept).types[pr.sort.key]!, pr.sort.dir);
  }, [rows, typed, types, filters, pr.sort.key, pr.sort.dir]);
  const control = useMemo((): TableControl => ({
    sort: pr.sort, filters, types, detected,
    onSort: (key) => setPrefs({ sort: nextSort(pr.sort, key, types[key] ?? 'string') }),
    onFilter: (key, value) => setPrefs(key === SYMBOL ? { search: value } : { filters: withFilter(prefs.get().filters, key, value) }),
    onType: (key, reset) => setPrefs({ types: withType(prefs.get().types, key, types[key] ?? 'string', detected[key] ?? 'string', reset) }),
  }), [pr.sort, filters, types, detected]);

  const lines = useMemo(() => {
    const out: Line[] = [];
    // the cash, security and pending rows of one block: an account's, or the merged lines of all of them (`at` keys them)
    // while a filter is on only the rows it found are shown (owner 2026-11-27: "here we should not see cash", "we also
    // should not see cash and grand total"): the cash, the pending line and the totals describe the whole account, not
    // the rows found, so they wait until the filters are cleared
    const block = (at: string, own: Position[], secs: Position[]) => {
      if (!filtered) own.filter((p) => p.kind === 'core').forEach((p) => out.push({ key: `${at}-c-${p.symbol}`, cls: 'cash-row', cells: () => <>
        {/* a cash line reads like any position (owner 2026-11-25: "SPAXX" on top, "CASH HELD IN MONEY MARKET" under it): the
            ticker in bold, then the word Cash with Fidelity's description; cash with no ticker keeps the word on top */}
        <td><div className="font-semibold">{p.symbol || t('Cash')}</div><CellScroll className="text-xs uppercase text-slate-500 dark:text-slate-400">{p.symbol ? `${t('Cash')} ${p.description}`.trim() : p.description}</CellScroll></td>
        {cols.map((c) => <td key={c.key}>{c.key === 'currentValue' ? usd(p.currentValue) : c.key === 'secYield' || c.key === 'distRate' ? c.cell(p) : ''}</td>)}
      </> }));
      secs.forEach((p) => out.push({ key: `${at}-${p.symbol}`, cls: '', cells: () => <>
        <td><div className="font-semibold">{p.symbol}</div><CellScroll className="text-xs text-slate-500 dark:text-slate-400">{p.description}</CellScroll></td>
        {cols.map((c) => <td key={c.key}>{c.cell(p)}</td>)}
      </> }));
      if (!filtered) own.filter((p) => p.kind === 'pending').forEach((p) => out.push({ key: `${at}-p`, cls: '', cells: () => <><td>{t('Pending activity')}</td>{cols.map((c) => <td key={c.key}>{c.key === 'currentValue' ? signedUsd(p.currentValue) : ''}</td>)}</> }));
    };
    // merged: no account headers and no account totals, the cash on top as in an account's block; nothing when the
    // filters leave no row, like an account
    if (merging) { if (!filtered || shown.length) block('merged', rows, shown); } else accounts.forEach((a) => {
      const own = all.filter((p) => p.account === a.number);
      const secs = shown.filter((p) => p.account === a.number);
      // an account with no row left by the filters is not shown
      if (filtered && !secs.length) return;
      out.push({ key: `${a.number}-h`, cls: 'acct-row', cells: () => <td colSpan={cols.length + 1}>{/* the name stays in view while the row scrolls sideways */}<span className="acct-name"><span className="font-semibold">{a.name}</span> <span className="text-xs text-slate-600 dark:text-slate-400" title={a.number}>{maskAccount(a.number)}</span></span></td> });
      block(a.number, own, secs);
      if (!filtered) out.push({ key: `${a.number}-t`, cls: 'total-row', cells: () => <><td>{t('Account total')}</td>{cols.map((c) => <td key={c.key}>{c.total ? c.total(own, [a]) : ''}</td>)}</> });
    });
    if (filtered && !shown.length) out.push({ key: 'none', cls: '', cells: () => <NoMatch span={cols.length + 1} /> });
    if (several && !filtered) out.push({ key: 'grand', cls: 'total-row', cells: () => <><td>{t('Grand total')}</td>{cols.map((c) => <td key={c.key}>{c.total ? c.total(rows, accounts) : ''}</td>)}</> });
    return out;
    // cols follow colKeys; the rest are the inputs of the rows (no lint in this repo)
  }, [all, rows, shown, accounts, filtered, colKeys, several, merging]);

  const box = useRef<HTMLDivElement>(null);
  const headBox = useRef<HTMLDivElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const asks = useRef(onAsk);
  asks.current = onAsk;
  // the window of rows drawn, kept as the first and the end index: a scroll inside one row keeps the same window and the
  // same state, so React skips the draw (a new { top, height } every frame drew the whole table on every frame)
  const [win, setWin] = useState(() => rowWindow(0, 800, ROW, OVERSCAN));
  useEffect(() => {
    const el = box.current;
    if (!el) return undefined;
    let frame = 0;
    let before = el.scrollTop;
    const on = () => {
      const ask = squashAsk(el.scrollTop, before);
      before = el.scrollTop;
      if (ask) asks.current?.(ask);
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => { const next = rowWindow(el.scrollTop, el.clientHeight, ROW, OVERSCAN); setWin((w) => (sameWindow(w, next) ? w : next)); });
    };
    on();
    el.addEventListener('scroll', on, { passive: true });
    const ro = new ResizeObserver(on);
    ro.observe(el);
    // the header is its own table above the scrolling rows (owner 2026-11-24: the scrollbar starts at the first row, not
    // beside the header): it follows the rows sideways; a sideways swipe or a focused filter on the header moves the rows
    // Only the box the user drives passes its scroll on (the last one touched, pressed or focused; the rows by default), so
    // the copy made on the other box never comes back: a rounded or clamped scrollLeft echoed back used to fight a swipe
    // and could stop the rows' momentum on a phone. The wheel over the header still moves the rows, which drive it
    const head = headBox.current;
    let driver: HTMLElement = el;
    // `sent`: what the header last gave the rows. A scroll of the rows that is not that copy coming back is the user's own
    // (a drag of the rows' scrollbar gives no press event to go by in every browser), so the rows take over again
    let sent = -1;
    const follow = () => {
      if (!head) return;
      if (driver === head && Math.abs(el.scrollLeft - sent) > 1) driver = el;
      if (driver === el && head.scrollLeft !== el.scrollLeft) head.scrollLeft = el.scrollLeft;
    };
    const lead = () => { if (head && driver === head && el.scrollLeft !== head.scrollLeft) { sent = head.scrollLeft; el.scrollLeft = sent; } };
    const wheel = (e: WheelEvent) => { if (!head || !e.deltaX) return; driver = el; el.scrollLeft += e.deltaX; e.preventDefault(); };
    const takeRows = () => { driver = el; };
    const takeHead = () => { if (head) driver = head; };
    const DRIVE = ['pointerdown', 'touchstart', 'focusin', 'wheel'] as const;
    DRIVE.forEach((type) => el.addEventListener(type, takeRows, { passive: true }));
    DRIVE.forEach((type) => { if (type !== 'wheel') head?.addEventListener(type, takeHead, { passive: true }); });
    el.addEventListener('scroll', follow, { passive: true });
    head?.addEventListener('scroll', lead, { passive: true });
    head?.addEventListener('wheel', wheel, { passive: false });
    return () => {
      cancelAnimationFrame(frame); el.removeEventListener('scroll', on); el.removeEventListener('scroll', follow); head?.removeEventListener('scroll', lead); head?.removeEventListener('wheel', wheel); ro.disconnect();
      DRIVE.forEach((type) => { el.removeEventListener(type, takeRows); head?.removeEventListener(type, takeHead); });
    };
  }, []);
  // the table reaches down to the footer and knows its own width (ui/useFill.ts)
  const { fill, width: boxWidth } = useFill(wrap, layout);
  // a phone gets the compact table: a narrow Symbol column and four columns across the box (app/fit.ts)
  const isPhone = useMedia(PHONE_QUERY);
  const phone = isPhone ? phoneColumnWidth(boxWidth || 340) : 0;
  const first = win.first;
  const last = Math.min(lines.length, win.end);
  const total = useMemo(() => securities(rows).length, [rows]);
  const on = activeFilters(filters);
  const tableWidth = useMemo(() => symbolWidth(phone) + cols.reduce((sum, _c, i) => sum + colWidth(cols, i, phone), 0), [cols, phone]);

  return (
    <div className="relative flex min-h-0 flex-col gap-3" data-positions>
      {/* Clear Filters belongs to every column, not to Symbol, and it must not move the page when it comes or goes (owner
          2026-11-25: "button clear filters should not make our panels jump, it must be on top, like in between two panels
          ... when we click it should not change structure of our page"): it floats in the middle of the gutter between
          the tabs panel and the table (16 px, 24 px on a big screen: main's top padding), taking no room; the filters of
          hidden columns count too */}
      {on > 0 && (
        <button type="button" className="hit absolute left-1/2 top-0 z-10 -translate-x-1/2 -translate-y-[calc(50%+0.5rem)] rounded-md border border-[var(--brand-ring)] bg-white px-2 text-xs font-medium leading-5 text-[var(--brand-strong)] hover:bg-[var(--brand-soft)] dark:bg-slate-900 lg:-translate-y-[calc(50%+0.75rem)]"
          title={t('Clear all {n} filters', { n: on })} onClick={() => setPrefs({ search: '', filters: {} })} data-clear-filters>{t('Clear Filters')}</button>
      )}
      <Zoom open={showCols} title={t('Columns')} origin={colsButton} narrow onClose={() => setShowCols(false)}>
        <ColumnPicker cols={every} order={pr.columns} hidden={pr.hidden} defaultHidden={DEFAULT_PREFS.hidden} onChange={setPrefs} />
      </Zoom>
      {/* one rounded box: the header table on top, the rows below it in their own scroll box, so the vertical scrollbar
          runs beside the rows only; both tables share the column widths, and both keep a scrollbar gutter so they line up */}
      <div ref={wrap} className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700" style={{ height: fill ?? '70vh' }} data-positions-box>
        {/* head-scroll: clipped with a mouse, a sideways swipe scrolls it on a touch screen (index.css) */}
        <div ref={headBox} className="head-scroll flex-none bg-white [scrollbar-gutter:stable] dark:bg-[#0f172a]" data-positions-head>
          <PositionsHead cols={cols} control={control} tableWidth={tableWidth} phone={phone} shown={shown.length} total={total} on={on} showCols={showCols} colsButton={colsButton} onCols={setShowCols} />
        </div>
      <div ref={box} className="min-h-0 flex-1 overflow-auto [scrollbar-gutter:stable]" data-rows={lines.length} data-drawn={last - first}>
        <table className={`pos-table border-separate border-spacing-0 text-sm ${phone ? 'compact' : ''}`} style={{ tableLayout: 'fixed', width: tableWidth, minWidth: '100%' }}>
          <Cols cols={cols} phone={phone} />
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
});
