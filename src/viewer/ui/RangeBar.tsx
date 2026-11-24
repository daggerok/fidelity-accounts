// a grey track with a marker at `pos` (0..1): where a price sits between its 52-week low and high
export function RangeBar({ pos, color, shape = 'dot', className = '', title }: { pos: number; color?: string; shape?: 'dot' | 'diamond'; className?: string; title?: string }) {
  const marker = shape === 'diamond'
    ? 'absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rotate-45 bg-slate-800 dark:bg-slate-200'
    : 'absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full';
  return (
    <span className={`relative h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 ${className}`} title={title}>
      <span className={marker} style={{ left: `${pos * 100}%`, background: color }} />
    </span>
  );
}
