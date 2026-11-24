/// <reference lib="esnext" />
// Where the dataset comes from in the viewer: the userscript bridge (window message 'fidelity-accounts:dataset'),
// Google Sheets (↻), Import JSON, and IndexedDB of the viewer origin for the next visit
import { parseDataset, type Dataset } from '../../shared/model';
import { createStore } from '../../shared/store';
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
// 👀 Watch on or off (kept in the script's storage, so the Fidelity tab and every viewer tab agree)
export const watching = createStore<boolean>(false);

const CACHE_KEY = 'dataset';

/** a new copy replaces the shown one unless it is older */
export function accept(json: string, source: Source): boolean {
  const ds = parseDataset(json);
  if (!ds) { dataset.set((s) => ({ ...s, error: t('could not read the data (another version?)') })); return false; }
  const cur = dataset.get();
  if (cur.ds && cur.ds.builtAt > ds.builtAt) return false;
  dataset.set({ ds, source, error: null });
  void cacheSet(CACHE_KEY, json);
  return true;
}

export function startData(): void {
  window.addEventListener('message', (e) => {
    if (e.origin !== location.origin || !e.data || typeof e.data.json !== 'string') return;
    if (e.data.type === 'fidelity-accounts:dataset') accept(e.data.json, 'userscript');
    if (e.data.type === 'fidelity-accounts:run') {
      try { runState.set(JSON.parse(e.data.json) as RunState); } catch { /* ignore */ }
    }
    if (e.data.type === 'fidelity-accounts:watch') {
      try { watching.set(!!(JSON.parse(e.data.json) as { on?: boolean }).on); } catch { /* ignore */ }
    }
    if (e.data.type === 'fidelity-accounts:login') {
      try { loginSaved.set(!!(JSON.parse(e.data.json) as { saved?: boolean }).saved); } catch { /* ignore */ }
    }
  });
  void cacheGet(CACHE_KEY).then((json) => { if (json && !dataset.get().ds) accept(json, 'cache'); });
  window.postMessage({ type: 'fidelity-accounts:request' }, location.origin);
  window.postMessage({ type: 'fidelity-accounts:hello' }, location.origin);
}


export const openFidelity = (): void => { window.open(POSITIONS_URL, 'fidelity-accounts-sync'); };

/** 👀 on: Fidelity opens on Positions (one named tab, reused) and keeps refreshing; off: the tab stops refreshing */
export function setWatch(on: boolean): void {
  window.postMessage({ type: 'fidelity-accounts:watch-set', on }, location.origin);
  watching.set(on);
  if (on) window.open(POSITIONS_URL, 'fidelity-accounts-sync');
}

export async function importFile(f: File): Promise<void> {
  accept(await f.text(), 'import');
}

