// "Fidelity Accounts" as one wordmark (owner 2026-11-23): both words in the same bold italic, on one baseline;
// "Fidelity" in its green, "Accounts" white in the dark theme and near black in the light one. Drawn as text, no
// image file of the trademark in this public repo
export function Logo() {
  return (
    <span className="flex select-none items-baseline gap-2 text-[1.65rem] font-extrabold italic leading-none tracking-tight" aria-label="Fidelity Accounts">
      <span style={{ color: 'var(--brand)' }}>Fidelity</span>
      <span className="text-slate-900 dark:text-white">Accounts</span>
    </span>
  );
}
