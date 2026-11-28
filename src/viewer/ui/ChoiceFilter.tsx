/// <reference lib="esnext" />
import { useEffect, useRef, useState } from 'react';
import { clearChoices, pickedChoices, toggleChoice } from '../../shared/choice-filter';
import { t } from '../app/i18n';

// The funnel by a column's name (owner 2026-11-28, like the Type and Media lists of the twitter app): a list of the
// values the column holds, each with a box; ticking writes the pick into the column's filter text, so the filter input
// under it shows it and can still be edited by hand (shared/choice-filter.ts). "All" takes every pick out
const Funnel = ({ on }: { on: boolean }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill={on ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 5h18l-7 8.5V19l-4 2v-7.5z" />
  </svg>
);

export function ChoiceFilter({ label, choices, value, onChange }: { label: string; choices: readonly string[]; value: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return undefined;
    const away = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);
  const picked = pickedChoices(value, choices);
  const text = picked.length ? t('{name}: {n} chosen. Click to choose', { name: label, n: picked.length }) : t('{name}: choose from a list', { name: label });
  return (
    <span ref={box} className="relative flex-none" onKeyDown={(e) => { if (e.key === 'Escape' && open) { e.stopPropagation(); setOpen(false); } }} data-choice-filter>
      <button type="button" className={`hit grid h-[18px] w-[18px] place-items-center rounded transition-colors ${picked.length ? 'text-[var(--brand)]' : 'text-slate-400 hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-200'}`}
        aria-haspopup="listbox" aria-expanded={open} title={text} aria-label={text} onClick={() => setOpen((v) => !v)} data-choice-button><Funnel on={picked.length > 0} /></button>
      {open && (
        <div role="listbox" aria-multiselectable="true" aria-label={label}
          className="absolute left-0 top-full z-30 mt-1 max-h-72 min-w-48 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 text-left text-xs font-normal text-slate-800 shadow-lg dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100" data-choice-list>
          {choices.map((c) => {
            const on = picked.indexOf(c) >= 0;
            return (
              <label key={c} role="option" aria-selected={on} className="flex cursor-pointer items-center gap-2 whitespace-nowrap rounded-md px-2 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-700" data-choice={c}>
                <input type="checkbox" checked={on} onChange={() => onChange(toggleChoice(value, c))} />{c}
              </label>
            );
          })}
          <button type="button" className="mt-1 block w-full rounded-md border border-slate-200 px-2 py-1 text-center text-slate-600 hover:bg-slate-100 disabled:opacity-40 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
            disabled={!picked.length} onClick={() => onChange(clearChoices(value, choices))} data-choice-all>{t('All')}</button>
        </div>
      )}
    </span>
  );
}
