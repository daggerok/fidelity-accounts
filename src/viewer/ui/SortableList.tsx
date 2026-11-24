/// <reference lib="esnext" />
import { useEffect, useRef, useState } from 'react';
import { moveKey } from '../app/columns';
import { t } from '../app/i18n';

// A list whose rows move by their ≡ handle: with the mouse, a finger (pointer events, so it works on a phone too) or the
// arrow keys on the focused handle. While a row is dragged it follows the pointer and the rows it passes step aside;
// on release `onMove` gets the new order of keys. Rows are 2rem tall with the padding of the other lists of the
// columns window (ColumnPicker ROW), so both halves line up
interface Drag { key: string; from: number; to: number; startY: number; dy: number; h: number; mids: number[] }

export function SortableList({ keys, label, row, onMove }: { keys: string[]; label: (key: string) => string; row: (key: string) => React.ReactNode; onMove: (keys: string[]) => void }) {
  const list = useRef<HTMLOListElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  // the drag lives in a ref too: pointer events can come faster than React draws, and the release must see the last move
  const live = useRef<Drag | null>(null);
  const put = (d: Drag | null) => { live.current = d; setDrag(d); };
  const target = (d: Drag, y: number) => d.mids.filter((m) => m < y).length;
  const [focus, setFocus] = useState<string | null>(null);
  // a row moved by the keys keeps its focus, so the next arrow press moves it again
  useEffect(() => {
    if (focus) list.current?.querySelector<HTMLElement>(`[data-handle="${CSS.escape(focus)}"]`)?.focus();
  }, [keys, focus]);

  const start = (e: React.PointerEvent<HTMLButtonElement>, key: string, from: number) => {
    const rows = Array.from(list.current?.children ?? []) as HTMLElement[];
    const box = rows[from]?.getBoundingClientRect();
    if (!box) return;
    // one step = a row and the gap under it
    const step = rows.length > 1 ? rows[1]!.getBoundingClientRect().top - rows[0]!.getBoundingClientRect().top : box.height;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    // the middles of the other rows: the dragged row ends up after every middle above the pointer
    const mids = rows.filter((_, i) => i !== from).map((r) => { const b = r.getBoundingClientRect(); return b.top + b.height / 2; });
    put({ key, from, to: from, startY: e.clientY, dy: 0, h: step, mids });
  };
  const follow = (e: React.PointerEvent) => {
    const d = live.current;
    if (d) put({ ...d, dy: e.clientY - d.startY, to: target(d, e.clientY) });
  };
  const drop = (e: React.PointerEvent) => {
    const d = live.current;
    if (!d) return;
    const to = target(d, e.clientY);
    put(null);
    if (to !== d.from) onMove(moveKey(keys, d.key, to));
  };
  const byKeys = (e: React.KeyboardEvent, key: string, i: number) => {
    const to = e.key === 'ArrowUp' ? i - 1 : e.key === 'ArrowDown' ? i + 1 : -1;
    if (to < 0 || to >= keys.length) return;
    e.preventDefault();
    setFocus(key);
    onMove(moveKey(keys, key, to));
  };
  // where a row is drawn while another one is dragged: the dragged one under the pointer, the passed ones one row aside
  const shift = (i: number): number => {
    if (!drag) return 0;
    if (i === drag.from) return drag.dy;
    if (drag.from < i && i <= drag.to) return -drag.h;
    if (drag.to <= i && i < drag.from) return drag.h;
    return 0;
  };

  return (
    <ol ref={list} className="flex flex-col gap-1" data-sortable>
      {keys.map((key, i) => {
        const dragged = drag?.key === key;
        return (
          <li key={key} className={`flex h-8 shrink-0 items-center gap-2 rounded-md bg-white px-2 dark:bg-slate-900 ${dragged ? 'relative z-10 shadow-lg ring-1 ring-slate-300 dark:ring-slate-600' : ''}`}
            style={{ transform: drag ? `translateY(${shift(i)}px)` : undefined, transition: drag && !dragged ? 'transform 150ms ease' : undefined }} data-key={key}>
            <div className="min-w-0 flex-1">{row(key)}</div>
            <button type="button" data-handle={key} className="grid size-6 shrink-0 cursor-grab touch-none place-items-center rounded text-lg leading-none text-slate-500 hover:text-slate-900 active:cursor-grabbing dark:hover:text-white"
              title={t('Move {name}: drag, or the arrow keys', { name: label(key) })} aria-label={t('Move {name}: drag, or the arrow keys', { name: label(key) })}
              onPointerDown={(e) => start(e, key, i)} onPointerMove={follow} onPointerUp={drop} onPointerCancel={() => put(null)} onKeyDown={(e) => byKeys(e, key, i)} onBlur={() => setFocus(null)}>≡</button>
          </li>
        );
      })}
    </ol>
  );
}
