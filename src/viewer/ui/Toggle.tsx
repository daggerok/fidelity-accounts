/// <reference lib="esnext" />

export interface ToggleOption<T extends string> { value: T; text: string; title: string }

// One switch for two choices (owner 2026-11-24: "toggle here, not two buttons", only one view at a time): both choices
// stay readable, the thumb slides under the one in use, a click anywhere flips it
export function Toggle<T extends string>({ value, a, b, label, onChange }: { value: T; a: ToggleOption<T>; b: ToggleOption<T>; label: string; onChange: (v: T) => void }) {
  const second = value === b.value;
  const text = (on: boolean) => `relative z-10 w-8 text-center transition-colors duration-200 ${on ? 'font-semibold text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`;
  return (
    <button type="button" role="switch" aria-checked={second} aria-label={label} title={second ? a.title : b.title}
      onClick={() => onChange(second ? a.value : b.value)} data-toggle={value}
      className="relative inline-grid h-9 flex-none cursor-pointer grid-cols-2 items-center rounded-lg bg-slate-100 p-0.5 text-base dark:bg-slate-800">
      <span aria-hidden className={`absolute inset-y-0.5 left-0.5 w-[calc(50%-0.125rem)] rounded-md bg-white shadow-sm transition-transform duration-200 ease-out motion-reduce:transition-none dark:bg-slate-600 ${second ? 'translate-x-full' : ''}`} />
      <span className={text(!second)}>{a.text}</span>
      <span className={text(second)}>{b.text}</span>
    </button>
  );
}

// The same look for three or more choices (owner 2026-11-24: All, ETFs, Stocks): each choice is its own button, the
// thumb slides under the chosen one
export function Segmented<T extends string>({ value, options, label, onChange }: { value: T; options: ToggleOption<T>[]; label: string; onChange: (v: T) => void }) {
  const at = Math.max(0, options.findIndex((o) => o.value === value));
  const n = options.length;
  return (
    <div role="radiogroup" aria-label={label} data-segmented={value}
      className="relative inline-grid h-9 flex-none items-center rounded-lg bg-slate-100 p-0.5 text-sm dark:bg-slate-800" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
      <span aria-hidden className="absolute inset-y-0.5 left-0.5 rounded-md bg-white shadow-sm transition-transform duration-200 ease-out motion-reduce:transition-none dark:bg-slate-600"
        style={{ width: `calc((100% - 0.25rem) / ${n})`, transform: `translateX(${at * 100}%)` }} />
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={o.value === value} title={o.title} onClick={() => onChange(o.value)}
          className={`relative z-10 h-full cursor-pointer whitespace-nowrap px-2.5 text-center transition-colors duration-200 ${o.value === value ? 'font-semibold text-slate-900 dark:text-white' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}>{o.text}</button>
      ))}
    </div>
  );
}
