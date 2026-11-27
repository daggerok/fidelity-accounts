/// <reference lib="esnext" />
import { useEffect, useRef, useState } from 'react';

// A button that opens a short list of actions under itself (Export and Import in ⚙️ Settings, owner 2026-11-27).
// A click on an item, a click elsewhere or Esc closes it; ArrowDown and ArrowUp walk the items
export interface MenuItem { key: string; label: string; hint?: string }

export function MenuButton({ label, title, items, active, onPick, name }: { label: string; title?: string; items: MenuItem[]; active?: boolean; onPick: (key: string) => void; name: string }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);
  const onKey = (e: React.KeyboardEvent) => {
    if (!open) return;
    if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); box.current?.querySelector<HTMLButtonElement>('[aria-haspopup]')?.focus(); return; }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const list = Array.from(box.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);
    const at = list.indexOf(document.activeElement as HTMLButtonElement);
    const down = e.key === 'ArrowDown';
    list[at < 0 ? (down ? 0 : list.length - 1) : (at + (down ? 1 : list.length - 1)) % list.length]?.focus();
  };
  return (
    <div ref={box} className="relative" onKeyDown={onKey} data-menu={name}>
      <button type="button" className={`btn sm ${active || open ? 'active' : ''}`} aria-haspopup="menu" aria-expanded={open} title={title} onClick={() => setOpen((v) => !v)}>
        {label} <span className="text-[10px] opacity-70" aria-hidden="true">▾</span>
      </button>
      {open && (
        <div role="menu" className="absolute left-0 top-full z-30 mt-1 min-w-56 rounded-lg border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-600 dark:bg-slate-800">
          {items.map((it) => (
            <button key={it.key} type="button" role="menuitem" data-menu-item={it.key} onClick={() => { setOpen(false); onPick(it.key); }}
              className="block w-full rounded-md px-3 py-2 text-left text-xs hover:bg-slate-100 focus:bg-slate-100 focus:outline-none dark:hover:bg-slate-700 dark:focus:bg-slate-700">
              <div className="font-medium text-slate-800 dark:text-slate-100">{it.label}</div>
              {it.hint && <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">{it.hint}</div>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
