/// <reference lib="esnext" />
// Two people, one browser (owner 2026-11-26: "we must support her accounts and mine"): the stored copy holds the
// accounts of every Fidelity login that was read here, and the viewer shows them together. The API reads (daily values,
// transactions) can only ask for the accounts of the login that is signed in now, which are the ones in the page's
// account list. So each account keeps the time of its own last read, and a page reads what is due among its accounts
import type { Account } from '../shared/model';

export const READS_KEY = 'fidelity-accounts.readsAt'; // ReadsAt as an object
export type ReadKind = 'history' | 'txns';
export type ReadsAt = Record<string, Partial<Record<ReadKind, string>>>;

/** the stored accounts of the login on this page: those in its account list; none while the list is not there */
export function accountsHere(stored: readonly Account[], sidebar: ReadonlyArray<{ number: string }>): Account[] {
  const shown = new Set(sidebar.map((s) => s.number));
  return stored.filter((a) => shown.has(a.number));
}

/** stored times read back: anything malformed reads as none (then everything is due) */
export function readsOf(raw: unknown): ReadsAt {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: ReadsAt = {};
  Object.keys(raw).forEach((n) => {
    const v = (raw as Record<string, unknown>)[n];
    if (!v || typeof v !== 'object') return;
    const one: Partial<Record<ReadKind, string>> = {};
    (['history', 'txns'] as const).forEach((k) => { const t = (v as Record<string, unknown>)[k]; if (typeof t === 'string' && !Number.isNaN(Date.parse(t))) one[k] = t; });
    out[n] = one;
  });
  return out;
}

/** the oldest last read among these accounts; undefined when one of them was never read (it is due) or there are none */
export function oldestRead(reads: ReadsAt, accounts: readonly Account[], kind: ReadKind): string | undefined {
  const times = accounts.map((a) => reads[a.number]?.[kind]);
  if (!times.length || times.some((t) => !t)) return undefined;
  return (times as string[]).slice().sort((a, b) => Date.parse(a) - Date.parse(b))[0];
}

/** these accounts were read now; the others keep their times */
export function markRead(reads: ReadsAt, accounts: readonly Account[], kind: ReadKind, at: string): ReadsAt {
  const out: ReadsAt = { ...reads };
  accounts.forEach((a) => { out[a.number] = { ...out[a.number], [kind]: at }; });
  return out;
}
