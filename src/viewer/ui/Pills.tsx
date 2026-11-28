import { t } from '../app/i18n';
import { EdgeScrollRow } from './EdgeScrollRow';

/** the pill look, shared by every pill row (single choice here, on and off pills in KindFilter) */
// every pill has a background (owner 2026-11-24: consistent spacing between chips: a pill without one looked further
// from its neighbours than two filled ones); rows keep one 4 px gap. The chosen pill is white on the brand colour in the
// light theme and dark on it in the dark one, where the brand colour is light (white on it was 2.3-3.0:1, slate-900 is
// 6-7.8:1). `hit`: a taller invisible hit area on touch screens (index.css)
export const pillClass = (on: boolean, dense = false): string => `hit rounded-full ${dense ? 'px-1.5' : 'px-2.5'} py-0.5 text-xs font-medium transition-colors ${on ? 'text-white dark:text-slate-900' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'}`;
export const PILL_GAP = 'gap-1';
export const pillStyle = (on: boolean): React.CSSProperties | undefined => (on ? { background: 'var(--brand)' } : undefined);

// A row of pill buttons, one chosen (the balance periods, the Accounts order): the chosen pill is filled with the brand
// colour, like Fidelity's 1M YTD 1Y 3Y. One component for every such row (rules/reusable-components.md)
// `dense`: one line for a long row (the periods, owner 2026-11-24: "single line only", never on top of each other): tight
// pills spread over the width with at least 2 px between them; a row wider than its box scrolls sideways
// `edges`: a dense row too long for a phone (the 25 periods of the ⤢ balance chart) scrolls in an EdgeScrollRow, whose
// fading sides and ‹ › tell that more pills hide there
export function Pills<T extends string>({ items, value, label, labelOf, onChange, className = '', dense = false, edges = false }: { items: readonly T[]; value: T; label: string; labelOf: (v: T) => string; onChange: (v: T) => void; className?: string; dense?: boolean; edges?: boolean }) {
  const pills = items.map((v) => (
    <button key={v} type="button" role="radio" aria-checked={v === value} onClick={() => onChange(v)}
      className={`${dense ? 'flex-none ' : ''}${pillClass(v === value, dense)}`} style={pillStyle(v === value)}>{labelOf(v)}</button>
  ));
  if (dense && edges) {
    return (
      <EdgeScrollRow label={label} items="[role=radio]" prevLabel={t('Previous periods')} nextLabel={t('Next periods')} className={className}>
        <div className={`flex flex-none ${PILL_GAP}`} role="radiogroup" aria-label={label} data-pills>{pills}</div>
      </EdgeScrollRow>
    );
  }
  return (
    <div className={`flex ${PILL_GAP} ${dense ? 'hit-room scrollbar-hidden flex-nowrap overflow-x-auto' : 'flex-wrap'} ${className}`} role="radiogroup" aria-label={label} data-pills>
      {pills}
    </div>
  );
}

// A row of pill buttons where several are chosen in an order (the Upcoming dividends sort): each chosen pill is filled
// and, once there is more than one, says its place (1, 2, ...); a click adds a pill after the chosen ones or takes it out
export function OrderPills<T extends string>({ items, value, label, labelOf, onToggle, className = '' }: { items: readonly T[]; value: readonly T[]; label: string; labelOf: (v: T) => string; onToggle: (v: T) => void; className?: string }) {
  return (
    <div className={`flex flex-wrap ${PILL_GAP} ${className}`} role="group" aria-label={label} data-order-pills>
      {items.map((v) => {
        const at = value.indexOf(v);
        return (
          <button key={v} type="button" aria-pressed={at >= 0} onClick={() => onToggle(v)} className={pillClass(at >= 0)} style={pillStyle(at >= 0)} data-order={at >= 0 ? at + 1 : undefined}>
            {labelOf(v)}{at >= 0 && value.length > 1 && <span className="num ml-1 text-[10px] font-bold opacity-80">{at + 1}</span>}
          </button>
        );
      })}
    </div>
  );
}
