/// <reference lib="esnext" />
// Writing the fidelity_* tabs from the Fidelity tab, the only writer of the sheet (one way data flow, shared/sheets/
// sync.ts): the viewer hands over its Google token and the spreadsheet id through Tampermonkey storage after ☁️ and on
// every silent renew; requests to sheets.googleapis.com go through GM_xmlhttpRequest (page CSP and CORS do not apply)
import type { Dataset } from '../shared/model';
import { SheetsClient, type FetchLike } from '../shared/sheets/client';
import { fingerprint, markUpdated, pushBetas, pushPositions, pushSummary, pushTransactions, type DataSet } from '../shared/sheets/sync';
import type { TxnStore } from '../shared/transactions';

export const GOOGLE_KEY = 'fidelity-accounts.google'; // JSON { token, expiresAt, spreadsheetId }
export interface GoogleHandoff { token: string; expiresAt: number; spreadsheetId: string }

type GmRequest = (d: {
  method: string; url: string; headers?: Record<string, string>; data?: string; responseType?: 'text';
  onload: (r: { status: number; responseText: string; responseHeaders: string }) => void;
  onerror: (e: unknown) => void; ontimeout?: () => void; timeout?: number;
}) => void;

// a fetch over GM_xmlhttpRequest returning a real Response, so the shared Sheets client works unchanged
export function gmFetch(request: GmRequest): FetchLike {
  return (input, init) => new Promise<Response>((resolve, reject) => {
    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((v, k) => { headers[k] = v; });
    request({
      method: init?.method ?? 'GET', url: input, headers, data: typeof init?.body === 'string' ? init.body : undefined, responseType: 'text', timeout: 30000,
      onload: (r) => {
        const h = new Headers();
        r.responseHeaders.split(/\r?\n/).forEach((line) => { const i = line.indexOf(':'); if (i > 0) h.append(line.slice(0, i).trim(), line.slice(i + 1).trim()); });
        resolve(new Response(r.status === 204 ? null : r.responseText, { status: r.status || 200, headers: h }));
      },
      onerror: () => reject(new Error(`network error: ${input}`)),
      ontimeout: () => reject(new Error(`timeout: ${input}`)),
    });
  });
}

// a token is used only with a minute left; otherwise the data waits for the viewer (☁️ or its silent renew)
export function usableHandoff(raw: unknown, now: number): GoogleHandoff | null {
  if (typeof raw !== 'string') return null;
  try {
    const g = JSON.parse(raw) as GoogleHandoff;
    return g.token && g.spreadsheetId && g.expiresAt - now > 60_000 ? g : null;
  } catch {
    return null;
  }
}

export type Prints = Partial<Record<DataSet, string>>;

/**
 * Write the given sets (summary, positions, transactions, betas) from the script's copies, skipping a set with nothing in it
 * or with the same content as its last write (`prints`), then mark the written ones in fidelity_updates. Returns the
 * sets written and the prints to keep
 */
export async function writeSets(sets: readonly DataSet[], data: { ds: Dataset | null; store: TxnStore | null }, prints: Prints, g: GoogleHandoff, fetcher: FetchLike, log: (line: string) => void): Promise<{ done: DataSet[]; prints: Prints }> {
  const client = new SheetsClient({
    fetch: fetcher,
    spreadsheetId: g.spreadsheetId,
    // no renew here: an expired token fails clearly and the data waits for the viewer
    getToken: async (force) => { if (force) throw new Error('the Google token expired: open the viewer, it renews it'); return g.token; },
  });
  const done: DataSet[] = [];
  const next: Prints = { ...prints };
  for (const set of sets) {
    const print = fingerprint(set, data);
    if (!print || print === prints[set]) continue;
    if (set === 'summary') await pushSummary(client, data.ds!, log);
    if (set === 'positions') await pushPositions(client, data.ds!, log);
    if (set === 'transactions') await pushTransactions(client, data.store!, log);
    if (set === 'betas') await pushBetas(client, data.ds!, log);
    next[set] = print;
    done.push(set);
  }
  if (done.length) await markUpdated(client, done, new Date().toISOString());
  return { done, prints: next };
}
