import { useEffect, useMemo, useRef, useState } from 'react';
import { resample, valueRange, type Point } from '../../shared/history';
import { shortUsd, siteDate, usd } from './format';

// A light SVG line chart in the Fidelity look: the line with a soft fill, three value levels on the right, the first and
// last date below, a crosshair with the date and value under the pointer. Sizes itself to its box (ResizeObserver)
export function LineChart({ points, height = 220, up }: { points: Point[]; height?: number; up: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => setWidth(Math.max(200, el.clientWidth)));
    ro.observe(el);
    setWidth(Math.max(200, el.clientWidth));
    return () => ro.disconnect();
  }, []);
  // morph between periods (owner 2026-11-24): the line in chart units (0 = bottom, 1 = top) is kept; when the period
  // changes the old line is blended into the new one over 300 ms, then the exact line is drawn again
  const N = Math.min(400, Math.max(2, points.length));
  const norm = useMemo(() => {
    if (points.length < 2) return [];
    const v = points.map((p) => p.value);
    const { min: lo, max: hi } = valueRange(v);
    return v.map((x) => (x - lo) / (hi - lo));
  }, [points]);
  const shown = useRef<number[] | null>(null);
  const [blend, setBlend] = useState<number[] | null>(null);
  const shape = points.length ? `${points[0]!.date}|${points[points.length - 1]!.date}|${points.length}` : '';
  useEffect(() => {
    const from = shown.current;
    const to = resample(norm, N);
    shown.current = to;
    const reduced = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (!from || !to.length || reduced) return undefined;
    const a = resample(from, N);
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const k = Math.min(1, (now - start) / 300);
      const e = 1 - (1 - k) ** 3;
      setBlend(k < 1 ? to.map((y, i) => a[i]! + (y - a[i]!) * e) : null);
      if (k < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [shape]);
  if (points.length < 2) return <div ref={box} style={{ height }} />;
  const { min, max } = valueRange(points.map((p) => p.value));
  const levels = [max - (max - min) * 0.05, (max + min) / 2, min + (max - min) * 0.05];
  // the value labels end at the right edge of the box, where the card's other numbers end (owner 2026-11-27: the gap to
  // the card's side was wider than everywhere else): their column is as wide as the longest label (11 px digits are
  // about 6.4 px each) plus 8 px to the plot
  const labels = Math.ceil(Math.max(...levels.map((v) => shortUsd(v).length)) * 6.4);
  const pad = { l: 4, r: labels + 8, t: 10, b: 24 };
  const w = width - pad.l - pad.r;
  const h = height - pad.t - pad.b;
  const x = (i: number) => pad.l + (i / (points.length - 1)) * w;
  const y = (v: number) => pad.t + (1 - (v - min) / (max - min)) * h;
  const line = blend
    ? blend.map((u, i) => `${i ? 'L' : 'M'}${(pad.l + (i / (blend.length - 1)) * w).toFixed(1)},${(pad.t + (1 - u) * h).toFixed(1)}`).join('')
    : points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join('');
  const area = `${line}L${(pad.l + w).toFixed(1)},${pad.t + h}L${pad.l},${pad.t + h}Z`;
  const color = up ? 'var(--gain)' : 'var(--loss)';
  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.round(((e.clientX - r.left - pad.l) / w) * (points.length - 1));
    setHover(Math.max(0, Math.min(points.length - 1, i)));
  };
  const hp = hover === null ? null : points[hover]!;
  return (
    <div ref={box} className="relative w-full select-none" style={{ height }} data-chart>
      {/* a vertical swipe over the chart scrolls the page on a phone (touch-pan-y; touch-none held the page still); a
          sideways finger still moves the crosshair, and when the browser takes the swipe for the page it cancels the
          pointer, so the crosshair goes away */}
      <svg width={width} height={height} onPointerMove={onMove} onPointerLeave={() => setHover(null)} onPointerCancel={() => setHover(null)} className="block touch-pan-y">
        <defs>
          <linearGradient id="fa-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity="0.22" />
            <stop offset="1" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {levels.map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={pad.l + w} y1={y(v)} y2={y(v)} stroke="currentColor" strokeOpacity="0.15" strokeDasharray="4 4" />
            <text x={width} y={y(v) + 4} fontSize="11" textAnchor="end" fill="currentColor" fillOpacity="0.6" data-level>{shortUsd(v)}</text>
          </g>
        ))}
        <path d={area} fill="url(#fa-fill)" />
        <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
        <text x={pad.l} y={height - 6} fontSize="11" fill="currentColor" fillOpacity="0.6">{siteDate(points[0]!.date)}</text>
        <text x={pad.l + w} y={height - 6} fontSize="11" textAnchor="end" fill="currentColor" fillOpacity="0.6">{siteDate(points[points.length - 1]!.date)}</text>
        {hp && (
          <g>
            <line x1={x(hover!)} x2={x(hover!)} y1={pad.t} y2={pad.t + h} stroke="currentColor" strokeOpacity="0.35" />
            <circle cx={x(hover!)} cy={y(hp.value)} r="4" fill={color} />
          </g>
        )}
      </svg>
      {hp && (
        // one line above the chart, over the period change text (owner 2026-11-24: the box hid the line; while a value
        // is pointed at, that text matters less), so the line under the cursor stays visible
        <div className="pointer-events-none absolute bottom-full z-10 mb-1 whitespace-nowrap rounded-md border border-slate-200 bg-white px-2 py-1 text-xs shadow dark:border-slate-700 dark:bg-slate-800"
          style={{ left: Math.min(Math.max(0, x(hover!) - 90), width - 190) }} data-chart-tip>
          <span className="num font-semibold">{usd(hp.value)}</span> <span className="text-slate-500 dark:text-slate-400">{siteDate(hp.date)}</span>
        </div>
      )}
    </div>
  );
}
