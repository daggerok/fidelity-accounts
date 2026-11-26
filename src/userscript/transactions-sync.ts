/// <reference lib="esnext" />
// The transactions history, read with the page's session (the request the Activity page makes, a read), when
// schedule.ts says: the first time each account from its first daily value on, month by month; then from 10 days
// before the last read day, so late postings are caught (`full`), or only yesterday and today (`recent`, 👀 in the session). A window that came back too full is split until it fits.
// One account failing waits for the next day, the others keep their rows
import { addDays } from '../shared/dates';
import type { History } from '../shared/history';
import type { Account } from '../shared/model';
import { SPLIT_AT, TRANSACTIONS_URL, monthWindows, parseTransactions, replaceWindow, splitWindow, txnRequest, type Txn, type TxnStore } from '../shared/transactions';
import type { Post } from './history-sync';

export const EMPTY_STORE: TxnStore = { version: 1, at: '', synced: {}, rows: [] };
const FIRST_DAY = '2024-01-01'; // an account with no daily values yet starts here
export const OVERLAP_DAYS = 10; // a full read goes this far back again
export const RECENT_DAYS = 1; // a recent read: yesterday and today

/** the first day to read for an account */
export function startDay(account: string, store: TxnStore, history: History | undefined, overlap = OVERLAP_DAYS): string {
  const last = store.synced[account];
  if (last) return addDays(last, -overlap);
  return history?.[account]?.[0]?.date ?? FIRST_DAY;
}

/** one window, split while an answer is too full; the rows of the whole window */
async function readWindow(account: Account, w: [string, string], post: Post, depth = 0): Promise<Txn[]> {
  const rows = parseTransactions(await post(TRANSACTIONS_URL, txnRequest(account, w[0], w[1])), account.number);
  const halves = rows.length >= SPLIT_AT && depth < 8 ? splitWindow(w) : null;
  if (!halves) return rows;
  const out: Txn[] = [];
  for (const h of halves) out.push(...(await readWindow(account, h, post, depth + 1)));
  return out;
}

/** read every account up to `today`; returns the new store and the accounts that failed */
export async function readTransactions(accounts: Account[], store: TxnStore, history: History | undefined, today: string, post: Post, overlap = OVERLAP_DAYS): Promise<{ store: TxnStore; failed: string[] }> {
  let rows = store.rows;
  const synced = { ...store.synced };
  const failed: string[] = [];
  for (const a of accounts) {
    const from = startDay(a.number, store, history, overlap);
    try {
      const fresh: Txn[] = [];
      for (const w of monthWindows(from, today)) fresh.push(...(await readWindow(a, w, post)));
      rows = replaceWindow(rows, a.number, from, today, fresh);
      synced[a.number] = today;
    } catch {
      failed.push(a.number);
    }
  }
  return { store: { version: 1, at: new Date().toISOString(), synced, rows }, failed };
}
