/// <reference lib="esnext" />
import type { TypedColumn } from '../../shared/typed-columns';
import type { Slice } from '../app/derive';
import { t } from '../app/i18n';
import { prefs, setPrefs } from '../app/prefs';
import { animate } from './animate';
import { Donut } from './Donut';
import { pct, usd } from './format';
import { Toggle } from './Toggle';
import type { HeadColumn } from './TypedHead';
import { useStore } from './useStore';
import { ZoomTable } from './ZoomTable';

// The allocation cards of the Summary (by sector, by security type): the card's chart, its switch and its ⤢ view
// bars or a donut, each card its own choice (remembered by card id), switched with the morph animation
const viewOf = (views: Record<string, 'bars' | 'pie'>, id: string): 'bars' | 'pie' => views[id] ?? 'pie';
export function ViewSwitch({ id }: { id: string }) {
  const pr = useStore(prefs);
  return (
    <Toggle value={viewOf(pr.views, id)} label={t('Chart view')} a={{ value: 'pie', text: '◔', title: t('Show as donut') }} b={{ value: 'bars', text: '☰', title: t('Show as bars') }}
      onChange={(v) => animate(() => setPrefs({ views: { ...prefs.get().views, [id]: v } }))} />
  );
}

export function Allocation({ id, slices }: { id: string; slices: Slice[] }) {
  const pr = useStore(prefs);
  return viewOf(pr.views, id) === 'pie' ? <Donut slices={slices} otherName={t('Other')} /> : <Bars slices={slices} />;
}

function Bars({ slices, all }: { slices: Slice[]; all?: boolean }) {
  return (
    <div className={all ? 'gap-8 md:columns-2 [&>div]:mb-2 [&>div]:break-inside-avoid' : 'flex flex-col gap-2'}>
      {(all ? slices : slices.slice(0, 8)).map((s) => (
        <div key={s.name} className="text-sm">
          <div className="flex justify-between gap-3"><span className="truncate">{s.name}</span><span className="num text-slate-500 dark:text-slate-400">{usd(s.value)} · {pct(s.pct)}</span></div>
          <div className="mt-1 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800"><div className="h-1.5 rounded-full" style={{ width: `${Math.max(1, s.pct)}%`, background: 'var(--brand)' }} /></div>
        </div>
      ))}
    </div>
  );
}

// the big views of the cards
// the zoomed card follows its own toggle (owner 2026-11-24 bug: bars had no effect in the big window): bars = every
// slice as a bar, donut = the donut and the full table
const SLICE_COLS = (): (TypedColumn<Slice> & HeadColumn)[] => [
  { key: 'name', label: t('Name'), text: (s) => s.name },
  { key: 'value', label: t('Value'), text: (s) => usd(s.value), value: (s) => s.value },
  { key: 'pct', label: t('% of total'), text: (s) => pct(s.pct), value: (s) => s.pct },
];

function AllocationTable({ slices }: { slices: Slice[] }) {
  return (
    <ZoomTable cols={SLICE_COLS()} rows={slices} name="allocation-table" className="w-full text-sm [&_td]:px-2"
      row={(s) => <tr key={s.name} className="border-b border-slate-100 dark:border-slate-800"><td className="py-1.5">{s.name}</td><td className="num py-1.5 text-right">{usd(s.value)}</td><td className="num py-1.5 text-right text-slate-500 dark:text-slate-400">{pct(s.pct)}</td></tr>} />
  );
}

export function AllocationBig({ id, slices }: { id: string; slices: Slice[] }) {
  const pr = useStore(prefs);
  if (viewOf(pr.views, id) !== 'pie') return <Bars slices={slices} all />;
  return (
    <div className="grid items-start gap-6 md:grid-cols-2">
      <Donut slices={slices} otherName={t('Other')} />
      <AllocationTable slices={slices} />
    </div>
  );
}
