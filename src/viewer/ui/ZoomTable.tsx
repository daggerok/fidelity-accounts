/// <reference lib="esnext" />
import type { TypedColumn } from '../../shared/typed-columns';
import { NoMatch, TypedHead, type HeadColumn } from './TypedHead';
import { useTypedTable } from './useTypedTable';

// The head of the ⤢ tables: the names in the small grey of the cards, the filter inputs under them (TypedHead)
export const ZOOM_HEAD = 'bg-[var(--card-bg)] text-xs text-slate-500 dark:text-slate-400';
const ZOOM_TH = 'px-2 pt-2 pb-1 align-bottom font-medium';
const ZOOM_FILTER_TH = 'min-w-[6.5rem] px-2 pb-2 font-normal';

/**
 * The shell of every ⤢ table of the Summary cards: the box that scrolls sideways, the shared head with sort and filters
 * over `cols` (useTypedTable keeps them while the window is open) and the row that says no row matches the filters.
 * `row` draws one row of a plain table (all rows in one body, the no-match row in it); a table of its own shape (a total
 * on top, a body per symbol or per part) draws its bodies with `body` from the rows left and puts `noMatch` where it
 * belongs. `name` is the table's data attribute (data-movers, data-range-table, ...); `head`, `th` and `filterTh` the
 * head's classes when its cells are padded unlike the others (the dividends table)
 */
export function ZoomTable<T>({ cols, rows, name, className = 'w-full text-sm', head = ZOOM_HEAD, th = ZOOM_TH, filterTh = ZOOM_FILTER_TH, ...draw }: {
  cols: (TypedColumn<T> & HeadColumn)[];
  rows: T[];
  name: string;
  className?: string;
  head?: string;
  th?: string;
  filterTh?: string;
} & ({ row: (r: T) => React.ReactNode } | { body: (shown: T[], noMatch: React.ReactNode) => React.ReactNode })) {
  const table = useTypedTable(cols, rows);
  const noMatch = table.rows.length ? null : <tr><NoMatch span={cols.length} /></tr>;
  return (
    <div className="overflow-x-auto">
      <table className={className} {...{ [`data-${name}`]: true }}>
        <TypedHead cols={cols} control={table.control} className={head} th={th} filterTh={filterTh} />
        {'row' in draw ? <tbody>{table.rows.map(draw.row)}{noMatch}</tbody> : draw.body(table.rows, noMatch)}
      </table>
    </div>
  );
}
