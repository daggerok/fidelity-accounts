/// <reference lib="esnext" />
// Where the dataset comes from in the viewer: only Google Sheets (one way data flow: Fidelity tab -> sheet -> viewer,
// app/google.ts reads it), kept in IndexedDB of the viewer origin for a fast next visit. The userscript bridge brings
// status only: the last run, the login yes or no, 👀 and the contract report
import { mergeHistory } from '../../shared/history';
import { parseTxnStore, type TxnStore } from '../../shared/transactions';
import { parseDataset, type Dataset } from '../../shared/model';
import { createStore } from '../../shared/store';
import type { Report } from '../../shared/contract';
import { freshNotice, pushNotice, type Notice } from '../../shared/notice';
import { POSITIONS_URL } from '../../userscript/header';
import { cacheGet, cacheSet } from './cache';
import { t } from './i18n';

export type Source = 'sheets' | 'cache';
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
// 🔔 notifications (shared/notice.ts): off by default, kept in the script's storage like 👀, so this switch and the 🔔 of
// the Fidelity panel are one; while on, each notice of the Fidelity tab shows here as a popup
export const notifyOn = createStore<boolean>(false);
export const notices = createStore<Notice[]>([]);
export function setNotify(on: boolean): void {
  window.postMessage({ type: 'fidelity-accounts:notify-set', on }, location.origin);
  notifyOn.set(on);
  if (!on) notices.set([]);
}
export const closeNotice = (n: Notice): void => notices.set(notices.get().filter((x) => x !== n));

const CACHE_KEY = 'dataset';
const TXNS_CACHE_KEY = 'transactions';

// the transactions history the script reads once a day (shared/transactions), from the sheet, kept in IndexedDB too
export const transactions = createStore<TxnStore | null>(null);
export function acceptTxns(json: string): void {
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

/** ask an open Fidelity tab to read the positions now (a read; the command is used once and only for 2 minutes) */
export const requestSync = (): void => { window.postMessage({ type: 'fidelity-accounts:command', mode: 'sync' }, location.origin); };

// settles once the cached copies are restored, read or not (cacheGet answers null on any failure): app/google.ts waits
// for it before choosing between the changed sets and a full read, else a reload with a saved Google sign-in saw no data
// yet and read every set, the whole transactions tab included. Resolved at once where startData never runs (tests)
export const RESTORE_WAIT_MS = 3000;
let restored: Promise<void> = Promise.resolve();
export const cacheRestored = (): Promise<void> => restored;

/** another spreadsheet: the shown copy belongs to the old one, so it goes from the screen and from IndexedDB */
export function clearData(): void {
  dataset.set({ ds: null, source: null, error: null });
  transactions.set(null);
  void cacheSet(CACHE_KEY, null);
  void cacheSet(TXNS_CACHE_KEY, null);
}

export function startData(): void {
  window.addEventListener('message', (e) => {
    if (e.origin !== location.origin || !e.data || typeof e.data.json !== 'string') return;
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
    if (e.data.type === 'fidelity-accounts:notify') {
      try { notifyOn.set(!!(JSON.parse(e.data.json) as { on?: boolean }).on); } catch { /* ignore */ }
    }
    if (e.data.type === 'fidelity-accounts:notice') {
      const n = freshNotice(e.data.json, Date.now());
      if (n && notifyOn.get()) notices.set(pushNotice(notices.get(), n));
    }
    if (e.data.type === 'fidelity-accounts:login') {
      try { loginSaved.set(!!(JSON.parse(e.data.json) as { saved?: boolean }).saved); } catch { /* ignore */ }
    }
  });
  const restore = Promise.all([
    cacheGet(CACHE_KEY).then((json) => { if (json && !dataset.get().ds) accept(json, 'cache'); }),
    cacheGet(TXNS_CACHE_KEY).then((json) => { if (json && !transactions.get()) acceptTxns(json); }),
  ]).then(() => undefined, () => undefined);
  // an IndexedDB that never answers must not hold the Google connection: after RESTORE_WAIT_MS it goes on without the cache
  restored = Promise.race([restore, new Promise<void>((resolve) => { setTimeout(resolve, RESTORE_WAIT_MS); })]);
  window.postMessage({ type: 'fidelity-accounts:request' }, location.origin);
  window.postMessage({ type: 'fidelity-accounts:hello' }, location.origin);
  // a reload of the viewer asks for fresh positions (owner 2026-11-24: "cmd+r doest helped"): when the script is there,
  // an open Fidelity tab presses its own Refresh Positions (a read) and the new copy follows in a few seconds. No age
  // rule: the read time says nothing about Fidelity's numbers, and Fidelity's "As of" label keeps the page load time
  // after Refresh Positions (seen live 2026-11-24), so neither can tell a stale copy
  setTimeout(() => { if (document.documentElement.dataset.fidelityAccountsUserscript) requestSync(); }, 1500);
}


export const openFidelity = (): void => { window.open(POSITIONS_URL, 'fidelity-accounts-sync'); };

function applyWatch(on: boolean): void {
  window.postMessage({ type: 'fidelity-accounts:watch-set', on }, location.origin);
  watching.set(on);
  watchChosen.set(true);
  remember(on);
}

/** 👀 on: Fidelity opens on Positions (one named tab, reused) and keeps refreshing; off: the tab stops refreshing */
export function setWatch(on: boolean): void {
  applyWatch(on);
  if (on) window.open(POSITIONS_URL, 'fidelity-accounts-sync');
}

/**
 * 👀 switched on by the page itself, with no click (App's first data): the browser may block that window, and then 👀
 * would look on and chosen with no Fidelity tab reading. So the window comes first; when it did not open nothing is
 * posted or remembered and a popup asks for the click (no `noopener` here: with it window.open always returns null)
 */
export function autoWatch(): boolean {
  if (!window.open(POSITIONS_URL, 'fidelity-accounts-sync')) {
    notices.set(pushNotice(notices.get(), { at: Date.now(), level: 'error', text: t('The browser blocked the Fidelity window: press 👀 to start watching') }));
    return false;
  }
  applyWatch(true);
  return true;
}
