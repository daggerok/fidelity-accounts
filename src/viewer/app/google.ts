/// <reference lib="esnext" />
// One Google connection for the viewer (code from mykplan-adp src/app/google.ts, pattern google-sheets-in-browser).
// One way data flow (shared/sheets/sync.ts): the viewer never writes the data tabs, it hands its token to the userscript
// (the Fidelity tab is the only writer) and reads the sheet: every data set after ☁️ Connect, then the sets that
// fidelity_updates marks newer. The sheet is watched with a small read of fidelity_updates every 10 minutes while the page
// is visible (Google sends no change events to a browser) and at once when the script signals a write
import { SheetsClient } from '../../shared/sheets/client';
import { GoogleAuth, authFailed, loadConfig, parseSpreadsheetId, saveConfig } from '../../shared/sheets/gis';
import { DATA_SETS, changedSets, datasetFromTabs, parseSignal, readSets, readUpdates, txnStoreFromTabs, type DataSet } from '../../shared/sheets/sync';
import { createStore } from '../../shared/store';
import { accept, acceptTxns, cacheRestored, clearData, dataset, requestSync } from './data';
import { t } from './i18n';

export const auth = new GoogleAuth({ config: loadConfig });

// The Google sign-in is kept until the token expires (owner 2026-11-23: "google sso should be kept until its expired
// then we will have to reconnect"): the access token (about 1 hour, scope spreadsheets) and its expiry live in
// localStorage, so a reload reconnects with no Google window. Disconnect and Full reset remove it. A deviation from the
// google-sheets-in-browser pattern (token in memory only), on the owner's request
export const TOKEN_KEY = 'fidelity-accounts-google-token';
function saveToken(): void {
  const tok = auth.peek();
  try { if (tok) localStorage.setItem(TOKEN_KEY, JSON.stringify(tok)); } catch { /* private window: memory only */ }
}
function savedToken(): { value: string; expiresAt: number } | null {
  try {
    const t = JSON.parse(localStorage.getItem(TOKEN_KEY) ?? 'null') as { value?: string; expiresAt?: number } | null;
    return t && typeof t.value === 'string' && typeof t.expiresAt === 'number' ? { value: t.value, expiresAt: t.expiresAt } : null;
  } catch { return null; }
}
const dropToken = (): void => { try { localStorage.removeItem(TOKEN_KEY); } catch { /* blocked storage */ } };

export interface SheetsState { connected: boolean; busy: boolean; log: string[]; lastWritten: string | null; error: string | null }
export const sheets = createStore<SheetsState>({ connected: false, busy: false, log: [], lastWritten: null, error: null });

const add = (line: string) => sheets.set((s) => ({ ...s, log: [...s.log.slice(-50), `${new Date().toLocaleTimeString()} ${line}`] }));
const client = () => new SheetsClient({ fetch: window.fetch.bind(window), getToken: auth.getter(), spreadsheetId: loadConfig().spreadsheetId });

// the token for the userscript; renewed silently every 10 minutes while connected
export function handOff(): void {
  saveToken();
  const tok = auth.peek();
  const spreadsheetId = loadConfig().spreadsheetId;
  if (!tok || !spreadsheetId) return;
  window.postMessage({ type: 'fidelity-accounts:google', json: JSON.stringify({ token: tok.value, expiresAt: tok.expiresAt, spreadsheetId }) }, location.origin);
}
let renewTimer: ReturnType<typeof setInterval> | null = null;
function keepFresh(): void {
  if (renewTimer) return;
  renewTimer = setInterval(() => {
    if (!sheets.get().connected) return;
    const tok = auth.peek();
    // a failed renew means the sign-in is gone: ☁️ comes back in the navbar (it shows only while not connected), so the
    // "press ☁️" of the banner has a button to press
    void auth.get(!!tok && tok.expiresAt - Date.now() < 15 * 60 * 1000).then(handOff, (err: unknown) => {
      sheets.set((st) => ({ ...st, connected: false, error: t('could not renew the Google token: {error}; press ☁️', { error: err instanceof Error ? err.message : String(err) }) }));
    });
  }, 10 * 60 * 1000);
}

export async function connectGoogle(): Promise<void> {
  try {
    await auth.connect();
    // the "consented once" mark: the next connects of this browser ask Google silently, no consent screen again
    if (!loadConfig().email) saveConfig({ email: 'consented' });
    await connected(t('connected to Google'));
  } catch (err) {
    sheets.set((s) => ({ ...s, connected: false, error: err instanceof Error ? err.message : String(err) }));
  }
}

async function connected(line: string): Promise<void> {
  try {
    // the cached copy first (main.tsx starts both at once): with a saved sign-in this runs before IndexedDB answers, saw
    // no data and read every set on each reload; waiting before `connected: true` also keeps App's auto 👀 from seeing
    // "connected, no data" in between
    await cacheRestored();
    sheets.set((s) => ({ ...s, connected: true, error: null }));
    add(line);
    handOff();
    keepFresh();
    watchSheet();
    // connected = the data comes by itself (owner 2026-11-23: "without any other clicks"): the sets changed since the
    // cached copy, or every set when nothing is shown yet
    if (dataset.get().ds && Object.keys(seen).length) await checkSheet();
    else await loadFromSheets();
  } catch (err) {
    sheets.set((s) => ({ ...s, connected: false, error: err instanceof Error ? err.message : String(err) }));
  }
}

export function disconnectGoogle(): void {
  auth.disconnect();
  dropToken();
  window.postMessage({ type: 'fidelity-accounts:google', json: JSON.stringify({ token: '', expiresAt: 0, spreadsheetId: '' }) }, location.origin);
  sheets.set((s) => ({ ...s, connected: false }));
  add(t('disconnected'));
}

// a failed Sheets read: a lost sign-in turns ☁️ back on; anything else (offline) only shows, the next good check clears it
function readFailed(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (authFailed(err)) sheets.set((s) => ({ ...s, busy: false, connected: false, error: t('Google sign-in needed: {error}; press ☁️', { error: msg }) }));
  else sheets.set((s) => ({ ...s, busy: false, error: t('could not read the sheet: {error}', { error: msg }) }));
  return msg;
}

/**
 * Another spreadsheet confirmed in Get started (the field left or Enter): the shown data and the read marks belong to
 * the old one, so both go, every set is read from the new one and the userscript gets the new id once. The same id
 * again does nothing; an empty or unusable value clears the id (as typing it did before)
 */
export function switchSpreadsheet(value: string): boolean {
  const id = parseSpreadsheetId(value);
  if (id === loadConfig().spreadsheetId) return false;
  saveConfig({ spreadsheetId: id });
  generation += 1;
  seen = {};
  saveSeen();
  handOff();
  // a read of the old sheet still running ends dropped and no longer clears `busy`: this line does, the new read sets it
  sheets.set((s) => ({ ...s, busy: false }));
  if (id) { clearData(); void loadFromSheets(); }
  return true;
}

/** Get started: a new spreadsheet in the owner's Drive, its id saved at once */
export async function createSpreadsheet(): Promise<string | null> {
  if (!sheets.get().connected) await connectGoogle();
  if (!sheets.get().connected) return null;
  sheets.set((s) => ({ ...s, busy: true, error: null }));
  try {
    const c = new SheetsClient({ fetch: window.fetch.bind(window), getToken: auth.getter(), spreadsheetId: '' });
    const { id } = await c.createSpreadsheet('fidelity-accounts');
    saveConfig({ spreadsheetId: id });
    sheets.set((s) => ({ ...s, busy: false }));
    add(t('created a spreadsheet'));
    handOff();
    // the new sheet fills from the Fidelity tab: ask it for a read now
    requestSync();
    return id;
  } catch (err) {
    sheets.set((s) => ({ ...s, busy: false, error: err instanceof Error ? err.message : String(err) }));
    return null;
  }
}

// connect by itself on load when a client id and a spreadsheet are saved; a blocked Google window waits for the first
// click or key; a declined one is not asked again in this browser session (mykplan-adp autoConnectGoogle)
const DECLINED_KEY = 'fidelity-accounts-google-declined';
const declined = (): boolean => { try { return sessionStorage.getItem(DECLINED_KEY) === '1'; } catch { return false; } };
const markDeclined = (): void => { try { sessionStorage.setItem(DECLINED_KEY, '1'); } catch { /* blocked storage */ } };

export function autoConnectGoogle(doc: Document = document): void {
  const cfg = loadConfig();
  if (!cfg.clientId || !cfg.spreadsheetId || sheets.get().connected) return;
  // a saved token that has not expired: connected at once, no Google window
  const saved = savedToken();
  if (saved && auth.restore(saved)) { void connected(t('connected to Google (saved sign-in)')); return; }
  dropToken();
  if (declined()) return;
  const onGesture = () => {
    doc.removeEventListener('pointerdown', onGesture, true);
    doc.removeEventListener('keydown', onGesture, true);
    if (sheets.get().connected || declined()) return;
    void connectGoogle().then(() => { if (!sheets.get().connected) markDeclined(); });
  };
  void connectGoogle().then(() => {
    if (sheets.get().connected) return;
    sheets.set((s) => ({ ...s, error: null }));
    doc.addEventListener('pointerdown', onGesture, true);
    doc.addEventListener('keydown', onGesture, true);
  });
}


// the time of each set in fidelity_updates when it was last read here, kept with the cached data so a reload reads
// only what changed meanwhile; `again`: a check came while a read ran
export const SEEN_KEY = 'fidelity-accounts-sheet-seen';
const loadSeen = (): Partial<Record<DataSet, string>> => { try { return JSON.parse(localStorage.getItem(SEEN_KEY) ?? '{}') as Partial<Record<DataSet, string>>; } catch { return {}; } };
const saveSeen = (): void => { try { localStorage.setItem(SEEN_KEY, JSON.stringify(seen)); } catch { /* private window */ } };
let seen: Partial<Record<DataSet, string>> = typeof localStorage === 'undefined' ? {} : loadSeen();
let again = false;
// bumped on a switch of the spreadsheet: a read of the old one that ends later is dropped
let generation = 0;

/** ↻ read data sets from the sheet into the viewer (all of them by default) */
export async function loadFromSheets(sets: readonly DataSet[] = DATA_SETS): Promise<void> {
  if (!loadConfig().spreadsheetId || !sheets.get().connected || !sets.length) return;
  sheets.set((s) => ({ ...s, busy: true, error: null }));
  const gen = generation;
  try {
    const c = client();
    // the marks first: a write that lands during this read is picked up by the next check
    const marks = await readUpdates(c).catch(() => ({} as Partial<Record<DataSet, string>>));
    const tabs = await readSets(c, sets);
    if (gen !== generation) return;
    const ds = datasetFromTabs(dataset.get().ds, tabs);
    // datasetFromTabs already checked the copy (parseDataset): handed over as it is, made JSON once for the cache only
    if (ds) accept(ds, 'sheets');
    if (tabs.txns && tabs.synced) { const store = txnStoreFromTabs(tabs.txns, tabs.synced); if (store) acceptTxns(store); }
    sets.forEach((d) => { if (marks[d]) seen[d] = marks[d]; });
    saveSeen();
    sheets.set((s) => ({ ...s, busy: false }));
    add(t('loaded from the sheet: {sets}', { sets: sets.join(', ') }));
  } catch (err) {
    if (gen !== generation) return;
    add(t('load failed: {error}', { error: readFailed(err) }));
  }
  if (again) { again = false; void checkSheet(); }
}

/** read fidelity_updates and load the sets newer than the ones shown */
export async function checkSheet(): Promise<void> {
  if (!loadConfig().spreadsheetId || !sheets.get().connected) return;
  if (sheets.get().busy) { again = true; return; }
  let marks: Partial<Record<DataSet, string>>;
  // a missing fidelity_updates (an older script) reads as empty in readTab, so whatever fails here is real: shown, and a
  // lost sign-in turns ☁️ back on
  try { marks = await readUpdates(client()); } catch (err) { add(t('check failed: {error}', { error: readFailed(err) })); return; }
  sheets.set((s) => (s.error ? { ...s, error: null } : s));
  const changed = changedSets(marks, seen);
  if (changed.length) await loadFromSheets(changed);
}

export const CHECK_EVERY_MS = 10 * 60_000; // rare (owner 2026-11-24: "very not often" polling when no signal comes)
let watchTimer: ReturnType<typeof setInterval> | null = null;
function watchSheet(): void {
  if (watchTimer || typeof window === 'undefined') return;
  watchTimer = setInterval(() => { if (document.visibilityState === 'visible') void checkSheet(); }, CHECK_EVERY_MS);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void checkSheet(); });
  // the script's signal after a write in the Fidelity tab of this computer: check at once
  window.addEventListener('message', (e) => {
    if (e.origin === location.origin && e.data?.type === 'fidelity-accounts:sheets' && parseSignal(e.data.json)) void checkSheet();
  });
}
