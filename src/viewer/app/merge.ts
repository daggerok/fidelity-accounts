/// <reference lib="esnext" />
// Merge (owner 2026-11-25): with several accounts shown, one line per ticker instead of one block per account, "so it will
// be easier to filter / sort and maybe later we will implement functionality export watch list". Every field of a position
// has a merge kind, chosen next to its definition (PROPERTY_MERGE below, FIELD_COLUMNS in position-columns.ts, COLUMNS in
// ui/Positions.tsx), so a new field or column cannot come without one:
// - sum: a dollar amount or a share count that grows with the shares held ("Today's $ should have sum of all Today's $
//   for all accounts. same for total. cost bases, value, quantity, also should be sum", "est income aggregated"); DRIP and
//   DRIP $ too, each account's own number added up (MergedPosition.drip)
// - recomputed: a percent or a per-share figure worked out again from the summed parts, never averaged ("% of account
//   should be aggregated, meaning for all 3 accts in total how much % this ticker is weighed")
// - static: the same for the ticker in every account, the first value given ("last price is the same", "Dist rate, sec
//   yield are static", "frequency, marketcap, 52-week, ex-date, pay day, sector - static")
// - agree: shown only when every account gives the same value, empty when they differ (an account setting or flag)
// - any: a flag that is on when it is on in any account ("loaned should show yes if loaned in any account"); off, or empty,
//   as one account shows it, when none has it on
// - blank: no meaning across accounts (the account type)
import type { Account, Position } from '../../shared/model';
import { dripGap, symbolDrip, type Drip } from './derive';
import { FIELD_COLUMNS } from './position-columns';
import type { MainTab } from './prefs';

export type MergeKind = 'sum' | 'static' | 'recomputed' | 'agree' | 'any' | 'blank';
export const MERGE_KINDS: readonly MergeKind[] = ['sum', 'static', 'recomputed', 'agree', 'any', 'blank'];

/**
 * A merged line: one ticker over the shown accounts, with the accounts that hold it (for a later watch list export), and
 * its DRIP: DRIP runs inside each account, so the line adds up each account's own DRIP and DRIP $ (dripGap as on its own
 * row), like the gains (owner 2026-11-25: "when we have merge, we want to aggregate drips similarly like we do for
 * gains"), never a DRIP of the summed shares
 */
export type MergedPosition = Position & { accounts: string[]; drip: Drip | null };

type Prop = Exclude<keyof Position, 'fields'>;
/** every field of the model, required: a new one in shared/model.ts does not type-check here until it has a kind */
export const PROPERTY_MERGE: { [K in Prop]-?: MergeKind } = {
  account: 'agree', // the account when every row is of one account, else empty: `accounts` lists them
  kind: 'static', symbol: 'static', description: 'static', cusip: 'static', securityType: 'static', securitySubType: 'static',
  quantity: 'sum', currentValue: 'sum', todayGl: 'sum', totalGl: 'sum', costBasisTotal: 'sum', estAnnualIncome: 'sum',
  todayGlPct: 'recomputed', totalGlPct: 'recomputed', costBasisPerShare: 'recomputed', percentOfAccount: 'recomputed',
  lastPrice: 'static', lastPriceChange: 'static', lastPriceChangePct: 'static', distRate: 'static', secYield: 'static',
  dividendAmount: 'static', paymentFrequency: 'static', exDate: 'static', payDate: 'static', marketCap: 'static',
  marketCapText: 'static', sector: 'static', industry: 'static', low52: 'static', high52: 'static',
};

/** the raw grid fields behind the summed and recomputed properties (shared/parse.ts) */
export const RAW_OF: Record<string, Prop> = {
  qty: 'quantity', curVal: 'currentValue', todGL: 'todayGl', todGLPct: 'todayGlPct', totGL: 'totalGl', totGLPct: 'totalGlPct',
  cstBasTot: 'costBasisTotal', cstBasShr: 'costBasisPerShare', actPer: 'percentOfAccount', estAnuInc: 'estAnnualIncome',
};
// fields the Positions cells read besides the columns' own (position-columns.ts): the day's range and the news headline
const HELPER_FIELDS: Record<string, MergeKind> = { dayRange_low: 'static', dayRange_high: 'static', text: 'static' };
/** the kind of every raw field: a column's field and the field it sorts by take the column's kind; any other field is
 * kept only when every account agrees (nothing shows it, and one account's value must not pass for all of them) */
export const FIELD_MERGE: Record<string, MergeKind> = (() => {
  const out: Record<string, MergeKind> = { ...HELPER_FIELDS };
  FIELD_COLUMNS.forEach((c) => { out[c.field] = c.merge; if (c.sortBy) out[c.sortBy] = c.merge; });
  Object.keys(RAW_OF).forEach((f) => { out[f] = PROPERTY_MERGE[RAW_OF[f]!]; });
  return out;
})();
export const fieldMerge = (field: string): MergeKind => FIELD_MERGE[field] ?? 'agree';

/** merge applies only with more than one account shown; with one the table stays as it is */
export const mergeOn = (merge: boolean, shownAccounts: number): boolean => merge && shownAccounts > 1;

/** the merge switch next to the Positions tab: flips the choice and opens Positions, so a click on Summary shows its result */
export const toggleMerge = (p: { merge: boolean }): { merge: boolean; tab: MainTab } => ({ merge: !p.merge, tab: 'positions' });

type Value = string | number | boolean;
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const given = (v: unknown): boolean => v !== undefined && v !== null && v !== '';
// a sum of floats rounded to 6 places, so 0.1 + 0.2 filters as 0.3
const round6 = (x: number): number => Math.round(x * 1e6) / 1e6;
const sumOf = (vs: unknown[]): number | undefined => { const ns = vs.filter(isNum); return ns.length ? round6(ns.reduce((s, n) => s + n, 0)) : undefined; };
const firstOf = <T>(vs: T[]): T | undefined => vs.find(given);
// a flag of the grid is a boolean (shared/parse.ts keeps the cell's boolean val); the 'flag' columns show only true
const anyOf = <T>(vs: T[]): T | true | undefined => (vs.some((v) => v === true) ? true : firstOf(vs));
const agreed = <T>(vs: T[]): T | undefined => { const g = vs.filter(given); return g.length === vs.length && g.every((v) => v === g[0]) ? g[0] : undefined; };
const ratio = (top: number, bottom: number, k = 1): number | undefined => (bottom > 0 && Number.isFinite(top) ? round6((top / bottom) * k) : undefined);

/**
 * The positions of the shown accounts, one per ticker (and per kind: cash and pending activity merge among themselves),
 * in the order each ticker first comes. A ticker of one account keeps its own row, only its % of account is worked out
 * again over all the shown accounts
 */
export function mergePositions(positions: Position[], accounts: Account[]): MergedPosition[] {
  // the base of % of account: what all the shown accounts are worth together (their balances, as the total row shows);
  // the positions' own values when no balance is known
  const balances = accounts.reduce((s, a) => s + (isNum(a.balance) ? a.balance : 0), 0);
  const base = balances > 0 ? balances : positions.reduce((s, p) => s + (isNum(p.currentValue) ? p.currentValue : 0), 0);
  const groups = new Map<string, Position[]>();
  positions.forEach((p) => { const k = `${p.kind}|${p.symbol}`; const g = groups.get(k); if (g) g.push(p); else groups.set(k, [p]); });
  const out: MergedPosition[] = [];
  groups.forEach((rows) => out.push(mergeGroup(rows, base)));
  return out;
}

function mergeGroup(rows: Position[], base: number): MergedPosition {
  const accounts = rows.map((p) => p.account).filter((a, i, all) => all.indexOf(a) === i);
  const percentOfAccount = (value: number | undefined) => (value === undefined ? undefined : ratio(value, base, 100));
  if (rows.length === 1) {
    const p = rows[0]!;
    const pct = percentOfAccount(p.currentValue);
    const fields = { ...p.fields };
    if (pct === undefined) delete fields.actPer; else if ('actPer' in fields) fields.actPer = pct;
    const own: MergedPosition = { ...p, percentOfAccount: pct, fields, accounts, drip: dripGap(p) };
    if (pct === undefined) delete own.percentOfAccount;
    return own;
  }
  const m: Record<string, unknown> = {};
  (Object.keys(PROPERTY_MERGE) as Prop[]).forEach((k) => {
    const vs = rows.map((p) => p[k]);
    const kind = PROPERTY_MERGE[k];
    if (kind === 'sum') m[k] = sumOf(vs);
    else if (kind === 'static') m[k] = firstOf(vs);
    else if (kind === 'agree') m[k] = agreed(vs);
    else if (kind === 'any') m[k] = anyOf(vs);
  });
  // Today's %: today's dollars over the value before today's move, both from the rows that give today's dollars
  const today = rows.filter((p) => isNum(p.todayGl) && isNum(p.currentValue));
  m.todayGlPct = today.length ? ratio(today.reduce((s, p) => s + p.todayGl!, 0), today.reduce((s, p) => s + p.currentValue! - p.todayGl!, 0), 100) : undefined;
  // Total % and the average cost: over the rows with a known cost (Fidelity gives none, or 0, for an unknown basis)
  const costed = rows.filter((p) => isNum(p.costBasisTotal) && p.costBasisTotal > 0);
  const gl = costed.filter((p) => isNum(p.totalGl));
  m.totalGlPct = gl.length ? ratio(gl.reduce((s, p) => s + p.totalGl!, 0), gl.reduce((s, p) => s + p.costBasisTotal!, 0), 100) : undefined;
  const held = costed.filter((p) => isNum(p.quantity) && p.quantity > 0);
  m.costBasisPerShare = held.length ? ratio(held.reduce((s, p) => s + p.costBasisTotal!, 0), held.reduce((s, p) => s + p.quantity!, 0)) : undefined;
  m.percentOfAccount = percentOfAccount(m.currentValue as number | undefined);
  // the fields JSON: every key any row has, by its kind; the raw fields of the summed and recomputed properties take the
  // merged values, so the JSON never shows one account's number on a merged line
  const fields: Record<string, Value> = {};
  const keys = new Set<string>();
  rows.forEach((p) => Object.keys(p.fields).forEach((k) => keys.add(k)));
  keys.forEach((k) => {
    const vs = rows.map((p) => p.fields[k]);
    const kind = fieldMerge(k);
    const v = k in RAW_OF ? (m[RAW_OF[k]!] as number | undefined) : kind === 'sum' ? sumOf(vs) : kind === 'static' ? firstOf(vs) : kind === 'agree' ? agreed(vs) : kind === 'any' ? anyOf(vs) : undefined;
    if (v !== undefined) fields[k] = v;
  });
  const drip = symbolDrip(rows.map((p) => ({ drip: dripGap(p) })), 'all');
  const merged = { ...(m as Omit<Position, 'fields' | 'account'>), account: (m.account as string | undefined) ?? '', fields, accounts, drip } as MergedPosition;
  // no key left with nothing in it: an empty cell reads its field as missing
  const loose = merged as unknown as Record<string, unknown>;
  Object.keys(loose).forEach((k) => { if (loose[k] === undefined) delete loose[k]; });
  return merged;
}
