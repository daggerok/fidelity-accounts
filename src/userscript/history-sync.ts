/// <reference lib="esnext" />
// Daily account values for the viewer's chart and periods: Fidelity's own BalanceHistory, read with the page's session
// (a read: the same request Fidelity's Summary chart makes). The first time 3Y per account (= since it opened), then 1M
// after 20:00 New York of each workday to add the new days (when: schedule.ts). Only this one URL is ever asked
import { BALANCE_HISTORY_URL, parseBalanceHistory, type History } from '../shared/history';
import { TRANSACTIONS_HEADERS, TRANSACTIONS_URL } from '../shared/transactions';
import type { Account } from '../shared/model';

export type Post = (url: string, body: unknown) => Promise<unknown>;

/** one request per account: 3Y for an account without points yet, else 1M; a failed account is skipped */
export async function readHistory(accounts: Account[], have: History | undefined, post: Post): Promise<History> {
  const out: History = {};
  for (const a of accounts) {
    const range = have?.[a.number]?.length ? '1M' : '3Y';
    try {
      const points = parseBalanceHistory(await post(BALANCE_HISTORY_URL, { range, acctList: [{ acctNum: a.number, acctType: a.type || 'Brokerage' }] }));
      if (points.length) out[a.number] = points;
    } catch { /* this account waits for the next day */ }
  }
  return out;
}

/**
 * same-origin POST with the owner's session; only two reads are allowed: BalanceHistory (the Summary chart's data) and
 * the transactions history (the Activity page's data, with the page's own appId and appName headers)
 */
const ALLOWED: Record<string, Record<string, string>> = { [BALANCE_HISTORY_URL]: {}, [TRANSACTIONS_URL]: { ...TRANSACTIONS_HEADERS } };
export const pagePost: Post = async (url, body) => {
  const extra = ALLOWED[url];
  if (!extra) throw new Error(`not allowed: ${url}`);
  const r = await fetch(url, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json', accept: 'application/json', ...extra }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`${url.split('/').pop()} ${r.status}`);
  return r.json();
};
