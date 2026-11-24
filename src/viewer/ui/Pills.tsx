/** the pill look, shared by every pill row (single choice here, on and off pills in KindFilter) */
export const pillClass = (on: boolean): string => `rounded-full px-2.5 py-0.5 text-xs font-medium ${on ? 'text-white' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`;
export const pillStyle = (on: boolean): React.CSSProperties | undefined => (on ? { background: 'var(--brand)' } : undefined);

// A row of pill buttons, one chosen (the balance periods, the Accounts order): the chosen pill is filled with the brand
// colour, like Fidelity's 1M YTD 1Y 3Y. One component for every such row (rules/reusable-components.md)
export function Pills<T extends string>({ items, value, label, labelOf, onChange, className = '' }: { items: readonly T[]; value: T; label: string; labelOf: (v: T) => string; onChange: (v: T) => void; className?: string }) {
  return (
    <div className={`flex flex-wrap gap-1 ${className}`} role="radiogroup" aria-label={label} data-pills>
      {items.map((v) => (
        <button key={v} type="button" role="radio" aria-checked={v === value} onClick={() => onChange(v)}
          className={pillClass(v === value)} style={pillStyle(v === value)}>{labelOf(v)}</button>
      ))}
    </div>
  );
}
