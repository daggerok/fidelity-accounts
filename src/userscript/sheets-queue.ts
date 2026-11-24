/// <reference lib="esnext" />
// The Fidelity tab's queue of sheet writes by data set: a set asked while a write runs waits for the next round, the
// newest copy is written (the writer reads the stored copies itself), one write at a time. Without a usable Google
// token or after a failure the sets stay queued until `retry` (a new token from the viewer, the next read)
import type { DataSet } from '../shared/sheets/sync';

export interface SheetsQueue { add: (sets: readonly DataSet[]) => Promise<void>; retry: () => Promise<void>; pending: () => DataSet[] }

export function createSheetsQueue(o: { ready: () => boolean; write: (sets: DataSet[]) => Promise<void>; waiting: () => void; failed: (err: unknown) => void }): SheetsQueue {
  const queued = new Set<DataSet>();
  let busy = false;
  const run = async (): Promise<void> => {
    if (busy) return;
    busy = true;
    try {
      while (queued.size) {
        if (!o.ready()) { o.waiting(); break; }
        const sets = Array.from(queued);
        queued.clear();
        try {
          await o.write(sets);
        } catch (err) {
          sets.forEach((s) => queued.add(s));
          o.failed(err);
          break;
        }
      }
    } finally {
      busy = false;
    }
  };
  return {
    add: (sets) => { sets.forEach((s) => queued.add(s)); return run(); },
    retry: run,
    pending: () => Array.from(queued),
  };
}
