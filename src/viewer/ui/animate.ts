/// <reference lib="esnext" />
import { flushSync } from 'react-dom';

// Layout changes with a smooth morph instead of a jump (owner 2026-11-23: "boxes sizes are changing, so I want to see it
// with better user experience"): the browser's View Transitions animate every card from its old box to its new one
// (each card has its own view-transition-name). Without the API, or with reduced motion asked by the system, the
// change simply happens
type VT = { ready?: Promise<unknown>; finished?: Promise<unknown>; updateCallbackDone?: Promise<unknown> } | undefined;

export function animate(change: () => void): void {
  const doc = typeof document === 'undefined' ? null : (document as Document & { startViewTransition?: (cb: () => void) => VT });
  const reduced = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  // a big window is open: no page transition, it would cross-fade the dimmed page behind the window and blink
  // (owner 2026-11-24); the change simply happens inside the window
  const zoomOpen = !!doc?.querySelector('[data-chart-zoom]');
  if (!doc || !doc.startViewTransition || reduced || zoomOpen) { change(); return; }
  const vt = doc.startViewTransition(() => { flushSync(change); });
  // a new transition skips the old one and rejects these promises with AbortError; nobody awaits them, so swallow it
  vt?.ready?.catch(() => {});
  vt?.finished?.catch(() => {});
  vt?.updateCallbackDone?.catch(() => {});
}
