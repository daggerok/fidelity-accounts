/// <reference lib="esnext" />
// One Google connection for the viewer (code from mykplan-adp src/app/google.ts, pattern google-sheets-in-browser):
// after ☁️ Connect every new dataset is written to the fidelity_* tabs by itself, the token is handed to the
// userscript (the Fidelity tab writes right after a read), ↻ reads the tabs back on another computer
import { parseDataset, DATASET_VERSION, type Dataset } from '../../shared/model';
import { SheetsClient } from '../../shared/sheets/client';
import { GoogleAuth, loadConfig, saveConfig } from '../../shared/sheets/gis';
import { pushAll } from '../../shared/sheets/sync';
import { ACCOUNTS, POSITIONS } from '../../shared/sheets/tabs';
import { createStore } from '../../shared/store';
import { accept, dataset } from './data';
import { t } from './i18n';

export const auth = new GoogleAuth({ config: loadConfig });

export interface SheetsState { connected: boolean; busy: boolean; log: string[]; lastWritten: string | null; error: string | null }
export const sheets = createStore<SheetsState>({ connected: false, busy: false, log: [], lastWritten: null, error: null });

const add = (line: string) => sheets.set((s) => ({ ...s, log: [...s.log.slice(-50), `${new Date().toLocaleTimeString()} ${line}`] }));
const client = () => new SheetsClient({ fetch: window.fetch.bind(window), getToken: auth.getter(), spreadsheetId: loadConfig().spreadsheetId });

export const worthWriting = (ds: Dataset | null, source: string | null): ds is Dataset =>
  !!ds && source !== 'demo' && source !== 'sheets' && (ds.accounts.length > 0 || ds.positions.length > 0);

export async function writeNow(ds: Dataset): Promise<void> {
  if (!loadConfig().spreadsheetId) { sheets.set((s) => ({ ...s, error: t('no spreadsheet: set it in ⚙️ Settings') })); return; }
  sheets.set((s) => ({ ...s, busy: true, error: null }));
  try {
    await pushAll(client(), ds, add);
    sheets.set((s) => ({ ...s, busy: false, lastWritten: ds.builtAt }));
    add(t('written: data read {at}', { at: ds.builtAt.slice(0, 16).replace('T', ' ') }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    sheets.set((s) => ({ ...s, busy: false, error: msg }));
    add(t('failed: {error}', { error: msg }));
  }
}

// the token for the userscript; renewed silently every 10 minutes while connected
export function handOff(): void {
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
    void auth.get(!!tok && tok.expiresAt - Date.now() < 15 * 60 * 1000).then(handOff, (err: unknown) => {
      sheets.set((st) => ({ ...st, error: t('could not renew the Google token: {error}; press ☁️', { error: err instanceof Error ? err.message : String(err) }) }));
    });
  }, 10 * 60 * 1000);
}

export async function connectGoogle(): Promise<void> {
  try {
    await auth.connect();
    sheets.set((s) => ({ ...s, connected: true, error: null }));
    add(t('connected to Google'));
    handOff();
    keepFresh();
    const { ds, source } = dataset.get();
    if (worthWriting(ds, source)) { latest = ds; await drainWrites(); }
  } catch (err) {
    sheets.set((s) => ({ ...s, connected: false, error: err instanceof Error ? err.message : String(err) }));
  }
}

export function disconnectGoogle(): void {
  auth.disconnect();
  window.postMessage({ type: 'fidelity-accounts:google', json: JSON.stringify({ token: '', expiresAt: 0, spreadsheetId: '' }) }, location.origin);
  sheets.set((s) => ({ ...s, connected: false }));
  add(t('disconnected'));
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
    const { ds, source } = dataset.get();
    if (worthWriting(ds, source)) { latest = ds; void drainWrites(); }
    return id;
  } catch (err) {
    sheets.set((s) => ({ ...s, busy: false, error: err instanceof Error ? err.message : String(err) }));
    return null;
  }
}

// one loop writes the newest dataset until it is the one written (mykplan-adp review 2026-11-22)
let latest: Dataset | null = null;
let draining = false;
export async function drainWrites(): Promise<void> {
  if (draining) return;
  draining = true;
  try {
    while (latest && sheets.get().connected && latest.builtAt !== sheets.get().lastWritten) {
      await writeNow(latest);
      if (sheets.get().error) break;
    }
  } finally {
    draining = false;
  }
}
dataset.subscribe(() => {
  const { ds, source } = dataset.get();
  if (!worthWriting(ds, source)) return;
  latest = ds;
  void drainWrites();
});

// connect by itself on load when a client id and a spreadsheet are saved; a blocked Google window waits for the first
// click or key; a declined one is not asked again in this browser session (mykplan-adp autoConnectGoogle)
const DECLINED_KEY = 'fidelity-accounts-google-declined';
const declined = (): boolean => { try { return sessionStorage.getItem(DECLINED_KEY) === '1'; } catch { return false; } };
const markDeclined = (): void => { try { sessionStorage.setItem(DECLINED_KEY, '1'); } catch { /* blocked storage */ } };

export function autoConnectGoogle(doc: Document = document): void {
  const cfg = loadConfig();
  if (!cfg.clientId || !cfg.spreadsheetId || declined() || sheets.get().connected) return;
  const onGesture = () => {
    doc.removeEventListener('pointerdown', onGesture, true);
    doc.removeEventListener('keydown', onGesture, true);
    if (sheets.get().connected || declined()) return;
    void connectGoogle().then(() => { if (!sheets.get().connected) markDeclined(); });
  };
  void connectGoogle().then(() => {
    if (sheets.get().connected) { void loadIfEmpty(); return; }
    sheets.set((s) => ({ ...s, error: null }));
    doc.addEventListener('pointerdown', onGesture, true);
    doc.addEventListener('keydown', onGesture, true);
  });
}

// another computer without the script: nothing shown yet, so read the sheet once after connecting
async function loadIfEmpty(): Promise<void> {
  if (!dataset.get().ds) await loadFromSheets();
}

/** ↻ the fidelity_accounts and fidelity_positions tabs back into the viewer */
export async function loadFromSheets(): Promise<void> {
  if (!loadConfig().spreadsheetId || !sheets.get().connected) return;
  sheets.set((s) => ({ ...s, busy: true, error: null }));
  try {
    const c = client();
    const [accounts, rows] = await Promise.all([c.readRows(ACCOUNTS), c.readRows(POSITIONS)]);
    const builtAt = rows.reduce((m, r) => (r.asOf > m ? r.asOf : m), accounts.reduce((m, a) => (a.asOf > m ? a.asOf : m), ''));
    const positions = rows.map(({ asOf: _asOf, ...p }) => p);
    const ds = parseDataset(JSON.stringify({ version: DATASET_VERSION, builtAt: builtAt || new Date().toISOString(), asOf: null, accounts, positions, warnings: [] }));
    if (ds && (accounts.length || positions.length)) accept(JSON.stringify(ds), 'sheets');
    sheets.set((s) => ({ ...s, busy: false }));
    add(t('loaded from the sheet: {accounts} accounts, {positions} positions', { accounts: accounts.length, positions: positions.length }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    sheets.set((s) => ({ ...s, busy: false, error: msg }));
    add(t('load failed: {error}', { error: msg }));
  }
}
