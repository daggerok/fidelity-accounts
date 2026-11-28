import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { focusQuietly, lastWasPointer, trapIndex, watchInput } from '../app/focus';
import { t } from '../app/i18n';
import { CORNER_BUTTON, CloseIcon } from './icons';

// A card or a chart drawn big on top of the page (owner 2026-11-23: maximize and minimize for every plate where it makes
// sense; ✕, a click anywhere outside or Esc puts it back). Zoom in and out (owner 2026-11-24: "I want to see some
// animations"): the window grows out of the card it came from and shrinks back into it, the page dims under it; with
// reduced motion asked by the system it simply appears. `tools` sit next to the title, like on the card
const EASE = 'cubic-bezier(.2,.8,.2,1)';
const MS = 280;

// what Tab can reach inside the window: no disabled controls, no tabindex -1 (the ‹ › of a strip), nothing inert or hidden
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]';
const focusables = (root: HTMLElement): HTMLElement[] =>
  Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.tabIndex >= 0 && !el.closest('[inert]') && el.getClientRects().length > 0);

// `narrow`: a window of controls (the positions columns), not a chart that wants the whole width
export function Zoom({ open, title, onClose, children, tools, origin, narrow }: { open: boolean; title: string; onClose: () => void; children: React.ReactNode; tools?: React.ReactNode; origin?: React.RefObject<HTMLElement | null>; narrow?: boolean }) {
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
  // a modal window holds the focus: it moves to ✕ when the window opens, Tab and Shift+Tab go round inside it
  // (trapIndex), and on close it goes back to what opened the window (the ⤢ or the columns button). The window is drawn
  // a moment after `open` (mounted), so the focus moves on that draw
  const closeButton = useRef<HTMLButtonElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  // opened with a pointer: the focus moves without its ring, on ✕ and back on what opened the window (app/focus.ts)
  const byPointer = useRef(false);
  useEffect(() => watchInput(), []); // know how things are done while this window lives
  useEffect(() => {
    if (open) {
      const active = document.activeElement;
      if (active instanceof HTMLElement && !panel.current?.contains(active)) { opener.current = active; byPointer.current = lastWasPointer(); }
      focusQuietly(closeButton.current, byPointer.current);
      return;
    }
    const back = opener.current;
    opener.current = null;
    if (back?.isConnected) focusQuietly(back, byPointer.current);
  }, [open, mounted]);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'Tab' && panel.current) {
        const list = focusables(panel.current);
        const to = trapIndex(list.length, list.indexOf(document.activeElement as HTMLElement), e.shiftKey);
        if (to !== null) { e.preventDefault(); list[to]!.focus(); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!mounted) return null;
  // drawn into <body>, not inside the card: a card in the packed columns with its own view-transition layer would let
  // the next card paint over the window (owner 2026-11-24 found it)
  return createPortal((
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={title} data-chart-zoom>
      <div ref={back} className="absolute inset-0 bg-slate-950/60" onClick={onClose} />
      <div ref={panel} className={`card relative flex max-h-full w-full ${narrow ? 'max-w-4xl' : 'max-w-[min(96vw,100rem)]'} flex-col gap-3 overflow-auto`} style={{ transformOrigin: 'top left' }}>
        {/* the tools sit on the right next to ✕, as on the card next to ⤢ (owner 2026-11-24: "move all buttons to the right") */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h2 className="text-lg font-semibold" style={{ color: 'var(--brand)' }}>{title}</h2>
          {/* a phone (owner 2026-11-27): ✕ stays on the title's line, at its right end, and the chips go to the next line;
              from sm up they sit before ✕ on one line. `order` places them, the Tab order stays tools then ✕ */}
          {tools && <span className="order-3 -my-1 flex w-full flex-wrap items-center justify-end gap-2 sm:order-2 sm:ml-auto sm:w-auto" data-zoom-tools>{tools}</span>}
          <button ref={closeButton} type="button" className={`${CORNER_BUTTON} order-2 !ml-auto ${tools ? 'sm:order-3 sm:!-ml-1' : ''}`} title={t('Close')} aria-label={t('Close')} onClick={onClose}><CloseIcon /></button>
        </div>
        {children}
      </div>
    </div>
  ), document.body);
}
