/// <reference lib="esnext" />
// Where the dataset comes from in the viewer: the userscript bridge (window message 'fidelity-accounts:dataset'),
// Google Sheets (↻), Import JSON, and IndexedDB of the viewer origin for the next visit
import { mergeHistory } from '../../shared/history';
import { parseTxnStore, type TxnStore } from '../../shared/transactions';
import { parseDataset, type Dataset } from '../../shared/model';
import { createStore } from '../../shared/store';
import type { Report } from '../../shared/contract';
import { POSITIONS_URL } from '../../userscript/header';
import { cacheGet, cacheSet } from './cache';
import { t } from './i18n';

export type Source = 'userscript' | 'sheets' | 'import' | 'cache';
export interface DataState { ds: Dataset | null; source: Source | null; error: string | null }
export const dataset = createStore<DataState>({ ds: null, source: null, error: null });

// the last read in the Fidelity tab: { status, at, accounts, positions, message }
export interface RunState { status: string; at: number; accounts?: number; positions?: number; message?: string | null }
export const runState = createStore<RunState | null>(null);
// a Fidelity login saved in the script (only "yes or no" crosses the bridge, never the login itself)
export const loginSaved = createStore<boolean | null>(null);
// 👀 Watch on or off, only by the owner's hand (owner 2026-11-24: no pause by the clock, set and unset by me): kept in
// the script's storage, so the Fidelity tab (its badge has the same switch) and every viewer tab agree, and mirrored in
// this browser's localStorage so 👀 shows right at once after a reload. `watchChosen`: switched at least once, so the
// viewer never switches it on by itself again
const WATCH_MIRROR = 'fidelity-accounts.watch';
const mirror = (): string | null => { try { return localStorage.getItem(WATCH_MIRROR); } catch { return null; } };
export const watching = createStore<boolean>(mirror() === 'on');
export const watchChosen = createStore<boolean>(mirror() !== null);
const remember = (on: boolean) => { try { localStorage.setItem(WATCH_MIRROR, on ? 'on' : 'off'); } catch { /* private window */ } };
// the script's live check of the contract with Fidelity (src/shared/contract.ts)
export const contract = createStore<Report | null>(null);

const CACHE_KEY = 'dataset';
const TXNS_CACHE_KEY = 'transactions';

// the transactions history the script reads once a day (shared/transactions), kept in IndexedDB like the dataset
export const transactions = createStore<TxnStore | null>(null);
function acceptTxns(json: string): void {
  const store = parseTxnStore(json);
  if (!store) return;
  const cur = transactions.get();
  if (cur && cur.at > store.at) return;
  transactions.set(store);
  void cacheSet(TXNS_CACHE_KEY, json);
}

/** a new copy replaces the shown one unless it is older */
export function accept(json: string, source: Source): boolean {
  const ds = parseDataset(json);
  if (!ds) { dataset.set((s) => ({ ...s, error: t('could not read the data (another version?)') })); return false; }
  const cur = dataset.get();
  if (cur.ds && cur.ds.builtAt > ds.builtAt) return false;
  // the daily history only grows: a copy that lacks it (the sheet, an older script) keeps the one already shown
  // (owner 2026-11-24: the balance chart vanished when the sheet copy of the same time replaced the script's)
  const next = cur.ds?.history ? { ...ds, history: mergeHistory(cur.ds.history, ds.history), historyAt: [cur.ds.historyAt, ds.historyAt].filter(Boolean).sort().pop() } : ds;
  dataset.set({ ds: next, source, error: null });
  void cacheSet(CACHE_KEY, next === ds ? json : JSON.stringify(next));
  return true;
}

const STALE_MS = 5 * 60_000;
/** ask an open Fidelity tab to read the positions now (a read; the command is used once and only for 2 minutes) */
export const requestSync = (): void => { window.postMessage({ type: 'fidelity-accounts:command', mode: 'sync' }, location.origin); };

export function startData(): void {
  window.addEventListener('message', (e) => {
    if (e.origin !== location.origin || !e.data || typeof e.data.json !== 'string') return;
    if (e.data.type === 'fidelity-accounts:dataset') accept(e.data.json, 'userscript');
    if (e.data.type === 'fidelity-accounts:run') {
      try { runState.set(JSON.parse(e.data.json) as RunState); } catch { /* ignore */ }
    }
    if (e.data.type === 'fidelity-accounts:contract') {
      try { contract.set(JSON.parse(e.data.json) as Report); } catch { /* ignore */ }
    }
    if (e.data.type === 'fidelity-accounts:watch') {
      try {
        const w = JSON.parse(e.data.json) as { on?: boolean; chosen?: boolean };
        watching.set(!!w.on);
        if (w.chosen) { watchChosen.set(true); remember(!!w.on); }
      } catch { /* ignore */ }
    }
    if (e.data.type === 'fidelity-accounts:transactions') acceptTxns(e.data.json);
    if (e.data.type === 'fidelity-accounts:login') {
      try { loginSaved.set(!!(JSON.parse(e.data.json) as { saved?: boolean }).saved); } catch { /* ignore */ }
    }
  });
  void cacheGet(CACHE_KEY).then((json) => { if (json && !dataset.get().ds) accept(json, 'cache'); });
  void cacheGet(TXNS_CACHE_KEY).then((json) => { if (json && !transactions.get()) acceptTxns(json); });
  window.postMessage({ type: 'fidelity-accounts:request' }, location.origin);
  window.postMessage({ type: 'fidelity-accounts:hello' }, location.origin);
  // a reload of the viewer asks for fresh positions (owner 2026-11-24: "why its not updating when I do refresh of my
  // app"): when the script is there and the shown copy is older than 5 minutes, an open Fidelity tab reads them
  setTimeout(() => {
    const ds = dataset.get().ds;
    const script = document.documentElement.dataset.fidelityAccountsUserscript;
    if (script && (!ds || Date.now() - Date.parse(ds.builtAt) > STALE_MS)) requestSync();
  }, 1500);
}


export const openFidelity = (): void => { window.open(POSITIONS_URL, 'fidelity-accounts-sync'); };

/** 👀 on: Fidelity opens on Positions (one named tab, reused) and keeps refreshing; off: the tab stops refreshing */
export function setWatch(on: boolean): void {
  window.postMessage({ type: 'fidelity-accounts:watch-set', on }, location.origin);
  watching.set(on);
  watchChosen.set(true);
  remember(on);
  if (on) window.open(POSITIONS_URL, 'fidelity-accounts-sync');
}

export async function importFile(f: File): Promise<void> {
  accept(await f.text(), 'import');
}

