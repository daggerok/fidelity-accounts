/// <reference lib="esnext" />
// One way data flow (owner 2026-11-24: "my app initiate action, refresh or we start watch, when data changes it should
// come into google sheets db, when we have new data in google sheets db, my app should be updated"): only the Fidelity
// tab writes the fidelity_* tabs (with its GM_xmlhttpRequest fetch), then it signals which data sets changed and the
// viewer reads only those back. Three sets, as Fidelity changes them apart (owner: "and summary, and positions, and
// even transactions"): summary = fidelity_accounts + fidelity_balances_daily, positions = fidelity_positions (+ the
// wide fidelity_positions_all, written only), transactions = fidelity_transactions + fidelity_transactions_synced.
// betas = fidelity_betas (shared/beta.ts, a daily run of their own).
// Accounts, positions, transactions and betas are the state now (rewritten), balances_daily is history (upsert by date|account)
import type { Betas } from '../beta';
import { DATASET_VERSION, parseDataset, type Account, type Dataset } from '../model';
import type { Txn, TxnStore } from '../transactions';
import { statusOf, type ChunkPrint, type SheetsClient } from './client';
import type { TabSpec } from './tabs';
import { ACCOUNTS, BALANCES, BETAS, POSITIONS, TRANSACTIONS, TXN_SYNCED, UPDATES, WIDE_FIRST, WIDE_TAB, growHeader, wideSpec, type BalanceRow, type BetaRow, type PositionRow, type TxnSyncedRow, type UpdateRow } from './tabs';

export type DataSet = 'summary' | 'positions' | 'transactions' | 'betas';
export const DATA_SETS: readonly DataSet[] = ['summary', 'positions', 'transactions', 'betas'];

/** the signal the Fidelity tab leaves after a write: when, and which sets the sheet has new */
export interface SheetsSignal { at: number; sets: DataSet[] }
export function parseSignal(raw: unknown): SheetsSignal | null {
  try {
    const s = (typeof raw === 'string' ? JSON.parse(raw) : raw) as SheetsSignal | null;
    if (!s || typeof s.at !== 'number' || !Array.isArray(s.sets)) return null;
    const sets = DATA_SETS.filter((d) => s.sets.includes(d));
    return sets.length ? { at: s.at, sets } : null;
  } catch {
    return null;
  }
}

/** the day the numbers belong to: the page's "As of Nov-23-2026 ..." when there, else the read's own day */
export function dayOf(ds: Dataset): string {
  const m = /([A-Z][a-z]{2})-(\d{2})-(\d{4})/.exec(ds.asOf ?? '');
  const months = 'JanFebMarAprMayJunJulAugSepOctNovDec';
  if (m && months.indexOf(m[1]!) >= 0) return `${m[3]}-${String(months.indexOf(m[1]!) / 3 + 1).padStart(2, '0')}-${m[2]}`;
  return ds.builtAt.slice(0, 10);
}

export const positionRows = (ds: Dataset): PositionRow[] => ds.positions.map((p) => ({ ...p, asOf: ds.builtAt }));

// every day of BalanceHistory (value only) plus today's row of each account with its gains, cost basis and cash
export const balanceRows = (ds: Dataset): BalanceRow[] => {
  const names = new Map(ds.accounts.map((a) => [a.number, a.name]));
  const rows: BalanceRow[] = [];
  Object.keys(ds.history ?? {}).forEach((acct) => (ds.history![acct] ?? []).forEach((p) => rows.push({ date: p.date, account: acct, name: names.get(acct) ?? acct, balance: p.value })));
  ds.accounts.forEach((a) => rows.push({ date: dayOf(ds), account: a.number, name: a.name, balance: a.balance, todayGl: a.todayGl, totalGl: a.totalGl, costBasis: a.costBasis, cash: a.cash }));
  return rows;
};

// a stored row keeps the fields a new row of the same day does not have (a history value never wipes today's gains)
export const keepFilled = (stored: BalanceRow, incoming: BalanceRow): BalanceRow => {
  const out: BalanceRow = { ...stored };
  (Object.keys(incoming) as Array<keyof BalanceRow>).forEach((k) => { if (incoming[k] !== undefined) (out as unknown as Record<string, unknown>)[k] = incoming[k]; });
  return out;
};

export const wideRows = (ds: Dataset): Record<string, unknown>[] => ds.positions.map((p) => ({ as_of: ds.builtAt, ...p.fields }));

type Log = (line: string) => void;
const byDate = (x: BalanceRow, y: BalanceRow): number => (x.date === y.date ? (x.account < y.account ? -1 : 1) : x.date < y.date ? -1 : 1);

/** summary: the accounts now and the daily balances (history days plus today's row of each account) */
export async function pushSummary(client: SheetsClient, ds: Dataset, log: Log): Promise<void> {
  if (!ds.accounts.length) return;
  const a = await client.writeAll(ACCOUNTS, ds.accounts);
  log(`${ACCOUNTS.name}: ${a.written} rows`);
  const b = await client.upsertById(BALANCES, balanceRows(ds), { merge: keepFilled, sort: byDate });
  log(`${BALANCES.name}: ${b.inserted} new, ${b.updated} updated, ${b.total} rows`);
}

/** positions: the common columns with every field in JSON, and every field as its own column in the wide tab */
export async function pushPositions(client: SheetsClient, ds: Dataset, log: Log): Promise<void> {
  if (!ds.positions.length) return;
  const p = await client.writeAll(POSITIONS, positionRows(ds));
  log(`${POSITIONS.name}: ${p.written} rows`);
  const rows = wideRows(ds);
  const keys = Array.from(new Set(rows.reduce<string[]>((all, r) => all.concat(Object.keys(r)), WIDE_FIRST.slice())));
  const header = await client.growTabHeader(WIDE_TAB, keys, growHeader);
  const w = await client.writeAll(wideSpec(header), rows);
  log(`${WIDE_TAB}: ${w.written} rows, ${header.length} columns`);
}

export const syncedRows = (store: TxnStore): TxnSyncedRow[] => Object.keys(store.synced).sort().map((account) => ({ account, synced: store.synced[account]!, at: store.at }));

/**
 * transactions: every row, and how far each account was read. fidelity_transactions grows by about 18k rows a year and
 * is written in parts: with `chunks` (the prints of its last successful write to this spreadsheet) only the parts from
 * the first changed one on are sent (client.writeAll); the prints of this write come back for the caller to keep
 */
export async function pushTransactions(client: SheetsClient, store: TxnStore, log: Log, chunks: ChunkPrint[] = []): Promise<ChunkPrint[]> {
  const r = await client.writeAll(TRANSACTIONS, store.rows, chunks);
  log(`${TRANSACTIONS.name}: ${r.written} rows`);
  const s = await client.writeAll(TXN_SYNCED, syncedRows(store));
  log(`${TXN_SYNCED.name}: ${s.written} rows`);
  return r.chunks ?? [];
}

export const betaRows = (betas: Betas): BetaRow[] => Object.keys(betas).sort().map((symbol) => ({ symbol, ...betas[symbol]! }));
export function betasFromRows(rows: BetaRow[]): Betas {
  const out: Betas = {};
  rows.forEach(({ symbol, ...b }) => { if (symbol && Number.isFinite(b.beta)) out[symbol] = b; });
  return out;
}

/** betas: one row per held symbol with its beta, source, months and day */
export async function pushBetas(client: SheetsClient, ds: Dataset, log: Log): Promise<void> {
  if (!ds.betas) return;
  const r = await client.writeAll(BETAS, betaRows(ds.betas));
  log(`${BETAS.name}: ${r.written} rows`);
}

/**
 * A short print of a set's content, to skip a write that would change nothing (owner 2026-11-24: signal "when anything
 * useful was sent, not just empty try"). The read time is left out: accounts carry it in asOf, a refresh of a closed
 * market brings the same numbers with a new time. Null when the set has nothing to write
 */
export function fingerprint(set: DataSet, data: { ds: Dataset | null; store: TxnStore | null }): string | null {
  let json: string;
  if (set === 'summary') {
    if (!data.ds?.accounts.length) return null;
    json = JSON.stringify([data.ds.accounts.map(({ asOf: _asOf, ...a }) => a), data.ds.history ?? null]);
  } else if (set === 'positions') {
    if (!data.ds?.positions.length) return null;
    json = JSON.stringify(data.ds.positions);
  } else if (set === 'betas') {
    const betas = data.ds?.betas;
    if (!betas || !Object.keys(betas).length) return null;
    // the run day is left out like the read time: the same betas the next day are not written again
    json = JSON.stringify(betaRows(betas).map(({ asOf: _asOf, ...b }) => b));
  } else {
    if (!data.store) return null;
    json = JSON.stringify([data.store.synced, data.store.rows]);
  }
  let h = 5381;
  for (let i = 0; i < json.length; i++) h = ((h * 33) ^ json.charCodeAt(i)) >>> 0;
  return `${json.length}:${h.toString(36)}`;
}

/** after the sets are written: their time in fidelity_updates (the viewer watches it) */
export async function markUpdated(client: SheetsClient, sets: readonly DataSet[], at: string): Promise<void> {
  await client.upsertById(UPDATES, sets.map((set) => ({ set, at })));
}

/** the time of each set in fidelity_updates */
export async function readUpdates(client: SheetsClient): Promise<Partial<Record<DataSet, string>>> {
  const rows: UpdateRow[] = await readTab(client, UPDATES);
  const out: Partial<Record<DataSet, string>> = {};
  rows.forEach((r) => { if ((DATA_SETS as readonly string[]).includes(r.set)) out[r.set as DataSet] = r.at; });
  return out;
}

/** the sets the sheet has newer than the ones the viewer loaded (a set never marked is not new) */
export function changedSets(sheet: Partial<Record<DataSet, string>>, seen: Partial<Record<DataSet, string>>): DataSet[] {
  return DATA_SETS.filter((d) => !!sheet[d] && (!seen[d] || sheet[d]! > seen[d]!));
}

/** what the viewer reads back for some sets; a set left out stays undefined */
export interface SheetTabs { accounts?: Account[]; positions?: PositionRow[]; days?: BalanceRow[]; txns?: Txn[]; synced?: TxnSyncedRow[]; betas?: BetaRow[] }
/** the rows of a tab; a tab not created yet (400 "Unable to parse range") reads as empty, other errors surface */
export async function readTab<T>(client: Pick<SheetsClient, 'readRows'>, spec: TabSpec<T>): Promise<T[]> {
  try {
    return await client.readRows(spec);
  } catch (err) {
    if (statusOf(err) === 400) return [];
    throw err;
  }
}

export async function readSets(client: Pick<SheetsClient, 'readRows'>, sets: readonly DataSet[]): Promise<SheetTabs> {
  const out: SheetTabs = {};
  await Promise.all([
    sets.includes('summary') ? Promise.all([readTab(client, ACCOUNTS), readTab(client, BALANCES)]).then(([a, d]) => { out.accounts = a; out.days = d; }) : null,
    sets.includes('positions') ? readTab(client, POSITIONS).then((p) => { out.positions = p; }) : null,
    sets.includes('transactions') ? Promise.all([readTab(client, TRANSACTIONS), readTab(client, TXN_SYNCED)]).then(([t, s]) => { out.txns = t; out.synced = s; }) : null,
    sets.includes('betas') ? readTab(client, BETAS).then((b) => { out.betas = b; }) : null,
  ]);
  return out;
}

/**
 * The shown dataset with the sets read from the sheet put in: accounts and the daily history from summary, positions
 * from positions, the betas from betas; what was not read stays as it was. The read time is the newest asOf of the rows read (the time
 * the Fidelity tab read them), never older than the shown one. Null when nothing is there yet
 */
export function datasetFromTabs(prev: Dataset | null, tabs: SheetTabs): Dataset | null {
  const accounts = tabs.accounts ?? prev?.accounts ?? [];
  const positions = tabs.positions ? tabs.positions.map(({ asOf: _asOf, ...p }) => p) : prev?.positions ?? [];
  if (!accounts.length && !positions.length) return null;
  let history = prev?.history;
  if (tabs.days) {
    const h: Record<string, Array<{ date: string; value: number }>> = {};
    tabs.days.forEach((d) => { if (typeof d.balance === 'number' && /^\d{4}-\d{2}-\d{2}$/.test(d.date)) (h[d.account] = h[d.account] ?? []).push({ date: d.date, value: d.balance }); });
    Object.keys(h).forEach((k) => h[k]!.sort((a, b) => (a.date < b.date ? -1 : 1)));
    history = Object.keys(h).length ? h : history;
  }
  const read = tabs.betas ? betasFromRows(tabs.betas) : undefined;
  const betas = read && Object.keys(read).length ? read : prev?.betas;
  const betasAt = read && Object.keys(read).length ? tabs.betas!.reduce((m, b) => (b.asOf > m ? b.asOf : m), '') || prev?.betasAt : prev?.betasAt;
  const times = (tabs.accounts ?? []).map((a) => a.asOf).concat((tabs.positions ?? []).map((p) => p.asOf), prev ? [prev.builtAt] : []).filter(Boolean);
  const builtAt = times.reduce((m, x) => (x > m ? x : m), '') || new Date().toISOString();
  return parseDataset(JSON.stringify({ version: DATASET_VERSION, builtAt, asOf: null, accounts, positions, warnings: [], history, betas, betasAt }));
}

/** the transactions store from its two tabs, or null when the history was never written */
export function txnStoreFromTabs(txns: Txn[], synced: TxnSyncedRow[]): TxnStore | null {
  if (!synced.length) return null;
  const rows: Txn[] = txns.map((t) => ({ account: t.account, date: t.date, mnemonic: t.mnemonic ?? '', cat: t.cat ?? '', sub: t.sub ?? '', dir: t.dir ?? '', symbol: t.symbol ?? '', qty: t.qty ?? 0, net: t.net ?? 0, desc: t.desc ?? '', cancelled: t.cancelled === true }));
  const at = synced.reduce((m, s) => (s.at > m ? s.at : m), '');
  return { version: 1, at, synced: Object.fromEntries(synced.map((s) => [s.account, s.synced])), rows };
}
