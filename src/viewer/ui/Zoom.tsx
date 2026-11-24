import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { t } from '../app/i18n';
import { CORNER_BUTTON, CloseIcon } from './icons';

// A card or a chart drawn big on top of the page (owner 2026-11-23: maximize and minimize for every plate where it makes
// sense; ✕, a click anywhere outside or Esc puts it back). Zoom in and out (owner 2026-11-24: "I want to see some
// animations"): the window grows out of the card it came from and shrinks back into it, the page dims under it; with
// reduced motion asked by the system it simply appears. `tools` sit next to the title, like on the card
const EASE = 'cubic-bezier(.2,.8,.2,1)';
const MS = 280;

export function Zoom({ open, title, onClose, children, tools, origin }: { open: boolean; title: string; onClose: () => void; children: React.ReactNode; tools?: React.ReactNode; origin?: React.RefObject<HTMLElement | null> }) {
  const [mounted, setMounted] = useState(open);
  const panel = useRef<HTMLDivElement>(null);
  const back = useRef<HTMLDivElement>(null);
  useEffect(() => { if (open) setMounted(true); }, [open]);
  useLayoutEffect(() => {
    const p = panel.current;
    const b = back.current;
    if (!mounted || !p || !b) return undefined;
    if (typeof p.animate !== 'function') { if (!open) setMounted(false); return undefined; }
    // from the card's box to the window's box: translate and scale from the top left corner
    const to = p.getBoundingClientRect();
    const from = origin?.current?.getBoundingClientRect();
    const start: Keyframe = from && to.width && to.height
      ? { transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width}, ${from.height / to.height})`, opacity: 0 }
      : { transform: 'scale(.95)', opacity: 0 };
    const reduced = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const opts: KeyframeAnimationOptions = { duration: reduced ? 0 : MS, easing: 'linear', fill: 'both' };
    const end: Keyframe = { transform: 'none', opacity: 1 };
    // the window stays solid while it moves and only fades in the quarter next to the card (owner 2026-11-24: it was too
    // transparent while shrinking on Esc); opacity has its own keyframe at 25% or 75%, the transform runs straight through
    // the easing sits on the first keyframe, so it shapes the move while the time runs linear and the fade really happens
    // only in that quarter (an easing on the whole animation pulled the fade to the first third)
    const grow = p.animate(open ? [{ ...start, easing: EASE }, { opacity: 1, offset: 0.25 }, end] : [{ ...end, easing: EASE }, { opacity: 1, offset: 0.75 }, start], opts);
    const dim = b.animate(open ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 1 }, { opacity: 0 }], opts);
    let done = false;
    grow.onfinish = () => {
      done = true;
      if (open) { grow.cancel(); dim.cancel(); } else setMounted(false);
    };
    // a reopen while it shrinks stops the old animation; the new one starts from the card again
    return () => { if (!done) { grow.cancel(); dim.cancel(); } };
  }, [open, mounted]);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!mounted) return null;
  // drawn into <body>, not inside the card: a card in the packed columns with its own view-transition layer would let
  // the next card paint over the window (owner 2026-11-24 found it)
  return createPortal((
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={title} data-chart-zoom>
      <div ref={back} className="absolute inset-0 bg-slate-950/60" onClick={onClose} />
      <div ref={panel} className="card relative flex max-h-full w-full max-w-[min(96vw,100rem)] flex-col gap-3 overflow-auto" style={{ transformOrigin: 'top left' }}>
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">{title}</h2>
          {tools && <span className="-my-1 flex items-center gap-1">{tools}</span>}
          <button type="button" className={`${CORNER_BUTTON} ml-auto`} title={t('Close')} onClick={onClose}><CloseIcon /></button>
        </div>
        {children}
      </div>
    </div>
  ), document.body);
}
