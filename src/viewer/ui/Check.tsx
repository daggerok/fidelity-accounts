import { useEffect, useRef } from 'react';

// The checkbox of the app (the accounts strip): brand coloured, a partly ticked state, and a click
// on it never reaches the chip around it
export function Check({ checked, mixed, label, onChange }: { checked: boolean; mixed?: boolean; label: string; onChange: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = !!mixed && !checked; }, [mixed, checked]);
  return (
    <input ref={ref} type="checkbox" className="size-3.5 flex-none cursor-pointer accent-[var(--brand)]" checked={checked} aria-label={label}
      onClick={(e) => e.stopPropagation()} onChange={onChange} />
  );
}
