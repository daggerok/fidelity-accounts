/// <reference lib="esnext" />
import { useState } from 'react';
import { filterColumns, orderAfterDrag, shownKeys, toggleKeys } from '../app/columns';
import { t } from '../app/i18n';
import { SortableList } from './SortableList';

// The positions columns, chosen in the ⤢ window (owner 2026-11-24, like Fidelity's "Create My View"): all columns by
// group on the left with a filter, the chosen ones on the right in the table's order, moved by their ≡ handle. Every
// change shows in the table at once, no Save; Default brings back every column in its place.
// One grid for both halves (owner 2026-11-24: "geometrically in sync"): the same header row, boxes of the same height
// starting on the same line, every row ROW tall with the same padding, every checkbox on one vertical line; the
// explanations of our columns are tooltips, so no row grows
export interface PickColumn { key: string; label: string; group: string; hint?: string }

const ROW = 'flex h-8 shrink-0 items-center gap-2 px-2';
const HEAD = 'flex h-8 items-center justify-between gap-2';
const BOX = 'flex h-[min(60vh,32rem)] flex-col gap-1 overflow-auto rounded-xl border border-slate-200 p-2 text-sm dark:border-slate-700';

function GroupCheck({ keys, hidden, onHidden, label }: { keys: string[]; hidden: string[]; onHidden: (h: string[]) => void; label: string }) {
  const on = keys.filter((k) => hidden.indexOf(k) < 0).length;
  return (
    <input type="checkbox" aria-label={label} title={label} checked={on === keys.length} ref={(el) => { if (el) el.indeterminate = on > 0 && on < keys.length; }}
      onChange={(e) => onHidden(toggleKeys(hidden, keys, e.target.checked))} />
  );
}

export function ColumnPicker({ cols, order, hidden, onChange }: { cols: PickColumn[]; order: string[]; hidden: string[]; onChange: (p: { columns?: string[]; hidden?: string[] }) => void }) {
  const [q, setQ] = useState('');
  const all = cols.map((c) => c.key);
  const byKey = new Map(cols.map((c) => [c.key, c]));
  const shown = shownKeys(all, order, hidden);
  const found = filterColumns(cols, q);
  const groups = Array.from(new Set(cols.map((c) => c.group))).map((g) => ({ name: g, cols: found.filter((c) => c.group === g) })).filter((g) => g.cols.length);
  const setHidden = (h: string[]) => onChange({ hidden: h });

  return (
    <div className="grid gap-4 md:grid-cols-2" data-column-picker>
      <section className="flex min-w-0 flex-col gap-2">
        <div className={HEAD}>
          <h3 className="font-semibold">{t('All columns')} <span className="text-sm font-normal text-slate-500">{all.length + 1}</span></h3>
        </div>
        <div className={BOX}>
          <div className={ROW}>
            <input className="h-7 w-full min-w-0 rounded-md border border-slate-300 bg-white px-2 text-sm focus:border-emerald-500 focus:outline-none dark:border-slate-600 dark:bg-slate-900"
              placeholder={t('Filter by column name')} aria-label={t('Filter by column name')} value={q} onChange={(e) => setQ(e.target.value)} data-column-filter />
          </div>
          {groups.map((g) => {
            const keys = g.cols.map((c) => c.key);
            return (
              <div key={g.name} className="flex flex-col gap-1" data-column-group>
                <label className={`${ROW} rounded-md bg-slate-100 font-medium dark:bg-slate-800`}>
                  <GroupCheck keys={keys} hidden={hidden} onHidden={setHidden} label={t('Select all')} />
                  <span className="flex-1 truncate">{g.name}</span>
                  <span className="text-xs font-normal text-slate-500">{keys.filter((k) => hidden.indexOf(k) < 0).length}/{keys.length}</span>
                </label>
                {g.cols.map((c) => (
                  <label key={c.key} className={ROW} title={c.hint}>
                    <input type="checkbox" checked={hidden.indexOf(c.key) < 0} onChange={(e) => setHidden(toggleKeys(hidden, [c.key], e.target.checked))} />
                    <span className="truncate">{c.label}</span>
                  </label>
                ))}
              </div>
            );
          })}
          {!groups.length && <p className={`${ROW} text-slate-500`}>{t('No column matches')}</p>}
        </div>
      </section>
      <section className="flex min-w-0 flex-col gap-2">
        <div className={HEAD}>
          <h3 className="font-semibold">{t('Selected columns')} <span className="text-sm font-normal text-slate-500">{shown.length + 1}</span></h3>
          <button type="button" className="btn sm" title={t('Every column back, in its default place')} onClick={() => onChange({ columns: [], hidden: [] })}>{t('Default')}</button>
        </div>
        <div className={BOX}>
          {/* Symbol always comes first, as on Fidelity */}
          <div className={`${ROW} text-slate-500`}><input type="checkbox" checked disabled aria-label={t('Symbol')} /><span className="flex-1">{t('Symbol')}</span></div>
          <SortableList keys={shown} label={(k) => byKey.get(k)?.label ?? k}
            onMove={(keys) => onChange({ columns: orderAfterDrag(all, order, hidden, keys) })}
            row={(k) => (
              <label className="flex min-w-0 items-center gap-2" title={byKey.get(k)?.hint}>
                <input type="checkbox" checked onChange={() => setHidden(toggleKeys(hidden, [k], false))} />
                <span className="truncate">{byKey.get(k)?.label ?? k}</span>
              </label>
            )} />
        </div>
      </section>
    </div>
  );
}
