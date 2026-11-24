/// <reference lib="esnext" />
// The data the viewer shows and the sheet keeps. Built from two things the Fidelity positions page already has:
// the account list on the left (groups, names, balances) and the rows of its positions grid (ag-grid), whose raw
// objects carry about 100 fields each, mostly as { val, disp }. Nothing is computed by Fidelity for us twice:
// money stays in dollars as numbers (the site gives them so), dates as ISO text
export const DATASET_VERSION = 1;

export interface Account {
  number: string; // Z12345678, or the retirement account number
  name: string;
  group: string; // Investment, Retirement, ... as the site groups them
  type?: string; // Brokerage, ROTH IRA, ... (meta.acctType of the grid)
  balance?: number;
  todayGl?: number;
  todayGlPct?: number;
  totalGl?: number;
  totalGlPct?: number;
  costBasis?: number;
  estAnnualIncome?: number;
  cash?: number; // core position (money market)
  pending?: number; // pending activity
  asOf: string; // ISO time the numbers were read
}

// row kinds of the grid: a security, the cash core position, pending activity
export type PositionKind = 'position' | 'core' | 'pending';

export interface Position {
  account: string; // account number
  kind: PositionKind;
  symbol: string;
  description: string;
  cusip?: string;
  securityType?: string;
  securitySubType?: string;
  quantity?: number;
  lastPrice?: number;
  lastPriceChange?: number;
  lastPriceChangePct?: number;
  currentValue?: number;
  todayGl?: number;
  todayGlPct?: number;
  totalGl?: number;
  totalGlPct?: number;
  costBasisTotal?: number;
  costBasisPerShare?: number;
  percentOfAccount?: number;
  distRate?: number;
  secYield?: number;
  estAnnualIncome?: number;
  dividendAmount?: number;
  paymentFrequency?: string;
  exDate?: string;
  payDate?: string;
  marketCap?: number;
  marketCapText?: string;
  sector?: string;
  industry?: string;
  low52?: number;
  high52?: number;
  // every field of the grid row, flattened (key -> value as shown, or the raw value): the "all columns" part
  fields: Record<string, string | number | boolean>;
}

export interface Dataset {
  version: number;
  builtAt: string; // ISO
  asOf: string | null; // the page's "As of Nov-23-2026 9:37 p.m. ET", as read
  accounts: Account[];
  positions: Position[];
  warnings: string[];
}

export const emptyDataset = (builtAt: string): Dataset => ({ version: DATASET_VERSION, builtAt, asOf: null, accounts: [], positions: [], warnings: [] });

// a stored or received copy; anything else (older layout, junk) is refused
export function parseDataset(json: string): Dataset | null {
  try {
    const d = JSON.parse(json) as Partial<Dataset>;
    if (!d || d.version !== DATASET_VERSION || typeof d.builtAt !== 'string') return null;
    return { version: d.version, builtAt: d.builtAt, asOf: d.asOf ?? null, accounts: Array.isArray(d.accounts) ? d.accounts : [], positions: Array.isArray(d.positions) ? d.positions : [], warnings: Array.isArray(d.warnings) ? d.warnings : [] };
  } catch {
    return null;
  }
}

// A read of one page may hold only some accounts (one account selected on the site): the accounts it holds replace
// theirs, the others are kept from the previous copy
export function mergeDatasets(prev: Dataset | null, next: Dataset): Dataset {
  if (!prev) return next;
  const fresh = new Set(next.positions.map((p) => p.account).concat(next.accounts.filter((a) => next.positions.some((p) => p.account === a.number)).map((a) => a.number)));
  const accounts = new Map(prev.accounts.map((a) => [a.number, a]));
  next.accounts.forEach((a) => accounts.set(a.number, { ...accounts.get(a.number), ...a }));
  const positions = prev.positions.filter((p) => !fresh.has(p.account)).concat(next.positions);
  return { ...next, accounts: Array.from(accounts.values()), positions };
}
