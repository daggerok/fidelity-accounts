import { useEffect, useRef } from 'react';

// The checkbox of the app (the accounts strip): brand coloured, a partly ticked state, and a click
// on it never reaches the chip around it. The label around it is its hit area on a touch screen (index.css .hit: as tall
// as the chip, a few px to each side), so a finger that misses the 14 px box by a little ticks it instead of pressing the
// chip; the label's own click stops there too, its default still ticks the box
export function Check({ checked, mixed, label, onChange }: { checked: boolean; mixed?: boolean; label: string; onChange: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = !!mixed && !checked; }, [mixed, checked]);
  return (
    <label className="hit flex flex-none [--hit-x:6px] [--hit-y:9px]" onClick={(e) => e.stopPropagation()}>
      <input ref={ref} type="checkbox" className="size-3.5 flex-none cursor-pointer accent-[var(--brand)]" checked={checked} aria-label={label}
        onClick={(e) => e.stopPropagation()} onChange={onChange} />
    </label>
  );
}
