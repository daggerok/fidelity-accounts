/// <reference lib="esnext" />
// What every Positions column shows as text and the exact number behind it: the input of the type detection, the typed
// sort and the column filters (src/shared/typed-columns.ts). The table draws its cells itself (colours, the range bar);
// a column with no entry here reads its own field of the position, so a new column sorts and filters with no extra code
import type { Position } from '../../shared/model';
import { parseCellValue } from '../../shared/filter-engine';
import { columnTypes, sortRows, type ColumnType, type TypedColumn } from '../../shared/typed-columns';
import { DASH, bigNum, bigUsd, pct, qty, signedPct, signedQty, signedUsd, signedUsdPct, siteDate, usd } from '../ui/format';
import { dripGap, rangePos } from './derive';

type Cell = Omit<TypedColumn<Position>, 'key'>;

/**
 * Every other column of Fidelity's own positions view (owner 2026-11-24: "I see that we have not all columns as we have in
 * Fidelity, cant you add them all?"): the grid row already carries their values (Position.fields), so each is one field
 * shown in one format. They come hidden at first (NEW_COLUMN_KEYS), the columns window turns them on. Percents are in
 * percent units as Fidelity gives them; a flag shows as ✓ or nothing
 */
export type FieldFormat = 'usd' | 'signedUsd' | 'pct' | 'signedPct' | 'num' | 'int' | 'big' | 'date' | 'text' | 'flag' | 'stars';
export type FieldGroup = 'acct' | 'quote' | 'div' | 'fund' | 'perf' | 'other';
// `since`: the columns list version that added it (prefs COLUMNS_V): a choice saved before that version gets it hidden once
export interface FieldColumn { key: string; field: string; format: FieldFormat; group: FieldGroup; sortBy?: string; width?: number; since?: number }
export const FIELD_COLUMNS: FieldColumn[] = [
  { key: 'avgCost', field: 'cstBasShr', format: 'usd', group: 'acct' },
  { key: 'acctType', field: 'meta_acctType', format: 'text', group: 'acct', width: 140 },
  { key: 'costMethod', field: 'meta_cstbasType', format: 'text', group: 'acct', width: 140 },
  { key: 'hardToBorrow', field: 'isHTB', format: 'flag', group: 'acct' },
  { key: 'lastChange', field: 'lstPrChg', format: 'signedUsd', group: 'quote' },
  { key: 'lastChangePct', field: 'lstPrChgPct', format: 'signedPct', group: 'quote' },
  { key: 'open', field: 'openPrice', format: 'usd', group: 'quote' },
  { key: 'prevClose', field: 'lstPrcPrevCls', format: 'usd', group: 'quote' },
  { key: 'bid', field: 'bidPrice', format: 'usd', group: 'quote' },
  { key: 'bidSize', field: 'bidSize', format: 'int', group: 'quote' },
  { key: 'ask', field: 'askPrice', format: 'usd', group: 'quote' },
  { key: 'askSize', field: 'askSize', format: 'int', group: 'quote' },
  { key: 'volume', field: 'volume', format: 'int', group: 'quote' },
  { key: 'avgVolume10', field: 'avgVol10Day', format: 'big', group: 'quote' },
  { key: 'avgVolume90', field: 'avgVol90Day', format: 'big', group: 'quote' },
  { key: 'high52Price', field: 'fifTwo_high', format: 'usd', group: 'quote' },
  { key: 'low52Price', field: 'fifTwo_low', format: 'usd', group: 'quote' },
  { key: 'high52Date', field: 'yearHighDate', format: 'date', group: 'quote' },
  { key: 'low52Date', field: 'yearLowDate', format: 'date', group: 'quote' },
  { key: 'volatility30', field: 'volatility30Day', format: 'pct', group: 'quote' },
  { key: 'volatility250', field: 'volatility250Day', format: 'pct', group: 'quote' },
  { key: 'dividendAmount', field: 'dvAmt', format: 'usd', group: 'div' },
  { key: 'peRatio', field: 'peRatio', format: 'num', group: 'fund' },
  { key: 'shortPct', field: 'pctFloat', format: 'pct', group: 'fund' },
  { key: 'shortInterest', field: 'shortInterest', format: 'big', group: 'fund' },
  { key: 'shortRatio', field: 'shortInterestRatio', format: 'num', group: 'fund' },
  { key: 'sharesOut', field: 'sharesOutstanding', format: 'big', group: 'fund' },
  { key: 'earningsDate', field: 'earningsAnnouncementDate', format: 'date', group: 'fund' },
  { key: 'analystRating', field: 'equitySummaryRating', format: 'text', group: 'fund', sortBy: 'equitySummaryScore', width: 140 },
  { key: 'industry', field: 'industry', format: 'text', group: 'fund', width: 160 },
  { key: 'subIndustry', field: 'subIndustry', format: 'text', group: 'fund', width: 180 },
  { key: 'morningstar', field: 'mstar_rate', format: 'stars', group: 'fund' },
  { key: 'morningstarCategory', field: 'mngCtg', format: 'text', group: 'fund', width: 180 },
  { key: 'expenseGross', field: 'exRtGs', format: 'pct', group: 'fund' },
  { key: 'expenseNet', field: 'exRtNt', format: 'pct', group: 'fund' },
  { key: 'returnYtd', field: 'ytdDly', format: 'signedPct', group: 'perf' },
  { key: 'return1y', field: 'oneYr', format: 'signedPct', group: 'perf' },
  { key: 'return3y', field: 'thrYr', format: 'signedPct', group: 'perf' },
  { key: 'return5y', field: 'fivYr', format: 'signedPct', group: 'perf' },
  { key: 'return10y', field: 'tenYr', format: 'signedPct', group: 'perf' },
  { key: 'cusip', field: 'sym_cusip', format: 'text', group: 'other' },
  { key: 'securityType', field: 'meta_securityType', format: 'text', group: 'other', width: 140 },
  { key: 'optionable', field: 'isOptionable', format: 'flag', group: 'other' },
  { key: 'currency', field: 'currency', format: 'text', group: 'other' },
  // version 3 (owner 2026-11-25: "it also has some other stuff we can add")
  { key: 'distRateDate', field: 'distYldDate', format: 'date', group: 'div', since: 3 },
  { key: 'secYieldDate', field: 'secYldDate', format: 'date', group: 'div', since: 3 },
  { key: 'volatility10', field: 'volatility10Day', format: 'pct', group: 'quote', since: 3 },
  { key: 'volatility60', field: 'volatility60Day', format: 'pct', group: 'quote', since: 3 },
  { key: 'volatility90', field: 'volatility90Day', format: 'pct', group: 'quote', since: 3 },
  { key: 'volatility120', field: 'volatility120Day', format: 'pct', group: 'quote', since: 3 },
  { key: 'prevShortInterest', field: 'prevShortInterest', format: 'big', group: 'fund', since: 3 },
  { key: 'industryGroup', field: 'industryGroup', format: 'text', group: 'fund', width: 160, since: 3 },
  { key: 'news', field: 'headlineTime_text', format: 'text', group: 'other', sortBy: 'headlineTime', since: 3 },
  { key: 'holdingType', field: 'meta_holdingType', format: 'text', group: 'other', since: 3 },
  { key: 'loaned', field: 'isLoaned', format: 'flag', group: 'other', since: 3 },
];

/** the columns added after the owner's own view, by the version that added them: hidden until turned on */
export const NEW_COLUMNS_BY_V: Record<number, string[]> = {
  2: ['todayGlBoth', 'totalGlBoth', 'dayRange'].concat(FIELD_COLUMNS.filter((c) => !c.since || c.since === 2).map((c) => c.key)),
  3: FIELD_COLUMNS.filter((c) => c.since === 3).map((c) => c.key),
};
export const NEW_COLUMN_KEYS: string[] = Object.keys(NEW_COLUMNS_BY_V).map(Number).sort((a, b) => a - b).reduce<string[]>((all, v) => all.concat(NEW_COLUMNS_BY_V[v]!), []);

const num0 = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
/** the number behind a field column (its own field, or the one it sorts by) */
export const fieldValue = (p: Position, c: FieldColumn): number | undefined => num0(p.fields[c.sortBy ?? c.field]);
/** a field column's cell as shown */
export function fieldText(p: Position, c: FieldColumn): string {
  const v = p.fields[c.field];
  if (v === undefined || v === null || v === '') return '';
  const n = num0(v);
  switch (c.format) {
    case 'usd': return n === undefined ? '' : usd(n);
    case 'signedUsd': return n === undefined ? '' : signedUsd(n);
    case 'pct': return n === undefined ? '' : pct(n);
    case 'signedPct': return n === undefined ? '' : signedPct(n);
    case 'num': return n === undefined ? '' : n.toFixed(2);
    case 'int': return n === undefined ? '' : Math.round(n).toLocaleString('en-US');
    case 'big': return n === undefined ? '' : bigNum(n);
    case 'date': return siteDate(String(v)) === DASH ? String(v) : siteDate(String(v));
    case 'flag': return v === true ? '✓' : '';
    case 'stars': return n === undefined ? '' : '★'.repeat(Math.max(0, Math.min(5, Math.round(n))));
    default: return String(v);
  }
}

/** a number shown through one of the formats ($, %, shares) */
const num = (f: (p: Position) => number | undefined, text: (n: number | undefined) => string): Cell => ({ text: (p) => text(f(p)), value: f });

/** "Large cap ($234.93B)" -> "$234.93B": the money inside Fidelity's market cap words */
const capMoney = (text: string | undefined): string => /\$\s*[\d,.]+\s*[KMBT]?/i.exec(text ?? '')?.[0].replace(/\s/g, '') ?? '';
const inRange = (p: Position): number | undefined => { const r = rangePos(p); return r === null ? undefined : r * 100; };

const CELLS: Record<string, Cell> = {
  // the ticker first, so the order is by ticker; the name is in it for the search (owner 2026-11-24: symbol or name)
  symbol: { text: (p) => `${p.symbol} ${p.description}`.trim() },
  drip: num((p) => dripGap(p)?.shares, signedQty),
  dripUsd: num((p) => dripGap(p)?.usd, signedUsd),
  todayGlPct: num((p) => p.todayGlPct, signedPct),
  todayGl: num((p) => p.todayGl, signedUsd),
  totalGlPct: num((p) => p.totalGlPct, signedPct),
  totalGl: num((p) => p.totalGl, signedUsd),
  costBasisTotal: num((p) => p.costBasisTotal, usd),
  currentValue: num((p) => p.currentValue, usd),
  quantity: num((p) => p.quantity, qty),
  lastPrice: num((p) => p.lastPrice, usd),
  percentOfAccount: num((p) => p.percentOfAccount, pct),
  distRate: num((p) => p.distRate, pct),
  secYield: num((p) => p.secYield, pct),
  estAnnualIncome: num((p) => p.estAnnualIncome, usd),
  paymentFrequency: { text: (p) => p.paymentFrequency ?? '' },
  // money, also when Fidelity gave only its words ("Large cap ($234.93B)"): the number in them counts
  marketCap: { text: (p) => (p.marketCap !== undefined ? bigUsd(p.marketCap) : capMoney(p.marketCapText)), value: (p) => p.marketCap ?? parseCellValue(capMoney(p.marketCapText), 'currency') },
  // the 52-week range is where the last price sits in it, 0% = at the low, 100% = at the high
  high52: num(inRange, pct),
  exDate: { text: (p) => siteDate(p.exDate) },
  payDate: { text: (p) => siteDate(p.payDate) },
  sector: { text: (p) => p.sector ?? '' },
  // the ($ and %) pairs of Fidelity, sorted by the dollars
  todayGlBoth: { text: (p) => (p.todayGl === undefined ? '' : signedUsdPct(p.todayGl, p.todayGlPct)), value: (p) => p.todayGl },
  totalGlBoth: { text: (p) => (p.totalGl === undefined ? '' : signedUsdPct(p.totalGl, p.totalGlPct)), value: (p) => p.totalGl },
  dayRange: { text: (p) => { const lo = num0(p.fields.dayRange_low); const hi = num0(p.fields.dayRange_high); return lo === undefined || hi === undefined ? '' : `${usd(lo)} - ${usd(hi)}`; }, value: (p) => num0(p.fields.dayRange_low) },
};
FIELD_COLUMNS.forEach((c) => { CELLS[c.key] = { text: (p) => fieldText(p, c), value: (p) => fieldValue(p, c) }; });

const fieldOf = (p: Position, key: string): string | number | boolean | undefined => (p as unknown as Record<string, string | number | undefined>)[key] ?? p.fields[key];

/** the typed column of a Positions key */
export function positionColumn(key: string): TypedColumn<Position> {
  const cell = CELLS[key];
  if (cell) return { key, ...cell };
  return { key, text: (p) => { const v = fieldOf(p, key); return v === undefined || v === DASH ? '' : String(v); }, value: (p) => { const v = fieldOf(p, key); return typeof v === 'number' ? v : undefined; } };
}

/** the positions in the order of one column, by its detected type unless `type` says otherwise; empty cells last */
export function sortPositions(ps: Position[], key: string, dir: 1 | -1, type?: ColumnType): Position[] {
  const col = positionColumn(key);
  return sortRows(ps, col, type ?? columnTypes([col], ps).types[key]!, dir);
}
