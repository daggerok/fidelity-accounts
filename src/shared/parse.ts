/// <reference lib="esnext" />
// Raw page data -> Dataset. Two inputs, both read from the Fidelity positions page by the userscript (read only):
// - SidebarAccount[]: the account list on the left (group, name, number, balance, today's change)
// - grid rows: the raw objects of the positions grid (rowType ACCOUNT, POSITION, POSITION_CORE, PENDING,
//   ACCOUNT_TOTAL, SPACER, GRAND_TOTAL). Values come as { val, disp }: percents are in percent units (4.06 = 4.06%),
//   money in dollars, dates as epoch seconds with disp "Dec-12-2026" (the disp is used, so no time zone shift)
import { readableKeys, snakeCase } from './snake';
import { DATASET_VERSION, type Account, type Dataset, type Position, type PositionKind } from './model';

export interface SidebarAccount {
  group: string;
  name: string;
  number: string;
  balance?: number;
  todayGl?: number;
  todayGlPct?: number;
}

export type GridRow = Record<string, unknown>;

const MONTHS: Record<string, string> = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' };

/** "Dec-12-2026" -> "2026-12-12", anything else -> null */
export function isoDate(text: unknown): string | null {
  const m = /^([A-Z][a-z]{2})-(\d{2})-(\d{4})$/.exec(String(text ?? '').trim());
  return m && MONTHS[m[1]!] ? `${m[3]}-${MONTHS[m[1]!]}-${m[2]}` : null;
}

/** "$1,234.56", "+4.06%", "-$12.00", "(+5.71%)" -> number; "--" and words -> undefined */
export function money(text: unknown): number | undefined {
  if (typeof text === 'number') return Number.isFinite(text) ? text : undefined;
  const t = String(text ?? '').replace(/[\s$,%()+]/g, '').replace(/[−–]/g, '-');
  if (!/^-?\d+(\.\d+)?$/.test(t)) return undefined;
  return Number(t);
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const EMPTY = new Set(['--', '', 'N/A', 'n/a']);

// a { val, disp } cell -> the value to keep: a date as ISO, a number as number, else the text shown
function cellValue(c: Record<string, unknown>): string | number | boolean | undefined {
  const disp = c.disp === undefined || c.disp === null ? '' : String(c.disp).trim();
  const date = isoDate(disp);
  if (date) return date;
  if (typeof c.val === 'number' && Number.isFinite(c.val)) return c.val;
  if (typeof c.val === 'boolean') return c.val;
  const v = c.val === undefined || c.val === null ? disp : String(c.val).trim();
  if (EMPTY.has(v) && EMPTY.has(disp)) return undefined;
  return EMPTY.has(v) ? disp : v;
}

// keys that are page actions or presentation only, not data
const SKIP = new Set(['tradActns', 'acctActns', 'occUrl', 'contractRangeVisual', 'rowId']);

// every field of a grid row as flat keys in Fidelity's own words, snake_case: fifTwo.low -> fif_two_low
function flattenRaw(row: GridRow, prefix = '', out: Record<string, string | number | boolean> = {}, depth = 0): Record<string, string | number | boolean> {
  Object.keys(row).forEach((k) => {
    if (SKIP.has(k)) return;
    const v = row[k];
    const key = prefix ? `${prefix}_${snakeCase(k)}` : snakeCase(k);
    if (v === null || v === undefined) return;
    if (Array.isArray(v)) { if (v.length) out[key] = JSON.stringify(v).slice(0, 2000); return; }
    if (isObj(v)) {
      if ('val' in v || 'disp' in v) {
        const x = cellValue(v);
        if (x !== undefined) out[key] = x;
        // a code shown as a word (frequency 4 -> "Quarterly"): the word is the value; a number shown with words
        // (market cap "Large cap ($234.93B)"): keep the number and the words in <key>_text
        const disp = typeof v.disp === 'string' ? v.disp.trim() : '';
        if (typeof x === 'number' && /[A-Za-z]/.test(disp) && !EMPTY.has(disp)) {
          if (/\d/.test(disp)) out[`${key}_text`] = disp;
          else out[key] = disp;
        }
        return;
      }
      if (depth < 3) flattenRaw(v, key, out, depth + 1);
      return;
    }
    if (typeof v === 'string') { if (!EMPTY.has(v.trim())) out[key] = v.trim(); return; }
    if (typeof v === 'number' || typeof v === 'boolean') out[key] = v;
  });
  return out;
}

/** Every field of a grid row under its readable name (shared/snake.ts): lstPrc -> last_price, fifTwo.low -> week_52_low */
export const flatten = (row: GridRow): Record<string, string | number | boolean> => readableKeys(flattenRaw(row));

const num = (f: Record<string, unknown>, k: string): number | undefined => (typeof f[k] === 'number' ? (f[k] as number) : money(f[k]));
const str = (f: Record<string, unknown>, k: string): string | undefined => (f[k] === undefined ? undefined : String(f[k]));

const KIND: Record<string, PositionKind> = { POSITION: 'position', POSITION_CORE: 'core', PENDING: 'pending' };

export function positionOf(row: GridRow): Position | null {
  const kind = KIND[String(row.rowType)];
  const account = typeof row.actNum === 'string' ? row.actNum : '';
  if (!kind || !account) return null;
  const f = flatten(row);
  const symbol = (str(f, 'symbol_name') ?? (kind === 'pending' ? 'Pending activity' : '')).replace(/\*+$/, '');
  return {
    account,
    kind,
    symbol,
    description: str(f, 'symbol_description') ?? str(f, 'meta_header_description') ?? '',
    cusip: str(f, 'symbol_cusip'),
    securityType: str(f, 'meta_security_type'),
    securitySubType: str(f, 'meta_security_sub_type'),
    quantity: num(f, 'quantity'),
    lastPrice: num(f, 'last_price'),
    lastPriceChange: num(f, 'last_price_change'),
    lastPriceChangePct: num(f, 'last_price_change_pct'),
    currentValue: num(f, 'current_value'),
    todayGl: num(f, 'today_gl'),
    todayGlPct: num(f, 'today_gl_pct'),
    totalGl: num(f, 'total_gl'),
    totalGlPct: num(f, 'total_gl_pct'),
    costBasisTotal: num(f, 'cost_basis_total'),
    costBasisPerShare: num(f, 'cost_basis_per_share'),
    percentOfAccount: num(f, 'percent_of_account'),
    distRate: num(f, 'distribution_yield'),
    secYield: num(f, 'sec_yield'),
    estAnnualIncome: num(f, 'est_annual_income'),
    dividendAmount: num(f, 'dividend_amount'),
    paymentFrequency: str(f, 'dividend_frequency'),
    exDate: isoDate(str(f, 'ex_date')) ?? (/^\d{4}-\d\d-\d\d$/.test(str(f, 'ex_date') ?? '') ? str(f, 'ex_date') : undefined),
    payDate: /^\d{4}-\d\d-\d\d$/.test(str(f, 'pay_date') ?? '') ? str(f, 'pay_date') : undefined,
    marketCap: num(f, 'market_cap'),
    marketCapText: str(f, 'market_cap_text'),
    sector: str(f, 'sector'),
    industry: str(f, 'industry'),
    low52: num(f, 'week_52_low'),
    high52: num(f, 'week_52_high'),
    fields: f,
  };
}

/** Grid rows + the sidebar list -> Dataset. Accounts come from the sidebar (groups, balances) and are completed by
 * the grid's ACCOUNT and ACCOUNT_TOTAL rows; an account seen only in the grid lands in group "Other" */
export function buildDataset(input: { rows: GridRow[]; sidebar: SidebarAccount[]; asOf: string | null; builtAt: string }): Dataset {
  const warnings: string[] = [];
  const accounts = new Map<string, Account>();
  input.sidebar.forEach((s) => {
    if (!s.number) return;
    accounts.set(s.number, { number: s.number, name: s.name, group: s.group || 'Other', balance: s.balance, todayGl: s.todayGl, todayGlPct: s.todayGlPct, asOf: input.builtAt });
  });
  const positions: Position[] = [];
  input.rows.forEach((row) => {
    const type = String(row.rowType);
    const number = typeof row.actNum === 'string' ? row.actNum : '';
    if (type === 'ACCOUNT' && number) {
      const meta = isObj(row.meta) ? row.meta : {};
      const a = accounts.get(number) ?? { number, name: String(row.actNam ?? number), group: 'Other', asOf: input.builtAt };
      accounts.set(number, { ...a, name: a.name || String(row.actNam ?? ''), type: typeof meta.acctType === 'string' ? meta.acctType : a.type });
    } else if (type === 'ACCOUNT_TOTAL' && number) {
      const f = flatten(row);
      const a = accounts.get(number) ?? { number, name: String(row.actNam ?? number), group: 'Other', asOf: input.builtAt };
      accounts.set(number, {
        ...a,
        balance: num(f, 'current_value') ?? a.balance,
        todayGl: num(f, 'today_gl') ?? a.todayGl,
        todayGlPct: num(f, 'today_gl_pct') ?? a.todayGlPct,
        totalGl: num(f, 'total_gl'),
        totalGlPct: num(f, 'total_gl_pct'),
        costBasis: num(f, 'cost_basis_total'),
        estAnnualIncome: num(f, 'est_annual_income'),
      });
    } else {
      const p = positionOf(row);
      if (p) positions.push(p);
    }
  });
  accounts.forEach((a, n) => {
    const own = positions.filter((p) => p.account === n);
    const cash = own.filter((p) => p.kind === 'core').reduce((s, p) => s + (p.currentValue ?? 0), 0);
    const pending = own.filter((p) => p.kind === 'pending').reduce((s, p) => s + (p.currentValue ?? 0), 0);
    accounts.set(n, { ...a, cash: own.some((p) => p.kind === 'core') ? cash : a.cash, pending: own.some((p) => p.kind === 'pending') ? pending : a.pending });
  });
  if (!input.rows.length) warnings.push('the positions grid had no rows');
  return { version: DATASET_VERSION, builtAt: input.builtAt, asOf: input.asOf, accounts: Array.from(accounts.values()), positions, warnings };
}
