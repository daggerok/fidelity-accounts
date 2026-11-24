/// <reference lib="esnext" />
import { flushSync } from 'react-dom';

// Layout changes with a smooth morph instead of a jump (owner 2026-11-23: "boxes sizes are changing, so I want to see it
// with better user experience"): the browser's View Transitions animate every card from its old box to its new one
// (each card has its own view-transition-name). Without the API, or with reduced motion asked by the system, the
// change simply happens
export function animate(change: () => void): void {
  const doc = typeof document === 'undefined' ? null : (document as Document & { startViewTransition?: (cb: () => void) => unknown });
  const reduced = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (!doc || !doc.startViewTransition || reduced) { change(); return; }
  doc.startViewTransition(() => { flushSync(change); });
}
