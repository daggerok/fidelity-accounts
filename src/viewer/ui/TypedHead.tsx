/// <reference lib="esnext" />
import { useEffect, useRef, useState } from 'react';
import { COL_TYPE_CLASSES } from '../../shared/filter-engine';
import { TYPE_HELP, TYPE_LABELS, TYPE_NAMES, TYPE_PLACEHOLDERS, compile, type ColumnType, type Sort } from '../../shared/typed-columns';
import { t } from '../app/i18n';

// The head of every table (owner 2026-11-24: type autodetection, sort and a filter for every column, in Positions and in
// the ⤢ tables, like the investments apps): a row of column names, each a sort button with its ▲ ▼ and the badge of the
// column type (ABC 123 % $ D FRQ; a click sets the next type, Shift+click returns to the detected one), and under it a
// row of filter inputs. The rules are src/shared/typed-columns.ts over the workspace filter engine; this only draws
// `wrap`: a narrow column whose extras may go to a second line (the Positions Symbol column, 120 px)
export interface HeadColumn { key: string; label: string; hint?: string; align?: 'left' | 'right'; wrap?: boolean }

/** what a table hands its head: the state and what a click or typing does to it (useTypedTable, or Positions from prefs) */
export interface TableControl {
  sort: Sort | null;
  filters: Record<string, string>;
  types: Record<string, ColumnType>;
  detected: Record<string, ColumnType>;
  onSort: (key: string) => void;
  onFilter: (key: string, value: string) => void;
  onType: (key: string, reset: boolean) => void;
}

export const FILTER_DEBOUNCE_MS = 250;

const TYPE_CLASSES: Record<ColumnType, string> = { ...COL_TYPE_CLASSES, frequency: 'bg-teal-100 dark:bg-teal-900/50 text-teal-700 dark:text-teal-300' };
// the engine's words (type names and filter help) are its own constants: their Russian lines are keyed by the same
// text and typed-head.test.ts checks that none is missing
const word = (text: string): string => t(text);

export function TypeBadge({ type, detected, onClick }: { type: ColumnType; detected: ColumnType; onClick: (reset: boolean) => void }) {
  const set = type !== detected;
  const how = set ? t('set by you, detected: {type}', { type: word(TYPE_NAMES[detected]) }) : t('auto-detected');
  return (
    <button type="button" className={`flex-none rounded border px-1 text-[10px] font-bold leading-4 tracking-wide transition-opacity hover:opacity-100 ${set ? 'border-slate-400 opacity-100' : 'border-transparent opacity-75'} ${TYPE_CLASSES[type]}`}
      title={t('Column type: {type} ({how}). Click for the next type, Shift+click for the detected one', { type: word(TYPE_NAMES[type]), how })}
      onClick={(e) => { e.stopPropagation(); onClick(e.shiftKey); }} data-type-badge={type}>{TYPE_LABELS[type]}</button>
  );
}

const INPUT = 'w-full min-w-0 rounded-md border py-1 pl-2 text-xs font-normal placeholder:text-slate-400 focus:outline-none dark:placeholder:text-slate-500';
const IDLE = 'border-slate-300 bg-white text-slate-900 focus:border-[var(--brand-ring)] dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100';
const ACTIVE = 'border-[var(--brand-ring)] bg-[var(--brand-soft)] text-[var(--brand-ink)]';
const INVALID = 'border-rose-400 bg-rose-50 text-rose-800 dark:border-rose-500 dark:bg-rose-950 dark:text-rose-200';

/**
 * One filter input: typing applies after a short pause, Enter at once, ✕ or Esc clears at once; a filter that cannot be
 * read turns red and says why in its tooltip. `note` is a small grey text inside on the right (the number of rows)
 */
export function FilterInput({ name, label, value, type, onChange, placeholder, note, noteTitle }: { name: string; label: string; value: string; type: ColumnType; onChange: (value: string) => void; placeholder?: string; note?: string; noteTitle?: string }) {
  const [text, setText] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<string | null>(null);
  const apply = useRef(onChange);
  apply.current = onChange;
  useEffect(() => { setText(value); }, [value]);
  const flush = (next: string) => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    pending.current = null;
    if (next !== value) apply.current(next);
  };
  // a window closed or a tab left while the pause runs still keeps what was typed
  useEffect(() => () => { if (timer.current !== null) clearTimeout(timer.current); if (pending.current !== null) apply.current(pending.current); }, []);
  const type_ = (next: string) => {
    setText(next);
    if (timer.current !== null) clearTimeout(timer.current);
    pending.current = next;
    timer.current = setTimeout(() => { timer.current = null; pending.current = null; apply.current(next); }, FILTER_DEBOUNCE_MS);
  };
  const clear = () => { setText(''); flush(''); };
  const active = text.trim() !== '';
  const compiled = active ? compile(text, type) : null;
  const error = compiled && !compiled.ok ? compiled.error : '';
  const help = `${error ? `${t('Cannot apply this filter: {error}', { error })}. ` : ''}${word(TYPE_HELP[type])}`;
  return (
    <div className="relative flex items-center">
      <input type="text" className={`${INPUT} ${error ? INVALID : active ? ACTIVE : IDLE}`} style={{ paddingRight: `${(note ? note.length * 0.45 + 0.4 : 0) + (active ? 1.4 : 0.4)}rem` }}
        value={text} placeholder={placeholder ?? TYPE_PLACEHOLDERS[type]} spellCheck={false} autoComplete="off" aria-label={t('Filter {name}', { name: label })} aria-invalid={error ? true : undefined} title={help}
        onChange={(e) => type_(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); flush(text); }
          else if (e.key === 'Escape' && text !== '') { e.preventDefault(); e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); clear(); }
        }} data-filter={name} />
      <span className="absolute inset-y-0 right-1.5 flex items-center gap-1">
        {note && <span className="pointer-events-none text-[0.7rem] font-normal text-slate-500" title={noteTitle} data-filter-note>{note}</span>}
        {active && <button type="button" className="grid size-4 place-items-center rounded-full text-[0.65rem] leading-none text-slate-500 hover:bg-slate-200 hover:text-slate-900 dark:hover:bg-slate-700 dark:hover:text-white" title={t('Clear this filter')} aria-label={t('Clear the {name} filter', { name: label })} onClick={clear} data-filter-clear={name}>✕</button>}
      </span>
    </div>
  );
}

const arrow = (sort: Sort | null, key: string): string => (sort && sort.key === key ? (sort.dir === 1 ? ' ▲' : ' ▼') : '');

/**
 * The two header rows of a table. `th` and `filterTh` are the cell classes of the table it sits in, `extras` what a
 * column adds after its badge (Positions: clear all and the columns icon), `inputs` what a column's filter input gets
 */
export function TypedHead({ cols, control, className, th = '', filterTh = '', extras = {}, inputs = {} }: {
  cols: HeadColumn[];
  control: TableControl;
  className?: string;
  th?: string;
  filterTh?: string;
  extras?: Record<string, React.ReactNode>;
  inputs?: Record<string, { placeholder?: string; note?: string; noteTitle?: string }>;
}) {
  return (
    <thead className={className} data-typed-head>
      <tr>
        {cols.map((c) => {
          const type = control.types[c.key] ?? 'string';
          const dir = control.sort && control.sort.key === c.key ? control.sort.dir : 0;
          return (
            <th key={c.key} className={th} title={c.hint} aria-sort={dir === 1 ? 'ascending' : dir === -1 ? 'descending' : undefined} data-col={c.key}>
              <div className={`flex items-start gap-1 ${c.wrap ? 'flex-wrap' : ''} ${c.align === 'left' ? '' : 'justify-end'}`}>
                <button type="button" className={`min-w-0 cursor-pointer whitespace-normal font-[inherit] hover:text-[var(--brand-strong)] text-left`}
                  title={c.hint ?? t('Sort by {name}', { name: c.label })} onClick={() => control.onSort(c.key)} data-sort={c.key}>{c.label}{arrow(control.sort, c.key)}</button>
                <TypeBadge type={type} detected={control.detected[c.key] ?? 'string'} onClick={(reset) => control.onType(c.key, reset)} />
                {extras[c.key]}
              </div>
            </th>
          );
        })}
      </tr>
      <tr data-filter-row>
        {cols.map((c) => (
          <th key={c.key} className={filterTh}>
            <FilterInput name={c.key} label={c.label} value={control.filters[c.key] ?? ''} type={control.types[c.key] ?? 'string'} onChange={(v) => control.onFilter(c.key, v)} {...inputs[c.key]} />
          </th>
        ))}
      </tr>
    </thead>
  );
}

/** the cell a table shows when its filters leave no row */
export const NoMatch = ({ span }: { span: number }) => <td colSpan={span} className="px-2 py-3 !text-left text-sm font-normal text-slate-500 dark:text-slate-400" data-no-match>{t('No rows match the filters')}</td>;
