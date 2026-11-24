/// <reference lib="esnext" />
// The transactions history of Fidelity's Activity page (open items F3), the facts behind income, deposits and holdings:
// the same read-only request the page makes (POST with its appId and appName headers). Framework-free: the userscript
// reads and stores it, the viewer sums it. Answers are cut silently near 5,000 rows and the server counts the edge
// day in both windows, so windows never share a day and a big one is split
import { addDays } from './dates';

export const TRANSACTIONS_URL = '/ftgw/digital/activityapi/api/v1/transactions/history';
export const TRANSACTIONS_HEADERS = { appId: 'ap182468', appName: 'activity-orders-ui' } as const;
/** a window this full may have been cut: split it */
export const SPLIT_AT = 1500;

/** one transaction, the fields the app uses (dates in New York time, money in dollars) */
export interface Txn {
  account: string;
  date: string; // traded date
  mnemonic: string; // DIV, RIN, BOT, SLD, TFR, JNL, ...
  cat: string; // DV = dividend or interest
  sub: string; // VP = dividend paid, RN = reinvest
  dir: string; // D = money in, W = money out
  symbol: string;
  qty: number;
  net: number;
  desc: string;
  cancelled: boolean;
}

export interface TxnStore { version: 1; at: string; synced: Record<string, string>; rows: Txn[] }

const NY = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });
/** epoch seconds -> the New York calendar day */
export const nyDate = (epochS: number): string => NY.format(new Date(epochS * 1000));
/** an ISO day at New York midnight, as epoch seconds (what the request takes) */
export const nyEpoch = (iso: string): number => {
  const guess = Date.parse(`${iso}T05:00:00Z`) / 1000; // 5 h covers EST; EDT is 4 h, 1 h before midnight is still that day
  return nyDate(guess) === iso ? guess : guess - 3600;
};

/** the request body of one account and window [from, to] (both days included) */
export function txnRequest(account: { number: string; name: string }, from: string, to: string): unknown {
  const b64 = btoa(Array.from(new TextEncoder().encode(account.name)).map((c) => String.fromCharCode(c)).join(''));
  return {
    filter: {
      accounts: [{ acctNum: account.number, acctName: b64, acctType: 'Brokerage' }],
      searchCriteriaDetail: { txnFromDate: nyEpoch(from), txnToDate: nyEpoch(to), includeBasketNames: false, includeCoreFundSettlementTransactions: true, includeFullyPaidLendingTxn: false },
    },
  };
}

const num = (v: unknown): number => { const n = typeof v === 'number' ? v : Number(v); return Number.isFinite(n) ? n : 0; };
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
/** a nested field of an untyped answer */
const at = (o: unknown, ...keys: string[]): unknown => keys.reduce<unknown>((x, k) => (x && typeof x === 'object' ? (x as Record<string, unknown>)[k] : undefined), o);

/** the rows of one answer; throws when the answer has no transactions list (Fidelity changed it) */
export function parseTransactions(json: unknown, account: string): Txn[] {
  const list = (json as { data?: { transactions?: unknown } } | null)?.data?.transactions;
  if (!Array.isArray(list)) throw new Error('transactions: no data.transactions in the answer');
  return list.map((t) => ({
    account: str(at(t, 'acctNum')) || account,
    date: nyDate(num(at(t, 'dateDetail', 'tradedDate')) || num(at(t, 'date'))),
    mnemonic: str(at(t, 'brokerageDetail', 'additionalDetail', 'mnemonic')),
    cat: str(at(t, 'catDetail', 'txnCatCode')),
    sub: str(at(t, 'catDetail', 'txnSubCatCode')),
    dir: str(at(t, 'brokerageDetail', 'additionalDetail', 'depositWithdrawalCode')),
    symbol: str(at(t, 'securityDetail', 'symbol')),
    qty: num(at(t, 'quantity')),
    net: num(at(t, 'amtDetail', 'net')),
    desc: str(at(t, 'description')),
    cancelled: at(t, 'brokerageDetail', 'isCancelled') === true,
  }));
}

/** month windows from `from` to `to`, days never shared */
export function monthWindows(from: string, to: string): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  let start = from;
  while (start <= to) {
    const [y, m] = start.split('-').map(Number) as [number, number];
    const monthEnd = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    const end = monthEnd < to ? monthEnd : to;
    out.push([start, end]);
    start = addDays(end, 1);
  }
  return out;
}

/** a window split in two halves of days, or null for a single day */
export function splitWindow([from, to]: [string, string]): Array<[string, string]> | null {
  if (from >= to) return null;
  const days = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
  const mid = addDays(from, Math.floor(days / 2));
  return [[from, mid], [addDays(mid, 1), to]];
}

/** the stored rows with one account's window [from, to] replaced by a fresh read of it */
export function replaceWindow(rows: Txn[], account: string, from: string, to: string, fresh: Txn[]): Txn[] {
  return rows.filter((r) => r.account !== account || r.date < from || r.date > to).concat(fresh)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.account < b.account ? -1 : a.account > b.account ? 1 : 0));
}

/** dividends and interest paid into the accounts in [from, to]: cash in (D) of the DV category, not cancelled */
export const isIncome = (t: Txn): boolean => t.cat === 'DV' && t.dir === 'D' && !t.cancelled;
export function incomeReceived(rows: Txn[], accounts: Set<string>, from: string, to: string, keep: (t: Txn) => boolean = () => true): number {
  const sum = rows.reduce((s, t) => (accounts.has(t.account) && t.date >= from && t.date <= to && isIncome(t) && keep(t) ? s + t.net : s), 0);
  return Math.round(sum * 100) / 100;
}

/** the parsed store, or null */
export function parseTxnStore(json: unknown): TxnStore | null {
  try {
    const s = typeof json === 'string' ? JSON.parse(json) : json;
    return s && s.version === 1 && Array.isArray(s.rows) && s.synced && typeof s.synced === 'object' ? (s as TxnStore) : null;
  } catch {
    return null;
  }
}
