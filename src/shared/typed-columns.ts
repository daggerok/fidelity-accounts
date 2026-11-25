/// <reference lib="esnext" />
// Typed columns of every table of the viewer (owner 2026-11-24: type autodetection, typed sort and a filter for every
// column, in Positions and in the ⤢ tables alike). Detection, the filter grammar and matching are the workspace block
// in ./filter-engine.ts, copied verbatim and never edited here. This module wraps it with the two things our data needs
// and the block lacks: the payment frequency type and Fidelity's own date form (Dec-12-2026); both could move into the
// block later. It also holds the typed sort and the small state rules of a table header. Pure, no DOM
import { ALL_COL_TYPES, COL_TYPE_HELP, COL_TYPE_LABELS, COL_TYPE_NAMES, COL_TYPE_PLACEHOLDERS, compileFilter, detectColType, isEmptyCell, parseCellValue, type ColType, type CompiledFilter } from './filter-engine';

export type ColumnType = ColType | 'frequency';
export const ALL_TYPES: ColumnType[] = (ALL_COL_TYPES as ColumnType[]).concat('frequency');
export const TYPE_LABELS: Record<ColumnType, string> = { ...COL_TYPE_LABELS, frequency: 'FRQ' };
export const TYPE_NAMES: Record<ColumnType, string> = { ...COL_TYPE_NAMES, frequency: 'payment frequency' };
export const TYPE_PLACEHOLDERS: Record<ColumnType, string> = { ...COL_TYPE_PLACEHOLDERS, date: '>2026-12, -30d..', datetime: '>2026-12-01T09:30', frequency: 'monthly, >=4' };
export const TYPE_HELP: Record<ColumnType, string> = {
  ...COL_TYPE_HELP,
  frequency: 'Frequency filter: monthly, quarterly, semi-annually, annually, or payments a year: >=4, 2..12, space = AND, comma = OR, ! = NOT, ? = empty.',
};
export const asType = (v: unknown): ColumnType | undefined => (ALL_TYPES.indexOf(v as ColumnType) >= 0 ? (v as ColumnType) : undefined);

/**
 * One column of a table: `text` is the cell as the table shows it (the sample of the type detection and what a text
 * filter reads), `value` the exact number behind a numeric cell, so sort and filters compare full precision
 */
export interface TypedColumn<T> {
  key: string;
  text: (row: T) => string;
  value?: (row: T) => number | null | undefined;
}

// ---- payment frequency: an ordinal, compared by payments a year ----------------------------------------------------

const PER_YEAR: [string, number][] = [['weekly', 52], ['monthly', 12], ['quarterly', 4], ['semiannually', 2], ['semiannual', 2], ['annually', 1], ['annual', 1], ['yearly', 1]];
const letters = (s: string): string => s.toLowerCase().replace(/[^a-z]/g, '');

/** Monthly 12, Quarterly 4, Semi-annually 2, Annually 1 payments a year; NaN for anything else */
export function perYear(text: string): number {
  const w = letters(text);
  const hit = PER_YEAR.find((x) => x[0] === w);
  return hit ? hit[1] : NaN;
}

/** a word typed into a frequency filter: a whole name or the start of one (month, quart, semi, ann) */
function wordPerYear(word: string): number {
  const w = letters(word);
  if (!w) return NaN;
  const hit = PER_YEAR.find((x) => x[0] === w) ?? PER_YEAR.find((x) => x[0].indexOf(w) === 0);
  return hit ? hit[1] : NaN;
}

// ---- Fidelity's date form ------------------------------------------------------------------------------------------

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const SITE_DATE = /\b([A-Za-z]{3})-(\d{1,2})-(\d{4})\b/g;

/** "Dec-12-2026" (the site's way, in a cell or typed into a filter) -> "2026-12-12", the form the engine reads */
export function isoDates(text: string): string {
  return text.replace(SITE_DATE, (all: string, mon: string, day: string, year: string) => {
    const m = MONTHS.indexOf(mon.toLowerCase());
    return m < 0 ? all : `${year}-${String(m + 1).padStart(2, '0')}-${day.padStart(2, '0')}`;
  });
}

// ---- detection -----------------------------------------------------------------------------------------------------

const SAMPLE = 60; // the engine's own sample size
const AGREE = 0.8; // and its share of the filled cells that must agree

/** the type of a column from its cell texts: payment frequency when 80% of the filled cells are one, else the engine's answer */
export function detectType(samples: string[]): ColumnType {
  const filled = samples.map((s) => String(s ?? '').trim()).filter((s) => !isEmptyCell(s)).slice(0, SAMPLE);
  if (!filled.length) return 'string';
  if (filled.filter((s) => !Number.isNaN(perYear(s))).length >= Math.ceil(filled.length * AGREE)) return 'frequency';
  return detectColType(filled.map(isoDates));
}

export interface ColumnTypes { types: Record<string, ColumnType>; detected: Record<string, ColumnType> }

/**
 * The types of the columns of a table. Detected from `sample`, the rows before any filter, so a filter never changes
 * the type of its own column; `overrides` are the types the owner set with the header badge
 */
export function columnTypes<T>(cols: TypedColumn<T>[], sample: T[], overrides: Record<string, ColumnType> = {}): ColumnTypes {
  const out: ColumnTypes = { types: {}, detected: {} };
  cols.forEach((c) => {
    const texts: string[] = [];
    for (let i = 0; i < sample.length && texts.length < SAMPLE; i += 1) {
      const text = c.text(sample[i]!);
      if (!isEmptyCell(text)) texts.push(text);
    }
    out.detected[c.key] = detectType(texts);
    out.types[c.key] = overrides[c.key] ?? out.detected[c.key]!;
  });
  return out;
}

// ---- values, sort --------------------------------------------------------------------------------------------------

const isNumeric = (type: ColumnType): boolean => type === 'number' || type === 'percent' || type === 'currency';

/** the number a cell is compared by for its column type; NaN when it has none (text columns always) */
export function cellNumber<T>(col: TypedColumn<T>, row: T, type: ColumnType): number {
  if (type === 'string') return NaN;
  if (type === 'frequency') return perYear(col.text(row));
  if (isNumeric(type) && col.value) {
    const raw = col.value(row);
    return typeof raw === 'number' && Number.isFinite(raw) ? raw : NaN;
  }
  return parseCellValue(isoDates(col.text(row)), type);
}

/**
 * Rows in the order of one column: text by text (numbers inside it by value), every other type by its number, so
 * payment frequency goes by payments a year (desc = Monthly first) and dates by the calendar. Empty cells come last in
 * both directions; rows that compare equal keep the order they came in
 */
export function sortRows<T>(rows: T[], col: TypedColumn<T>, type: ColumnType, dir: 1 | -1): T[] {
  const keyed = rows.map((row, i) => {
    if (type === 'string') { const text = col.text(row).trim(); return { row, i, text, num: 0, empty: isEmptyCell(text) }; }
    const num = cellNumber(col, row, type);
    return { row, i, text: '', num, empty: Number.isNaN(num) };
  });
  keyed.sort((a, b) => {
    if (a.empty || b.empty) return a.empty === b.empty ? a.i - b.i : a.empty ? 1 : -1;
    const d = type === 'string' ? a.text.localeCompare(b.text, undefined, { numeric: true, sensitivity: 'base' }) : a.num - b.num;
    return d ? d * dir : a.i - b.i;
  });
  return keyed.map((k) => k.row);
}

// ---- filters -------------------------------------------------------------------------------------------------------

/** a filter expression for a column type, in the engine's grammar; null when empty, `ok: false` with the reason when it cannot be read */
export function compile(input: string, type: ColumnType, now: number = Date.now()): CompiledFilter | null {
  if (type === 'frequency') {
    // words become payments a year, then it is a number filter: monthly = 12, >=quarterly = >=4, !annually = !1
    let bad = '';
    const numbers = input.replace(/[A-Za-z][A-Za-z-]*/g, (word: string) => {
      const n = wordPerYear(word);
      if (Number.isNaN(n)) { bad = bad || word; return word; }
      return String(n);
    });
    return bad ? { ok: false, error: `cannot read "${bad}" as ${TYPE_NAMES.frequency}` } : compileFilter(numbers, 'number', now);
  }
  return compileFilter(type === 'date' || type === 'datetime' ? isoDates(input) : input, type, now);
}

/** the filters that are filled in and can be read, as one test per row; a filter that cannot be read is ignored (its input says why) */
export function rowTest<T>(cols: TypedColumn<T>[], types: Record<string, ColumnType>, filters: Record<string, string>, now: number = Date.now()): ((row: T) => boolean) | null {
  const active: ((row: T) => boolean)[] = [];
  cols.forEach((col) => {
    const type = types[col.key] ?? 'string';
    const compiled = compile(filters[col.key] ?? '', type, now);
    if (!compiled || !compiled.ok) return;
    active.push(type === 'string' ? (row) => compiled.test(NaN, col.text(row).toLowerCase()) : (row) => compiled.test(cellNumber(col, row, type), ''));
  });
  return active.length ? (row) => active.every((test) => test(row)) : null;
}

export function filterRows<T>(rows: T[], cols: TypedColumn<T>[], types: Record<string, ColumnType>, filters: Record<string, string>, now: number = Date.now()): T[] {
  const test = rowTest(cols, types, filters, now);
  return test ? rows.filter(test) : rows;
}

/** how many filters are filled in */
export const activeFilters = (filters: Record<string, string>): number => Object.keys(filters).filter((k) => (filters[k] ?? '').trim() !== '').length;

// ---- the state rules of a table header -----------------------------------------------------------------------------

export interface Sort { key: string; dir: 1 | -1 }

/** a click on a header: the same column turns around; a new one starts A to Z for text and largest (latest, most frequent) first for the rest */
export const nextSort = (sort: Sort | null, key: string, type: ColumnType): Sort =>
  (sort && sort.key === key ? { key, dir: sort.dir === 1 ? -1 : 1 } : { key, dir: type === 'string' ? 1 : -1 });

/** one filter set or, when empty, removed */
export function withFilter(filters: Record<string, string>, key: string, value: string): Record<string, string> {
  const next = { ...filters };
  if (value.trim() === '') delete next[key]; else next[key] = value;
  return next;
}

/** a click on the type badge: the next type in the cycle, Shift+click (`reset`) back to the detected one; a type equal to the detected one is no override */
export function withType(overrides: Record<string, ColumnType>, key: string, current: ColumnType, detected: ColumnType, reset: boolean): Record<string, ColumnType> {
  const type = reset ? detected : ALL_TYPES[(ALL_TYPES.indexOf(current) + 1) % ALL_TYPES.length]!;
  const next = { ...overrides };
  if (type === detected) delete next[key]; else next[key] = type;
  return next;
}

/** saved filters or types: only non-empty strings stay (types: only known ones) */
export function cleanFilters(v: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!v || typeof v !== 'object' || Array.isArray(v)) return out;
  const map = v as Record<string, unknown>;
  Object.keys(map).forEach((k) => { const x = map[k]; if (typeof x === 'string' && x.trim() !== '') out[k] = x; });
  return out;
}
export function cleanTypes(v: unknown): Record<string, ColumnType> {
  const out: Record<string, ColumnType> = {};
  if (!v || typeof v !== 'object' || Array.isArray(v)) return out;
  const map = v as Record<string, unknown>;
  Object.keys(map).forEach((k) => { const x = asType(map[k]); if (x) out[k] = x; });
  return out;
}
