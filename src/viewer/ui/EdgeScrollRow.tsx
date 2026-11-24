import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { edgeFadeMask, edgeScrollTarget, scrollEdges, type ScrollEdges } from '../../shared/edge-scroll';

// A horizontal strip with no scrollbar, ported from daggerok/gex components/EdgeScrollRow.tsx (owner 2026-11-24: the
// accounts and groups in the navbar scroll smoothly like the gex Expirations panel). A side with more chips fades out
// and shows a ‹ or › button that glides the previous or next hidden chip into view; trackpad and touch swipes scroll
// natively, a vertical mouse wheel scrolls it sideways. `items` picks the chips to step over (nested chips count too)
export const EDGE_FADE_PX = 28;
const NO_EDGES: ScrollEdges = { left: false, right: false };

function EdgeButton({ dir, label, onClick }: { dir: 1 | -1; label: string; onClick: () => void }) {
  return (
    <div className={`absolute inset-y-0 z-10 flex items-center ${dir === 1 ? 'right-0' : 'left-0'}`}>
      <button type="button" tabIndex={-1} onClick={onClick} aria-label={label} title={label} data-strip-scroll={dir === 1 ? 'next' : 'prev'}
        className="grid size-6 place-items-center rounded-full border border-slate-300 bg-white text-slate-500 shadow-sm hover:text-slate-800 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300 dark:hover:text-white">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="size-3.5">
          <path d={dir === 1 ? 'm9 6 6 6-6 6' : 'm15 6-6 6 6 6'} />
        </svg>
      </button>
    </div>
  );
}

export function EdgeScrollRow({ prevLabel, nextLabel, items, label, className = '', children }: { prevLabel: string; nextLabel: string; items: string; label: string; className?: string; children: React.ReactNode }) {
  const rowRef = useRef<HTMLElement>(null);
  const [edges, setEdges] = useState<ScrollEdges>(NO_EDGES);
  useLayoutEffect(() => {
    const row = rowRef.current;
    if (!row) return undefined;
    let frame = 0;
    const measure = () => {
      const e = scrollEdges(row.scrollLeft, row.clientWidth, row.scrollWidth);
      setEdges((prev) => (prev.left === e.left && prev.right === e.right ? prev : e));
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); };
    measure();
    const wheel = (ev: WheelEvent) => {
      if (Math.abs(ev.deltaY) <= Math.abs(ev.deltaX) || row.scrollWidth <= row.clientWidth) return;
      const before = row.scrollLeft;
      row.scrollLeft += ev.deltaMode === 1 ? ev.deltaY * 16 : ev.deltaY;
      if (row.scrollLeft !== before) ev.preventDefault();
    };
    row.addEventListener('scroll', schedule, { passive: true });
    row.addEventListener('wheel', wheel, { passive: false });
    // the strip, its chips and the folding groups resize: measure again (also on the slide of a fold)
    const ro = new ResizeObserver(schedule);
    const observe = () => { ro.disconnect(); ro.observe(row); row.querySelectorAll(items).forEach((c) => ro.observe(c)); Array.from(row.children).forEach((c) => ro.observe(c)); };
    observe();
    const mo = new MutationObserver(() => { observe(); schedule(); });
    mo.observe(row, { childList: true, subtree: true });
    row.addEventListener('transitionend', schedule);
    return () => { row.removeEventListener('scroll', schedule); row.removeEventListener('wheel', wheel); row.removeEventListener('transitionend', schedule); ro.disconnect(); mo.disconnect(); cancelAnimationFrame(frame); };
  }, [items]);
  const step = useCallback((dir: 1 | -1) => {
    const row = rowRef.current;
    if (!row) return;
    const box = row.getBoundingClientRect();
    const chips = Array.from(row.querySelectorAll(items)).map((c) => c.getBoundingClientRect())
      .filter((r) => r.width > 0)
      .map((r) => ({ left: r.left - box.left + row.scrollLeft, right: r.right - box.left + row.scrollLeft }))
      .sort((a, b) => a.left - b.left);
    const target = edgeScrollTarget(chips, row.scrollLeft, row.clientWidth, row.scrollWidth, dir, EDGE_FADE_PX);
    if (target !== null) row.scrollTo({ left: target, behavior: 'smooth' });
  }, [items]);
  const mask = edgeFadeMask(edges, EDGE_FADE_PX) ?? undefined;
  return (
    <div className={`relative flex min-w-0 ${className}`} data-strip>
      <nav ref={rowRef} aria-label={label} className="scrollbar-hidden flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto py-0.5" style={{ maskImage: mask, WebkitMaskImage: mask }} data-strip-row>
        {children}
      </nav>
      {edges.left && <EdgeButton dir={-1} label={prevLabel} onClick={() => step(-1)} />}
      {edges.right && <EdgeButton dir={1} label={nextLabel} onClick={() => step(1)} />}
    </div>
  );
}
