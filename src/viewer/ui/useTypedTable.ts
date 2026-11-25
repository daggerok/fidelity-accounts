/// <reference lib="esnext" />
import { useState } from 'react';
import { columnTypes, filterRows, nextSort, sortRows, withFilter, withType, type ColumnType, type Sort, type TypedColumn } from '../../shared/typed-columns';
import type { TableControl } from './TypedHead';

// Sort, filters and column types of one table kept in the component (the ⤢ tables: nothing to remember after the window
// closes). Returns the rows to draw and the control its TypedHead needs. With no sort chosen the rows keep the order
// they came in, so each table keeps its own default order
export function useTypedTable<T>(cols: TypedColumn<T>[], rows: T[], initial: Sort | null = null): { rows: T[]; control: TableControl } {
  const [sort, setSort] = useState<Sort | null>(initial);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [overrides, setOverrides] = useState<Record<string, ColumnType>>({});
  const { types, detected } = columnTypes(cols, rows, overrides);
  const col = sort ? cols.find((c) => c.key === sort.key) : undefined;
  const kept = filterRows(rows, cols, types, filters);
  return {
    rows: col && sort ? sortRows(kept, col, types[col.key] ?? 'string', sort.dir) : kept,
    control: {
      sort, filters, types, detected,
      onSort: (key) => setSort((s) => nextSort(s, key, types[key] ?? 'string')),
      onFilter: (key, value) => setFilters((f) => withFilter(f, key, value)),
      onType: (key, reset) => setOverrides((o) => withType(o, key, types[key] ?? 'string', detected[key] ?? 'string', reset)),
    },
  };
}
