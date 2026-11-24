import { useState } from 'react';
import { pct, usd } from './format';

// A donut with its legend (owner 2026-11-23: "sometime is very representative pie charts", Fidelity's asset allocation
// look). Colors follow the categorical palette in a fixed order (dataviz skill, validated on our light and dark card
// surfaces); past 7 slices the rest folds into "Other"; the legend names every slice with its share, so identity is
// never color alone (three light-mode hues sit under 3:1 contrast); 2px card-colored gaps between slices; hover tells
export interface DonutSlice { name: string; value: number; pct: number }

const SLOTS = 7;

export function foldSlices(slices: DonutSlice[], otherName: string): DonutSlice[] {
  if (slices.length <= SLOTS + 1) return slices;
  const head = slices.slice(0, SLOTS);
  const rest = slices.slice(SLOTS);
  return head.concat({ name: otherName, value: rest.reduce((s, x) => s + x.value, 0), pct: rest.reduce((s, x) => s + x.pct, 0) });
}

const color = (i: number, n: number, other: boolean) => (other && i === n - 1 ? 'var(--s-other)' : `var(--s${i + 1})`);

export function Donut({ slices, otherName }: { slices: DonutSlice[]; otherName: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const list = foldSlices(slices.filter((s) => s.value > 0), otherName);
  const folded = list.length < slices.filter((s) => s.value > 0).length;
  const total = list.reduce((s, x) => s + x.value, 0);
  if (!total) return null;
  const R = 60;
  const r = 38;
  const arc = (a0: number, a1: number) => {
    const p = (a: number, rad: number) => [70 + rad * Math.sin(a), 70 - rad * Math.cos(a)];
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const [x0, y0] = p(a0, R); const [x1, y1] = p(a1, R); const [x2, y2] = p(a1, r); const [x3, y3] = p(a0, r);
    return `M${x0},${y0}A${R},${R} 0 ${large} 1 ${x1},${y1}L${x2},${y2}A${r},${r} 0 ${large} 0 ${x3},${y3}Z`;
  };
  let a = 0;
  const shapes = list.map((s, i) => {
    const a0 = a;
    a += (s.value / total) * Math.PI * 2;
    const a1 = list.length === 1 ? a0 + Math.PI * 2 - 0.0001 : a;
    return { d: arc(a0, a1), i };
  });
  const h = hover === null ? null : list[hover]!;
  return (
    <div className="flex flex-wrap items-center gap-4" data-donut>
      <svg viewBox="0 0 140 140" width="140" height="140" className="flex-none" onPointerLeave={() => setHover(null)}>
        {shapes.map(({ d, i }) => (
          <path key={i} d={d} fill={color(i, list.length, folded)} stroke="var(--card-bg)" strokeWidth="2"
            opacity={hover === null || hover === i ? 1 : 0.45} onPointerEnter={() => setHover(i)} style={{ transition: 'opacity .12s' }} />
        ))}
        {h && (
          <text x="70" y="74" textAnchor="middle" fontSize="13" fontWeight="600" fill="currentColor">{pct(h.pct)}</text>
        )}
      </svg>
      <ul className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
        {list.map((s, i) => (
          <li key={s.name} className={`flex items-center gap-2 rounded px-1 ${hover === i ? 'bg-slate-100 dark:bg-slate-800' : ''}`}
            onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)} title={`${s.name}: ${usd(s.value)} · ${pct(s.pct)}`}>
            <span className="size-2.5 flex-none rounded-full" style={{ background: color(i, list.length, folded) }} />
            <span className="min-w-0 flex-1 truncate">{s.name}</span>
            <span className="num text-slate-500 dark:text-slate-400">{pct(s.pct)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
