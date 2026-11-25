/// <reference lib="esnext" />
// The fidelity_* tabs of the owner's Google Sheet (pattern google-sheets-in-browser, code from mykplan-adp
// shared/sheets/tabs.ts). Row 1 is the header in snake_case, cells go out as RAW (numbers as numbers, ISO dates and
// account numbers as text), rows come back as UNFORMATTED_VALUE and text is parsed too (a hand-edited cell must not
// break a read)
import { BETA_SOURCES, type BetaSource } from '../beta';
import type { Account, Position } from '../model';
import type { Txn } from '../transactions';
export type Cell = string | number | boolean;

// text: as is; cents: integer (rounded); num: any finite number; bool: TRUE/FALSE; json: an array or object
export type Kind = 'text' | 'cents' | 'num' | 'bool' | 'json';

export interface Col<T> {
  key: Extract<keyof T, string>;
  kind: Kind;
  optional?: boolean;
  // allowed values of a text column (an unknown value reads as the first one, or as nothing when optional)
  values?: readonly string[];
  // json columns: the value an empty or broken cell reads as
  empty?: '[]' | '{}';
}

export interface TabSpec<T> {
  name: string;
  // header row: 'id' first only for tabs whose records carry a real id, then the snake_case column names
  columns: string[];
  lastCol: string;
  idOf: (r: T) => string;
  toRow: (r: T) => Cell[];
  fromRow: (row: unknown[]) => T | null;
}

// the tabs carry the app name (pattern google-sheets-in-browser): fidelity_ for this app
export const TAB_PREFIX = 'fidelity_';
const CELL_LIMIT = 50000; // Google Sheets: characters per cell

/** 1 -> A, 26 -> Z, 27 -> AA */
export function columnLetter(n: number): string {
  let s = '';
  for (let i = n; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s;
  return s;
}

function text(v: unknown): string {
  return v === undefined || v === null ? '' : String(v);
}

function number(v: unknown): number | undefined {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  const t = text(v).trim().replace(/,/g, '');
  if (!t) return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

function encode<T>(col: Col<T>, v: unknown): Cell {
  if (v === undefined || v === null) return '';
  switch (col.kind) {
    case 'cents': return typeof v === 'number' ? Math.round(v) : text(v);
    case 'num': return typeof v === 'number' ? v : text(v);
    case 'bool': return v === true;
    case 'json': return JSON.stringify(v).slice(0, CELL_LIMIT);
    default: return text(v).slice(0, CELL_LIMIT);
  }
}

// undefined = leave the field out
function decode<T>(col: Col<T>, v: unknown): unknown {
  const raw = text(v);
  switch (col.kind) {
    case 'cents': {
      const n = number(v);
      if (n === undefined) return col.optional ? undefined : 0;
      return Math.round(n);
    }
    case 'num': {
      const n = number(v);
      return n === undefined ? (col.optional ? undefined : 0) : n;
    }
    case 'bool':
      if (raw === '' && col.optional) return undefined;
      return v === true || raw.toUpperCase() === 'TRUE';
    case 'json': {
      const empty = col.empty || '[]';
      let parsed: unknown;
      try { parsed = JSON.parse(raw || empty); } catch { parsed = JSON.parse(empty); }
      const wantArray = empty === '[]';
      const ok = wantArray ? Array.isArray(parsed) : typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed);
      return ok ? parsed : JSON.parse(empty);
    }
    default: {
      if (col.values) {
        if (col.values.indexOf(raw) !== -1) return raw;
        return col.optional ? undefined : col.values[0];
      }
      if (raw === '' && col.optional) return undefined;
      return raw;
    }
  }
}

/**
 * A tab from its columns. With `idKey` the record carries its own id (column A holds it and fromRow puts it
 * back), otherwise `idOf` builds the key from fields and column A is only for upserts.
 */
export const snakeCase = (k: string): string => k.replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/([A-Z])([A-Z][a-z])/g, '$1_$2').toLowerCase();

export function defineTab<T>(name: string, cols: Col<T>[], idOf: (r: T) => string, idKey?: Extract<keyof T, string>): TabSpec<T> {
  // an "id" column only where the record has a real id (transactions, scenarios). Other tabs are matched by their
  // own key columns (from|to|scope|key, date|fund, ...): a glued key in column A only repeated them (owner
  // 2026-11-22: "why we haven't split it into many columns")
  const hasId = !!idKey;
  const data = cols.map((c) => snakeCase(c.key));
  const columns = hasId ? ['id'].concat(data) : data;
  const offset = hasId ? 1 : 0;
  return {
    name,
    columns,
    lastCol: columnLetter(columns.length),
    idOf,
    toRow: (r) => {
      const fields = r as unknown as Record<string, unknown>;
      const cells = cols.map((c) => encode(c, fields[c.key]));
      return hasId ? [idOf(r) as Cell].concat(cells) : cells;
    },
    fromRow: (row) => {
      if (hasId ? !text(row[0]).trim() : row.every((v) => text(v).trim() === '')) return null;
      const out: Record<string, unknown> = {};
      if (idKey) out[idKey] = text(row[0]).trim();
      cols.forEach((c, i) => {
        const v = decode(c, row[i + offset]);
        if (v !== undefined) out[c.key] = v;
      });
      return out as unknown as T;
    },
  };
}

const key = (...parts: (string | undefined)[]): string => parts.map((p) => p || '').join('|');

// the accounts as the site lists them, one row per account, rewritten on every read
export const ACCOUNTS = defineTab<Account>('fidelity_accounts', [
  { key: 'number', kind: 'text' },
  { key: 'name', kind: 'text' },
  { key: 'group', kind: 'text' },
  { key: 'type', kind: 'text', optional: true },
  { key: 'balance', kind: 'num', optional: true },
  { key: 'todayGl', kind: 'num', optional: true },
  { key: 'todayGlPct', kind: 'num', optional: true },
  { key: 'totalGl', kind: 'num', optional: true },
  { key: 'totalGlPct', kind: 'num', optional: true },
  { key: 'costBasis', kind: 'num', optional: true },
  { key: 'estAnnualIncome', kind: 'num', optional: true },
  { key: 'cash', kind: 'num', optional: true },
  { key: 'pending', kind: 'num', optional: true },
  { key: 'asOf', kind: 'text' },
], (r) => r.number);

// the positions now (a sold position leaves the tab): the common columns plus every field of the site in "fields"
export type PositionRow = Position & { asOf: string };
export const POSITIONS = defineTab<PositionRow>('fidelity_positions', [
  { key: 'account', kind: 'text' },
  { key: 'kind', kind: 'text', values: ['position', 'core', 'pending'] },
  { key: 'symbol', kind: 'text' },
  { key: 'description', kind: 'text' },
  { key: 'cusip', kind: 'text', optional: true },
  { key: 'securityType', kind: 'text', optional: true },
  { key: 'securitySubType', kind: 'text', optional: true },
  { key: 'quantity', kind: 'num', optional: true },
  { key: 'lastPrice', kind: 'num', optional: true },
  { key: 'lastPriceChange', kind: 'num', optional: true },
  { key: 'lastPriceChangePct', kind: 'num', optional: true },
  { key: 'currentValue', kind: 'num', optional: true },
  { key: 'todayGl', kind: 'num', optional: true },
  { key: 'todayGlPct', kind: 'num', optional: true },
  { key: 'totalGl', kind: 'num', optional: true },
  { key: 'totalGlPct', kind: 'num', optional: true },
  { key: 'costBasisTotal', kind: 'num', optional: true },
  { key: 'costBasisPerShare', kind: 'num', optional: true },
  { key: 'percentOfAccount', kind: 'num', optional: true },
  { key: 'distRate', kind: 'num', optional: true },
  { key: 'secYield', kind: 'num', optional: true },
  { key: 'estAnnualIncome', kind: 'num', optional: true },
  { key: 'dividendAmount', kind: 'num', optional: true },
  { key: 'paymentFrequency', kind: 'text', optional: true },
  { key: 'exDate', kind: 'text', optional: true },
  { key: 'payDate', kind: 'text', optional: true },
  { key: 'marketCap', kind: 'num', optional: true },
  { key: 'marketCapText', kind: 'text', optional: true },
  { key: 'sector', kind: 'text', optional: true },
  { key: 'industry', kind: 'text', optional: true },
  { key: 'low52', kind: 'num', optional: true },
  { key: 'high52', kind: 'num', optional: true },
  { key: 'asOf', kind: 'text' },
  { key: 'fields', kind: 'json', empty: '{}' },
], (r) => key(r.account, r.kind, r.symbol));

// one row per day and account: the balance history the site does not keep for us (key date|account)
export interface BalanceRow { date: string; account: string; name: string; balance?: number; todayGl?: number; totalGl?: number; costBasis?: number; cash?: number }
export const BALANCES = defineTab<BalanceRow>('fidelity_balances_daily', [
  { key: 'date', kind: 'text' },
  { key: 'account', kind: 'text' },
  { key: 'name', kind: 'text' },
  { key: 'balance', kind: 'num', optional: true },
  { key: 'todayGl', kind: 'num', optional: true },
  { key: 'totalGl', kind: 'num', optional: true },
  { key: 'costBasis', kind: 'num', optional: true },
  { key: 'cash', kind: 'num', optional: true },
], (r) => key(r.date, r.account));

// every field of every position as its own column (fidelity_positions_all): the header grows when the site adds a
// field and is never reordered; the tab is rewritten as a whole on every read
export const WIDE_TAB = 'fidelity_positions_all';
export const WIDE_FIRST = ['as_of', 'actNum', 'actNam', 'rowType', 'sym_name', 'sym_desc'];

export function wideSpec(header: string[]): TabSpec<Record<string, unknown>> {
  return {
    name: WIDE_TAB,
    columns: header.slice(),
    lastCol: columnLetter(Math.max(1, header.length)),
    idOf: (r) => key(String(r.actNum ?? ''), String(r.rowType ?? ''), String(r.sym_name ?? '')),
    toRow: (r) => header.map((h) => {
      const v = r[h];
      if (v === undefined || v === null) return '';
      return typeof v === 'number' || typeof v === 'boolean' ? v : String(v).slice(0, CELL_LIMIT);
    }),
    fromRow: () => null,
  };
}

/** stored header + the keys it lacks (sorted), WIDE_FIRST in front of a new header; trailing blanks dropped */
export function growHeader(stored: string[], keys: string[]): string[] {
  const head = stored.map((s) => s.trim());
  while (head.length && !head[head.length - 1]) head.pop();
  const base = head.length ? head : WIDE_FIRST.slice();
  const have = new Set(base);
  const extra = keys.filter((k) => !have.has(k)).sort();
  return base.concat(extra);
}

// the transactions history (shared/transactions), rewritten as a whole after each daily read of it
export const TRANSACTIONS = defineTab<Txn>('fidelity_transactions', [
  { key: 'account', kind: 'text' },
  { key: 'date', kind: 'text' },
  { key: 'mnemonic', kind: 'text', optional: true },
  { key: 'cat', kind: 'text', optional: true },
  { key: 'sub', kind: 'text', optional: true },
  { key: 'dir', kind: 'text', optional: true },
  { key: 'symbol', kind: 'text', optional: true },
  { key: 'qty', kind: 'num', optional: true },
  { key: 'net', kind: 'num', optional: true },
  { key: 'desc', kind: 'text', optional: true },
  { key: 'cancelled', kind: 'bool', optional: true },
], (r) => key(r.account, r.date, r.mnemonic, r.symbol, String(r.net)));

// how far each account's transactions were read (TxnStore.synced) and when, one row per account
export interface TxnSyncedRow { account: string; synced: string; at: string }
export const TXN_SYNCED = defineTab<TxnSyncedRow>('fidelity_transactions_synced', [
  { key: 'account', kind: 'text' },
  { key: 'synced', kind: 'text' },
  { key: 'at', kind: 'text' },
], (r) => r.account);

// the beta of each held symbol (shared/beta.ts) and where it came from, rewritten after the daily beta run
export interface BetaRow { symbol: string; beta: number; source: BetaSource; months?: number; asOf: string }
export const BETAS = defineTab<BetaRow>('fidelity_betas', [
  { key: 'symbol', kind: 'text' },
  { key: 'beta', kind: 'num' },
  { key: 'source', kind: 'text', values: BETA_SOURCES },
  { key: 'months', kind: 'num', optional: true },
  { key: 'asOf', kind: 'text' },
], (r) => r.symbol);

// when each data set was last written (one row per set: summary, positions, transactions, betas): the viewer watches this
// small tab and reads back only the sets that changed
export interface UpdateRow { set: string; at: string }
export const UPDATES = defineTab<UpdateRow>('fidelity_updates', [
  { key: 'set', kind: 'text' },
  { key: 'at', kind: 'text' },
], (r) => r.set);

export const TAB_NAMES = [ACCOUNTS.name, POSITIONS.name, BALANCES.name, WIDE_TAB, TRANSACTIONS.name, TXN_SYNCED.name, BETAS.name, UPDATES.name];
