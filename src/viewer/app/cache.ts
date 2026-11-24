/// <reference lib="esnext" />
// The last dataset in IndexedDB of the viewer origin, so the page shows it at once on the next visit (a dataset with
// every field of ~1000 positions is a few MB: too big for localStorage). Any failure means "no cache"
const DB = 'fidelity-accounts';
const STORE = 'kv';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function cacheGet(key: string): Promise<string | null> {
  try {
    const db = await open();
    return await new Promise((resolve) => {
      const r = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
      r.onsuccess = () => resolve(typeof r.result === 'string' ? r.result : null);
      r.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function cacheSet(key: string, value: string | null): Promise<void> {
  try {
    const db = await open();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      if (value === null) tx.objectStore(STORE).delete(key); else tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch { /* no cache */ }
}
