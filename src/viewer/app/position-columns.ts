/// <reference lib="esnext" />
// What every Positions column shows as text and the exact number behind it: the input of the type detection, the typed
// sort and the column filters (src/shared/typed-columns.ts). The table draws its cells itself (colours, the range bar);
// a column with no entry here reads its own field of the position, so a new column sorts and filters with no extra code
import type { Position } from '../../shared/model';
import { parseCellValue } from '../../shared/filter-engine';
import { columnTypes, sortRows, type ColumnType, type TypedColumn } from '../../shared/typed-columns';
import { DASH, bigUsd, pct, qty, signedPct, signedQty, signedUsd, siteDate, usd } from '../ui/format';
import { dripGap, rangePos } from './derive';

type Cell = Omit<TypedColumn<Position>, 'key'>;

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
};

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
