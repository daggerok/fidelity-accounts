import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { sameOffset, slotOffset, type Offset } from '../app/travel';

// The phone navbar (owner 2026-11-27): ☰ left of the logo, the theme button right of it, the row of icon buttons
// folded away. ☰ slides that row down from under the logo and turns into ✕, and the theme button travels from beside
// the logo to its place at the end of the row; ✕ plays all of it backwards. From sm up nothing here is drawn

/** ☰ that turns into ✕: three bars, the outer two cross and the middle one fades */
export function MenuToggle({ open, onToggle, label }: { open: boolean; onToggle: () => void; label: string }) {
  return (
    <button type="button" className={`tb burger ${open ? 'open' : ''}`} aria-expanded={open} aria-controls="nav-buttons" title={label} aria-label={label} onClick={onToggle} data-menu-toggle>
      <span className="burger-box" aria-hidden="true"><i /><i /><i /></span>
    </button>
  );
}

/** an empty box of a navbar button's size that keeps the place the traveling button moves to */
export function Slot({ slot }: { slot: React.Ref<HTMLSpanElement> }) {
  return <span ref={slot} className="block h-9 w-9 flex-none" aria-hidden="true" />;
}

/**
 * The control that lives in one of two slots: `home` (beside the logo) and `away` (in the row). It is drawn once,
 * over the navbar, and moved between them; the places are measured on every draw, since the row's buttons come and go
 */
export function Traveler({ away, home, target, children }: { away: boolean; home: React.RefObject<HTMLSpanElement | null>; target: React.RefObject<HTMLSpanElement | null>; children: React.ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState<{ home: Offset; target: Offset } | null>(null);
  // the first placement must not glide in from the corner: the motion is switched on one frame after it
  const [glide, setGlide] = useState(false);
  const measure = () => {
    const within = box.current?.offsetParent?.getBoundingClientRect();
    const h = home.current?.getBoundingClientRect();
    const g = target.current?.getBoundingClientRect();
    if (!within || !h || !g) return;
    const next = { home: slotOffset(h, within), target: slotOffset(g, within) };
    setAt((old) => (old && sameOffset(old.home, next.home) && sameOffset(old.target, next.target) ? old : next));
  };
  useLayoutEffect(measure);
  useEffect(() => {
    if (!at || glide) return undefined;
    const id = requestAnimationFrame(() => setGlide(true));
    return () => cancelAnimationFrame(id);
  }, [at, glide]);
  // the navbar changes its size without a draw of ours too (a turned phone, a wrapped row)
  useEffect(() => {
    const parent = box.current?.offsetParent;
    if (!parent || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(measure);
    ro.observe(parent);
    return () => ro.disconnect();
  }, []);
  const to = at ? (away ? at.target : at.home) : null;
  return (
    <div ref={box} className={`traveler ${glide ? 'glide' : ''}`} style={{ transform: to ? `translate(${to.x}px, ${to.y}px)` : undefined, visibility: to ? 'visible' : 'hidden' }} data-traveler={away ? 'away' : 'home'}>
      {children}
    </div>
  );
}
