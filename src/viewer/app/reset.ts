/// <reference lib="esnext" />
// Full reset (owner 2026-11-23): everything this app keeps in this browser goes, the Google setup included: the Client
// ID and the spreadsheet, the Google connection, the cached data, the view. The script is asked to forget its copy of
// the data and the Google token; the Fidelity login stays where the owner manages it (🔑 on Fidelity)
import { clearConfig } from '../../shared/sheets/gis';
import { disconnectGoogle } from './google';

export const PREFIX = 'fidelity-accounts';

export function appKeys(storage: Pick<Storage, 'length' | 'key'>): string[] {
  const out: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i);
    if (k && k.startsWith(PREFIX)) out.push(k);
  }
  return out;
}

export async function fullReset(reload: () => void = () => location.reload()): Promise<void> {
  try { disconnectGoogle(); } catch { /* not connected */ }
  clearConfig();
  window.postMessage({ type: 'fidelity-accounts:forget' }, location.origin);
  [globalThis.localStorage, globalThis.sessionStorage].forEach((s) => {
    try { if (s) appKeys(s).forEach((k) => s.removeItem(k)); } catch { /* blocked storage */ }
  });
  await new Promise<void>((resolve) => {
    try {
      const req = indexedDB.deleteDatabase(PREFIX);
      req.onsuccess = req.onerror = req.onblocked = () => resolve();
    } catch { resolve(); }
  });
  reload();
}
