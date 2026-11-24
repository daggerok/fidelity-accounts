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

