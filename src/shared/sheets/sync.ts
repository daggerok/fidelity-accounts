/// <reference lib="esnext" />
// Dataset -> fidelity_* tabs (used by the viewer and by the userscript, which passes its GM_xmlhttpRequest fetch).
// Accounts and positions are the state now (rewritten), balances_daily is history (upsert by date|account),
// positions_all keeps every field of the site as its own column
import type { Dataset } from '../model';
import type { SheetsClient } from './client';
import { ACCOUNTS, BALANCES, POSITIONS, WIDE_FIRST, WIDE_TAB, growHeader, wideSpec, type BalanceRow, type PositionRow } from './tabs';

/** the day the numbers belong to: the page's "As of Nov-23-2026 ..." when there, else the read's own day */
export function dayOf(ds: Dataset): string {
  const m = /([A-Z][a-z]{2})-(\d{2})-(\d{4})/.exec(ds.asOf ?? '');
  const months = 'JanFebMarAprMayJunJulAugSepOctNovDec';
  if (m && months.indexOf(m[1]!) >= 0) return `${m[3]}-${String(months.indexOf(m[1]!) / 3 + 1).padStart(2, '0')}-${m[2]}`;
  return ds.builtAt.slice(0, 10);
}

export const positionRows = (ds: Dataset): PositionRow[] => ds.positions.map((p) => ({ ...p, asOf: ds.builtAt }));

export const balanceRows = (ds: Dataset): BalanceRow[] => ds.accounts.map((a) => ({
  date: dayOf(ds), account: a.number, name: a.name, balance: a.balance, todayGl: a.todayGl, totalGl: a.totalGl, costBasis: a.costBasis, cash: a.cash,
}));

export const wideRows = (ds: Dataset): Record<string, unknown>[] => ds.positions.map((p) => ({ as_of: ds.builtAt, ...p.fields }));

export async function pushAll(client: SheetsClient, ds: Dataset, log: (line: string) => void): Promise<void> {
  if (!ds.accounts.length && !ds.positions.length) return;
  const a = await client.writeAll(ACCOUNTS, ds.accounts);
  log(`${ACCOUNTS.name}: ${a.written} rows`);
  const p = await client.writeAll(POSITIONS, positionRows(ds));
  log(`${POSITIONS.name}: ${p.written} rows`);
  const b = await client.upsertById(BALANCES, balanceRows(ds));
  log(`${BALANCES.name}: ${b.inserted} new, ${b.updated} updated, ${b.total} rows`);
  const rows = wideRows(ds);
  const keys = Array.from(new Set(rows.reduce<string[]>((all, r) => all.concat(Object.keys(r)), WIDE_FIRST.slice())));
  const header = await client.growTabHeader(WIDE_TAB, keys, growHeader);
  const w = await client.writeAll(wideSpec(header), rows);
  log(`${WIDE_TAB}: ${w.written} rows, ${header.length} columns`);
}
