/// <reference lib="esnext" />
// Writing the fidelity_* tabs from the Fidelity tab, the only writer of the sheet (one way data flow, shared/sheets/
// sync.ts): the viewer hands over its Google token and the spreadsheet id through Tampermonkey storage after ☁️ and on
// every silent renew; requests to sheets.googleapis.com go through GM_xmlhttpRequest (page CSP and CORS do not apply)
import type { Dataset } from '../shared/model';
import { SheetsClient, chunkPrintsOf, type ChunkPrint, type FetchLike } from '../shared/sheets/client';
import { SET_TABS, fingerprint, markUpdated, pushBetas, pushPositions, pushSummary, pushTransactions, type DataSet } from '../shared/sheets/sync';
import { TRANSACTIONS } from '../shared/sheets/tabs';
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

// the spreadsheet id of the last handoff whether its token is still usable or not (pin.ts asks about it either way)
export function handoffSheet(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  try {
    const id = (JSON.parse(raw) as Partial<GoogleHandoff>).spreadsheetId;
    return typeof id === 'string' ? id : '';
  } catch {
    return '';
  }
}

export type Prints = Partial<Record<DataSet, string>>;
/** the chunk prints of a tab written in parts, by tab name (only fidelity_transactions has them) */
export type TabChunks = Partial<Record<string, ChunkPrint[]>>;

/**
 * Write the given sets (summary, positions, transactions, betas) from the script's copies, skipping a set with nothing in it
 * or with the same content as its last write (`prints`), then mark the written ones in fidelity_updates. Returns the
 * sets written and the prints to keep. `chunks`: the parts of fidelity_transactions as last written to this spreadsheet
 * (sync.ts pushTransactions); `starting` is called right before a set is written, so the caller can drop what it keeps
 * about that set first: a write cut short (an error, the page left) must not leave prints that claim the new content
 */
export async function writeSets(sets: readonly DataSet[], data: { ds: Dataset | null; store: TxnStore | null }, prints: Prints, g: GoogleHandoff, fetcher: FetchLike, log: (line: string) => void, more: { chunks?: TabChunks; starting?: (set: DataSet) => void } = {}): Promise<{ done: DataSet[]; prints: Prints; chunks: TabChunks }> {
  const client = new SheetsClient({
    fetch: fetcher,
    spreadsheetId: g.spreadsheetId,
    // no renew here: an expired token fails clearly and the data waits for the viewer
    getToken: async (force) => { if (force) throw new Error('the Google token expired: open the viewer, it renews it'); return g.token; },
  });
  const done: DataSet[] = [];
  const next: Prints = { ...prints };
  const chunks: TabChunks = { ...(more.chunks ?? {}) };
  // A set with the same content as its last write is skipped only while its tabs are still in the spreadsheet (owner
  // 2026-11-26: "why if I removed the data we wont do full reread?"): a tab deleted by hand comes back with the next
  // write. The tabs are listed once a run, and only when a set would be skipped
  let tabs: Set<string> | null = null;
  const tabsThere = async (set: DataSet): Promise<boolean> => {
    if (!tabs) tabs = new Set((await client.listTabs()).tabs.map((t) => t.title));
    return SET_TABS[set].every((name) => tabs!.has(name));
  };
  for (const set of sets) {
    const print = fingerprint(set, data);
    if (!print) continue;
    if (print === prints[set] && (await tabsThere(set))) continue;
    if (more.starting) more.starting(set);
    if (set === 'summary') await pushSummary(client, data.ds!, log);
    if (set === 'positions') await pushPositions(client, data.ds!, log);
    if (set === 'transactions') chunks[TRANSACTIONS.name] = await pushTransactions(client, data.store!, log, chunkPrintsOf(chunks[TRANSACTIONS.name]));
    if (set === 'betas') await pushBetas(client, data.ds!, log);
    next[set] = print;
    done.push(set);
    tabs = null; // the write may have added tabs
  }
  if (done.length) await markUpdated(client, done, new Date().toISOString());
  return { done, prints: next, chunks };
}

/** what the script keeps in Tampermonkey storage about its writes (main.ts PRINTS_KEY), for one spreadsheet */
export interface KeptPrints { id?: string; prints?: Prints; chunks?: TabChunks }

/**
 * writeSets with the prints kept in storage. They belong to one spreadsheet: a new one gets every set. Right before the
 * transactions go out, their print and parts are dropped from storage, so a write cut short (an error, the page left
 * on the way back) writes that tab whole next time and never trusts parts it may have changed. The new prints are
 * stored only after the whole run succeeded, as the set prints always were. Returns the sets written
 */
export async function writeKept(sets: readonly DataSet[], data: { ds: Dataset | null; store: TxnStore | null }, g: GoogleHandoff, fetcher: FetchLike, storage: { get: () => KeptPrints | null; set: (k: KeptPrints) => void }): Promise<DataSet[]> {
  const kept = storage.get() ?? {};
  const same = kept.id === g.spreadsheetId;
  const starting = (set: DataSet) => {
    if (!same || set !== 'transactions') return;
    const prints: Prints = { ...(kept.prints ?? {}) };
    delete prints.transactions;
    const chunks: TabChunks = { ...(kept.chunks ?? {}) };
    delete chunks[TRANSACTIONS.name];
    storage.set({ id: g.spreadsheetId, prints, chunks });
  };
  const { done, prints, chunks } = await writeSets(sets, data, same ? kept.prints ?? {} : {}, g, fetcher, () => {}, { chunks: same ? kept.chunks ?? {} : {}, starting });
  storage.set({ id: g.spreadsheetId, prints, chunks });
  return done;
}
