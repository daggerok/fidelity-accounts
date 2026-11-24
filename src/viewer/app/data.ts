/// <reference lib="esnext" />
// Where the dataset comes from in the viewer: the userscript bridge (window message 'fidelity-accounts:dataset'),
// Google Sheets (↻), Import JSON, the demo, and IndexedDB of the viewer origin for the next visit
import { parseDataset, type Dataset } from '../../shared/model';
import { sampleDataset } from '../../shared/sample';
import { createStore } from '../../shared/store';
import { POSITIONS_URL } from '../../userscript/header';
import { cacheGet, cacheSet } from './cache';
import { t } from './i18n';

export type Source = 'userscript' | 'sheets' | 'import' | 'cache' | 'demo';
export interface DataState { ds: Dataset | null; source: Source | null; error: string | null }
export const dataset = createStore<DataState>({ ds: null, source: null, error: null });

// the last read in the Fidelity tab: { status, at, accounts, positions, message }
export interface RunState { status: string; at: number; accounts?: number; positions?: number; message?: string | null }
export const runState = createStore<RunState | null>(null);
// a Fidelity login saved in the script (only "yes or no" crosses the bridge, never the login itself)
export const loginSaved = createStore<boolean | null>(null);

const CACHE_KEY = 'dataset';

/** a new copy replaces the shown one unless it is older (the demo never goes to the cache) */
export function accept(json: string, source: Source): boolean {
  const ds = parseDataset(json);
  if (!ds) { dataset.set((s) => ({ ...s, error: t('could not read the data (another version?)') })); return false; }
  const cur = dataset.get();
  if (cur.ds && cur.source !== 'demo' && source !== 'demo' && cur.ds.builtAt > ds.builtAt) return false;
  dataset.set({ ds, source, error: null });
  if (source !== 'demo') void cacheSet(CACHE_KEY, json);
  return true;
}

export function startData(): void {
  window.addEventListener('message', (e) => {
    if (e.origin !== location.origin || !e.data || typeof e.data.json !== 'string') return;
    if (e.data.type === 'fidelity-accounts:dataset') accept(e.data.json, 'userscript');
    if (e.data.type === 'fidelity-accounts:run') {
      try { runState.set(JSON.parse(e.data.json) as RunState); } catch { /* ignore */ }
    }
    if (e.data.type === 'fidelity-accounts:login') {
      try { loginSaved.set(!!(JSON.parse(e.data.json) as { saved?: boolean }).saved); } catch { /* ignore */ }
    }
  });
  void cacheGet(CACHE_KEY).then((json) => { if (json && !dataset.get().ds) accept(json, 'cache'); });
  window.postMessage({ type: 'fidelity-accounts:request' }, location.origin);
  window.postMessage({ type: 'fidelity-accounts:hello' }, location.origin);
}

/** ⬇ Sync: the script reads the Positions page in a Fidelity tab (one named tab, reused) */
export function askSync(): void {
  window.postMessage({ type: 'fidelity-accounts:command', mode: 'sync' }, location.origin);
  window.open(POSITIONS_URL, 'fidelity-accounts-sync');
}

export const openFidelity = (): void => { window.open(POSITIONS_URL, 'fidelity-accounts-sync'); };

export async function importFile(f: File): Promise<void> {
  accept(await f.text(), 'import');
}

export function showDemo(): void {
  accept(JSON.stringify(sampleDataset(new Date())), 'demo');
}

export function clearDemo(): void {
  dataset.set({ ds: null, source: null, error: null });
  void cacheGet(CACHE_KEY).then((json) => { if (json) accept(json, 'cache'); });
}
