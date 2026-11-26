/// <reference lib="esnext" />
// The last dataset in IndexedDB of the viewer origin, so the page shows it at once on the next visit (a dataset with
// every field of ~1000 positions is a few MB: too big for localStorage). Any failure means "no cache"
const DB = 'fidelity-accounts';
const STORE = 'kv';

// One connection for every read and write (each call opened a new one and never closed it), opened on first use and
// forgotten when it fails or closes: the browser closing it, or another tab asking for a newer version (we close ours
// then, so that tab is not blocked); the next call opens it again
let shared: Promise<IDBDatabase> | null = null;
const forget = (p: Promise<IDBDatabase>): void => { if (shared === p) shared = null; };

function open(): Promise<IDBDatabase> {
  if (shared) return shared;
  const p: Promise<IDBDatabase> = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => {
      const db = req.result;
      db.onclose = () => forget(p);
      db.onversionchange = () => { db.close(); forget(p); };
      resolve(db);
    };
    req.onerror = () => reject(req.error);
  });
  shared = p;
  p.catch(() => forget(p));
  return p;
}

export async function cacheGet(key: string): Promise<string | null> {
  const p = open();
  try {
    const db = await p;
    return await new Promise((resolve) => {
      const r = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
      r.onsuccess = () => resolve(typeof r.result === 'string' ? r.result : null);
      r.onerror = () => resolve(null);
    });
  } catch {
    forget(p);
    return null;
  }
}

export async function cacheSet(key: string, value: string | null): Promise<void> {
  const p = open();
  try {
    const db = await p;
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      if (value === null) tx.objectStore(STORE).delete(key); else tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    forget(p); // no cache
  }
}
