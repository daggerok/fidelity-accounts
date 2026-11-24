// The Fidelity wordmark drawn as text in its green (no image file of the trademark in this public repo) with the
// app's own "accounts" tag, so the page is never mistaken for Fidelity's site
export function Logo() {
  return (
    <span className="flex items-baseline gap-1.5 select-none" aria-label="Fidelity accounts">
      <span className="text-[1.65rem] font-extrabold italic leading-none tracking-tight" style={{ color: 'var(--brand)' }}>Fidelity</span>
      <span className="rounded-md border border-slate-300 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:border-slate-600 dark:text-slate-400">accounts</span>
    </span>
  );
}
