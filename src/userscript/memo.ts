/// <reference lib="esnext" />
// The last parse of one stored value, keyed by the raw string (review 2026-11-25: runDue parsed the 3 MB dataset twice
// and the transactions store once every 5 minutes on every open portfolio page, even with nothing due). The same string
// gives back the same object, so its users must treat it as read only (main.ts: none of them changes it, they spread or
// filter into new objects). A string that differs, or a write that never landed in storage, simply parses again
export interface RawMemo<T> {
  get: (raw: string) => T;
  /** the object the script just built and stored as `raw`: only when parsing `raw` would give an equal object */
  prime: (raw: string, value: T) => void;
}

export function memoByRaw<T>(parse: (raw: string) => T): RawMemo<T> {
  let last: { raw: string; value: T } | null = null;
  return {
    get: (raw) => {
      if (last && last.raw === raw) return last.value;
      const value = parse(raw);
      last = { raw, value };
      return value;
    },
    prime: (raw, value) => { last = { raw, value }; },
  };
}
