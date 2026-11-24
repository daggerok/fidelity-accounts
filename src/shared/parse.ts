/// <reference lib="esnext" />
// Raw page data -> Dataset. Two inputs, both read from the Fidelity positions page by the userscript (read only):
// - SidebarAccount[]: the account list on the left (group, name, number, balance, today's change)
// - grid rows: the raw objects of the positions grid (rowType ACCOUNT, POSITION, POSITION_CORE, PENDING,
//   ACCOUNT_TOTAL, SPACER, GRAND_TOTAL). Values come as { val, disp }: percents are in percent units (4.06 = 4.06%),
//   money in dollars, dates as epoch seconds with disp "Dec-12-2026" (the disp is used, so no time zone shift)
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

/** Every field of a grid row as flat snake-free keys: fifTwo.low -> fifTwo_low, sym.desc -> sym_desc, meta.* -> meta_* */
export function flatten(row: GridRow, prefix = '', out: Record<string, string | number | boolean> = {}, depth = 0): Record<string, string | number | boolean> {
  Object.keys(row).forEach((k) => {
    if (SKIP.has(k)) return;
    const v = row[k];
    const key = prefix ? `${prefix}_${k}` : k;
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
      if (depth < 3) flatten(v, key, out, depth + 1);
      return;
    }
    if (typeof v === 'string') { if (!EMPTY.has(v.trim())) out[key] = v.trim(); return; }
    if (typeof v === 'number' || typeof v === 'boolean') out[key] = v;
  });
  return out;
}

const num = (f: Record<string, unknown>, k: string): number | undefined => (typeof f[k] === 'number' ? (f[k] as number) : money(f[k]));
const str = (f: Record<string, unknown>, k: string): string | undefined => (f[k] === undefined ? undefined : String(f[k]));

const KIND: Record<string, PositionKind> = { POSITION: 'position', POSITION_CORE: 'core', PENDING: 'pending' };

export function positionOf(row: GridRow): Position | null {
  const kind = KIND[String(row.rowType)];
  const account = typeof row.actNum === 'string' ? row.actNum : '';
  if (!kind || !account) return null;
  const f = flatten(row);
  const symbol = (str(f, 'sym_name') ?? (kind === 'pending' ? 'Pending activity' : '')).replace(/\*+$/, '');
  return {
    account,
    kind,
    symbol,
    description: str(f, 'sym_desc') ?? str(f, 'meta_headerDescription') ?? '',
    cusip: str(f, 'sym_cusip'),
    securityType: str(f, 'meta_securityType'),
    securitySubType: str(f, 'meta_securitySubType'),
    quantity: num(f, 'qty'),
    lastPrice: num(f, 'lstPrc'),
    lastPriceChange: num(f, 'lstPrChg'),
    lastPriceChangePct: num(f, 'lstPrChgPct'),
    currentValue: num(f, 'curVal'),
    todayGl: num(f, 'todGL'),
    todayGlPct: num(f, 'todGLPct'),
    totalGl: num(f, 'totGL'),
    totalGlPct: num(f, 'totGLPct'),
    costBasisTotal: num(f, 'cstBasTot'),
    costBasisPerShare: num(f, 'cstBasShr'),
    percentOfAccount: num(f, 'actPer'),
    distRate: num(f, 'distYld'),
    secYield: num(f, 'secYld'),
    estAnnualIncome: num(f, 'estAnuInc'),
    dividendAmount: num(f, 'dvAmt'),
    paymentFrequency: str(f, 'dividendFrequency'),
    exDate: isoDate(str(f, 'exDvDte')) ?? (/^\d{4}-\d\d-\d\d$/.test(str(f, 'exDvDte') ?? '') ? str(f, 'exDvDte') : undefined),
    payDate: /^\d{4}-\d\d-\d\d$/.test(str(f, 'pyDte') ?? '') ? str(f, 'pyDte') : undefined,
    marketCap: num(f, 'marketCap'),
    marketCapText: str(f, 'marketCap_text'),
    sector: str(f, 'sector'),
    industry: str(f, 'industry'),
    low52: num(f, 'fifTwo_low'),
    high52: num(f, 'fifTwo_high'),
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
        balance: num(f, 'curVal') ?? a.balance,
        todayGl: num(f, 'todGL') ?? a.todayGl,
        todayGlPct: num(f, 'todGLPct') ?? a.todayGlPct,
        totalGl: num(f, 'totGL'),
        totalGlPct: num(f, 'totGLPct'),
        costBasis: num(f, 'cstBasTot'),
        estAnnualIncome: num(f, 'estAnuInc'),
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
