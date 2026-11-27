/// <reference lib="esnext" />
// What every Positions column shows as text and the exact number behind it: the input of the type detection, the typed
// sort and the column filters (src/shared/typed-columns.ts). The table draws its cells itself (colours, the range bar);
// a column with no entry here reads its own field of the position, so a new column sorts and filters with no extra code
import type { Position } from '../../shared/model';
import { parseCellValue } from '../../shared/filter-engine';
import { columnTypes, sortRows, type ColumnType, type TypedColumn } from '../../shared/typed-columns';
import { DASH, bigNum, bigUsd, pct, qty, signedPct, signedQty, signedUsd, signedUsdPct, siteDate, usd } from '../ui/format';
import { dripMin, dripMinAdjUsd, rangePos, rowDrip, rowDripAdjUsd } from './derive';
import type { MergeKind } from './merge';

type Cell = Omit<TypedColumn<Position>, 'key'>;

/**
 * Every other column of Fidelity's own positions view (owner 2026-11-24: "I see that we have not all columns as we have in
 * Fidelity, cant you add them all?"): the grid row already carries their values (Position.fields), so each is one field
 * shown in one format. They come hidden at first (NEW_COLUMN_KEYS), the columns window turns them on. Percents are in
 * percent units as Fidelity gives them; a flag shows as ✓ or nothing
 */
export type FieldFormat = 'usd' | 'signedUsd' | 'pct' | 'signedPct' | 'num' | 'int' | 'big' | 'date' | 'text' | 'flag' | 'stars';
export type FieldGroup = 'acct' | 'quote' | 'div' | 'fund' | 'perf' | 'other';
// `since`: the columns list version that added it (prefs COLUMNS_V): a choice saved before that version gets it hidden once.
// `merge`: how the column joins a ticker's rows of several accounts (app/merge.ts): the quotes, fundamentals and returns
// are the security's own (static); the average cost is worked out again from the summed cost and shares; the account
// type has no meaning over several accounts (blank); the cost method and the holding type are the account's own settings,
// shown only when every account agrees; shares on loan show when they are on loan in any account (owner 2026-11-25:
// "loaned should show yes if loaned in any account")
export interface FieldColumn { key: string; field: string; format: FieldFormat; group: FieldGroup; merge: MergeKind; sortBy?: string; width?: number; since?: number }
export const FIELD_COLUMNS: FieldColumn[] = [
  { key: 'avgCost', field: 'cost_basis_per_share', format: 'usd', group: 'acct', merge: 'recomputed' },
  { key: 'acctType', field: 'meta_account_type', format: 'text', group: 'acct', width: 140, merge: 'blank' },
  { key: 'costMethod', field: 'meta_cost_basis_type', format: 'text', group: 'acct', width: 140, merge: 'agree' },
  { key: 'hardToBorrow', field: 'is_hard_to_borrow', format: 'flag', group: 'acct', merge: 'static' },
  { key: 'lastChange', field: 'last_price_change', format: 'signedUsd', group: 'quote', merge: 'static' },
  { key: 'lastChangePct', field: 'last_price_change_pct', format: 'signedPct', group: 'quote', merge: 'static' },
  { key: 'open', field: 'open_price', format: 'usd', group: 'quote', merge: 'static' },
  { key: 'prevClose', field: 'last_price_previous_close', format: 'usd', group: 'quote', merge: 'static' },
  { key: 'bid', field: 'bid_price', format: 'usd', group: 'quote', merge: 'static' },
  { key: 'bidSize', field: 'bid_size', format: 'int', group: 'quote', merge: 'static' },
  { key: 'ask', field: 'ask_price', format: 'usd', group: 'quote', merge: 'static' },
  { key: 'askSize', field: 'ask_size', format: 'int', group: 'quote', merge: 'static' },
  { key: 'volume', field: 'volume', format: 'int', group: 'quote', merge: 'static' },
  { key: 'avgVolume10', field: 'average_volume_10_day', format: 'big', group: 'quote', merge: 'static' },
  { key: 'avgVolume90', field: 'average_volume_90_day', format: 'big', group: 'quote', merge: 'static' },
  { key: 'high52Price', field: 'week_52_high', format: 'usd', group: 'quote', merge: 'static' },
  { key: 'low52Price', field: 'week_52_low', format: 'usd', group: 'quote', merge: 'static' },
  { key: 'high52Date', field: 'year_high_date', format: 'date', group: 'quote', merge: 'static' },
  { key: 'low52Date', field: 'year_low_date', format: 'date', group: 'quote', merge: 'static' },
  { key: 'volatility30', field: 'volatility_30_day', format: 'pct', group: 'quote', merge: 'static' },
  { key: 'volatility250', field: 'volatility_250_day', format: 'pct', group: 'quote', merge: 'static' },
  { key: 'dividendAmount', field: 'dividend_amount', format: 'usd', group: 'div', merge: 'static' },
  { key: 'peRatio', field: 'pe_ratio', format: 'num', group: 'fund', merge: 'static' },
  { key: 'shortPct', field: 'pct_float', format: 'pct', group: 'fund', merge: 'static' },
  { key: 'shortInterest', field: 'short_interest', format: 'big', group: 'fund', merge: 'static' },
  { key: 'shortRatio', field: 'short_interest_ratio', format: 'num', group: 'fund', merge: 'static' },
  { key: 'sharesOut', field: 'shares_outstanding', format: 'big', group: 'fund', merge: 'static' },
  { key: 'earningsDate', field: 'earnings_announcement_date', format: 'date', group: 'fund', merge: 'static' },
  { key: 'analystRating', field: 'equity_summary_rating', format: 'text', group: 'fund', sortBy: 'equity_summary_score', width: 140, merge: 'static' },
  { key: 'industry', field: 'industry', format: 'text', group: 'fund', width: 160, merge: 'static' },
  { key: 'subIndustry', field: 'sub_industry', format: 'text', group: 'fund', width: 180, merge: 'static' },
  { key: 'morningstar', field: 'morningstar_rate', format: 'stars', group: 'fund', merge: 'static' },
  { key: 'morningstarCategory', field: 'morningstar_category', format: 'text', group: 'fund', width: 180, merge: 'static' },
  { key: 'expenseGross', field: 'expense_ratio_gross', format: 'pct', group: 'fund', merge: 'static' },
  { key: 'expenseNet', field: 'expense_ratio_net', format: 'pct', group: 'fund', merge: 'static' },
  { key: 'returnYtd', field: 'ytd_daily', format: 'signedPct', group: 'perf', merge: 'static' },
  { key: 'return1y', field: 'one_year', format: 'signedPct', group: 'perf', merge: 'static' },
  { key: 'return3y', field: 'three_year', format: 'signedPct', group: 'perf', merge: 'static' },
  { key: 'return5y', field: 'five_year', format: 'signedPct', group: 'perf', merge: 'static' },
  { key: 'return10y', field: 'ten_year', format: 'signedPct', group: 'perf', merge: 'static' },
  { key: 'cusip', field: 'symbol_cusip', format: 'text', group: 'other', merge: 'static' },
  { key: 'securityType', field: 'meta_security_type', format: 'text', group: 'other', width: 140, merge: 'static' },
  { key: 'optionable', field: 'is_optionable', format: 'flag', group: 'other', merge: 'static' },
  { key: 'currency', field: 'currency', format: 'text', group: 'other', merge: 'static' },
  // version 3 (owner 2026-11-25: "it also has some other stuff we can add")
  { key: 'distRateDate', field: 'distribution_yield_date', format: 'date', group: 'div', since: 3, merge: 'static' },
  { key: 'secYieldDate', field: 'sec_yield_date', format: 'date', group: 'div', since: 3, merge: 'static' },
  { key: 'volatility10', field: 'volatility_10_day', format: 'pct', group: 'quote', since: 3, merge: 'static' },
  { key: 'volatility60', field: 'volatility_60_day', format: 'pct', group: 'quote', since: 3, merge: 'static' },
  { key: 'volatility90', field: 'volatility_90_day', format: 'pct', group: 'quote', since: 3, merge: 'static' },
  { key: 'volatility120', field: 'volatility_120_day', format: 'pct', group: 'quote', since: 3, merge: 'static' },
  { key: 'prevShortInterest', field: 'previous_short_interest', format: 'big', group: 'fund', since: 3, merge: 'static' },
  { key: 'industryGroup', field: 'industry_group', format: 'text', group: 'fund', width: 160, since: 3, merge: 'static' },
  { key: 'news', field: 'headline_time_text', format: 'text', group: 'other', sortBy: 'headline_time', since: 3, merge: 'static' },
  { key: 'holdingType', field: 'meta_holding_type', format: 'text', group: 'other', since: 3, merge: 'agree' },
  { key: 'loaned', field: 'is_loaned', format: 'flag', group: 'other', since: 3, merge: 'any' },
];

/** the columns added after the owner's own view, by the version that added them: hidden until turned on */
export const NEW_COLUMNS_BY_V: Record<number, string[]> = {
  2: ['todayGlBoth', 'totalGlBoth', 'dayRange'].concat(FIELD_COLUMNS.filter((c) => !c.since || c.since === 2).map((c) => c.key)),
  3: FIELD_COLUMNS.filter((c) => c.since === 3).map((c) => c.key),
  // owner 2026-11-25: "add two more columns disabled by default ... called Min. DRIP and Min. DRIP $"
  4: ['dripMin', 'dripMinUsd'],
  // owner 2026-11-25: "also add adjusted columns: Adj. DRIP $ and Adj. min. DRIP $"
  5: ['dripAdjUsd', 'dripMinAdjUsd'],
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
  drip: num((p) => rowDrip(p)?.shares, signedQty),
  dripUsd: num((p) => rowDrip(p)?.usd, signedUsd),
  dripMin: num((p) => dripMin(p)?.shares, qty),
  dripMinUsd: num((p) => dripMin(p)?.usd, usd),
  dripAdjUsd: num((p) => rowDripAdjUsd(p) ?? undefined, signedUsd),
  dripMinAdjUsd: num((p) => dripMinAdjUsd(p) ?? undefined, usd),
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
  dayRange: { text: (p) => { const lo = num0(p.fields.day_range_low); const hi = num0(p.fields.day_range_high); return lo === undefined || hi === undefined ? '' : `${usd(lo)} - ${usd(hi)}`; }, value: (p) => num0(p.fields.day_range_low) },
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
