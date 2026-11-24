import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { edgeFadeMask, edgeScrollTarget, scrollEdges, type ScrollEdges } from '../../shared/edge-scroll';

// A horizontal strip with no scrollbar, ported from daggerok/gex components/EdgeScrollRow.tsx (owner 2026-11-24: the
// accounts and groups in the navbar scroll smoothly like the gex Expirations panel). A side with more chips fades out
// and shows a ‹ or › button that glides the previous or next hidden chip into view; trackpad and touch swipes scroll
// natively, a vertical mouse wheel scrolls it sideways. `items` picks the chips to step over (nested chips count too)
const EDGE_FADE_PX = 40; // a soft fade after the arrow's clear band (owner 2026-11-24: "do nicer")
const ARROW_PX = 24; // the arrow's band at a clipped edge: nothing shows under it
const NO_EDGES: ScrollEdges = { left: false, right: false };

// the ‹ › arrow: a bare chevron over the faded edge (owner 2026-11-24: no circle), sliding and fading in when there is
// more that way and out when there is not (always in the DOM, so it can animate)
function EdgeButton({ dir, label, show, onClick }: { dir: 1 | -1; label: string; show: boolean; onClick: () => void }) {
  return (
    <div className={`pointer-events-none absolute inset-y-0 z-10 flex items-center ${dir === 1 ? 'right-0' : 'left-0'}`}>
      <button type="button" tabIndex={-1} onClick={onClick} aria-label={label} title={label} aria-hidden={!show} data-strip-scroll={dir === 1 ? 'next' : 'prev'}
        className={`grid h-full w-6 place-items-center text-slate-500 transition-[opacity,transform,color] duration-200 ease-out hover:text-slate-900 dark:text-slate-400 dark:hover:text-white ${show ? 'pointer-events-auto translate-x-0 opacity-100' : `${dir === 1 ? '-translate-x-1' : 'translate-x-1'} opacity-0`}`}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="size-5">
          <path d={dir === 1 ? 'm9 6 6 6-6 6' : 'm15 6-6 6 6 6'} />
        </svg>
      </button>
    </div>
  );
}

// `storeKey`: the scroll position is kept in localStorage and put back after a reload (owner 2026-11-24), once the strip
// is wide enough to take it (the data may come a moment later)
export function EdgeScrollRow({ prevLabel, nextLabel, items, label, storeKey, className = '', children }: { prevLabel: string; nextLabel: string; items: string; label: string; storeKey?: string; className?: string; children: React.ReactNode }) {
  const rowRef = useRef<HTMLElement>(null);
  const [edges, setEdges] = useState<ScrollEdges>(NO_EDGES);
  useLayoutEffect(() => {
    const row = rowRef.current;
    if (!row) return undefined;
    let frame = 0;
    let saved: number | null = null;
    try { const v = storeKey ? Number(localStorage.getItem(storeKey)) : 0; saved = v > 0 ? v : null; } catch { /* private window */ }
    const until = Date.now() + 3000; // the data comes in the first seconds; later a narrower strip keeps the user's scroll
    const measure = () => {
      if (saved !== null && Date.now() > until) saved = null;
      if (saved !== null && row.scrollWidth - row.clientWidth >= Math.min(saved, 1)) {
        row.scrollLeft = saved;
        if (row.scrollWidth - row.clientWidth >= saved) saved = null; // all of it fits: restored
      } else if (storeKey && saved === null) {
        try { localStorage.setItem(storeKey, String(Math.round(row.scrollLeft))); } catch { /* private window */ }
      }
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
  }, [items, storeKey]);
  const step = useCallback((dir: 1 | -1) => {
    const row = rowRef.current;
    if (!row) return;
    const box = row.getBoundingClientRect();
    const chips = Array.from(row.querySelectorAll(items)).map((c) => c.getBoundingClientRect())
      .filter((r) => r.width > 0)
      .map((r) => ({ left: r.left - box.left + row.scrollLeft, right: r.right - box.left + row.scrollLeft }))
      .sort((a, b) => a.left - b.left);
    const target = edgeScrollTarget(chips, row.scrollLeft, row.clientWidth, row.scrollWidth, dir, EDGE_FADE_PX + ARROW_PX);
    if (target !== null) row.scrollTo({ left: target, behavior: 'smooth' });
  }, [items]);
  const mask = edgeFadeMask(edges, EDGE_FADE_PX, ARROW_PX) ?? undefined;
  return (
    <div className={`relative flex min-w-0 ${className}`} data-strip>
      <nav ref={rowRef} aria-label={label} className="scrollbar-hidden flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto py-0.5" style={{ maskImage: mask, WebkitMaskImage: mask }} data-strip-row>
        {children}
      </nav>
      <EdgeButton dir={-1} label={prevLabel} show={edges.left} onClick={() => step(-1)} />
      <EdgeButton dir={1} label={nextLabel} show={edges.right} onClick={() => step(1)} />
    </div>
  );
}
