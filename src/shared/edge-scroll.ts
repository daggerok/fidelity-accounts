/// <reference lib="esnext" />
// Ported from daggerok/gex src/edge-scroll.ts (owner 2026-11-24: the accounts strip in the navbar scrolls like the gex
// Expirations and Levels panels). Pure view geometry, unit tested; ui/EdgeScrollRow.tsx measures and scrolls
/** Which sides of a horizontal scroller have more content: a fade and a button show on those sides. */
export interface ScrollEdges {
  left: boolean;
  right: boolean;
}

/** Sub-pixel scroll positions (zoom, fractional widths) within this many px of an end count as that end. */
export const EDGE_EPSILON_PX = 1;

/** The sides of a scroller (its scrollLeft, clientWidth and scrollWidth) that have more content. */
export function scrollEdges(scrollLeft: number, clientWidth: number, scrollWidth: number): ScrollEdges {
  return {
    left: scrollLeft > EDGE_EPSILON_PX,
    right: scrollLeft + clientWidth < scrollWidth - EDGE_EPSILON_PX,
  };
}

/**
 * The scrollLeft that brings the next (`dir` 1) or the previous (`dir` -1) chip fully into view, or null when there is
 * none. `chips` are the chips' left and right edges in the scroller's content coordinates, in order. `inset` is the width
 * a button and its fade cover at an edge: a chip under it counts as hidden, and the revealed chip ends `inset` px inside
 * the edge so the button does not cover it. The result is clamped to the scroll range.
 */
export function edgeScrollTarget(
  chips: ReadonlyArray<{ left: number; right: number }>,
  scrollLeft: number,
  clientWidth: number,
  scrollWidth: number,
  dir: 1 | -1,
  inset: number,
): number | null {
  const max = Math.max(0, scrollWidth - clientWidth);
  const clamp = (x: number) => Math.min(max, Math.max(0, x));
  if (dir === 1) {
    const viewRight = scrollLeft + clientWidth - inset;
    const next = chips.find((c) => c.right > viewRight + EDGE_EPSILON_PX);
    return next ? clamp(next.right - clientWidth + inset) : null;
  }
  const viewLeft = scrollLeft + inset;
  let prev: { left: number; right: number } | undefined;
  for (const c of chips) if (c.left < viewLeft - EDGE_EPSILON_PX) prev = c;
  return prev ? clamp(prev.left - inset) : null;
}

/**
 * The CSS mask that fades the clipped sides of the row (`px` wide) and leaves the rest opaque; null with nothing clipped.
 * A mask (not a gradient overlay) so it works on any panel background, theme and palette.
 */
export function edgeFadeMask(edges: ScrollEdges, px: number, clear = 0): string | null {
  if (!edges.left && !edges.right) return null;
  // `clear` px at a clipped edge are fully hidden (the arrow sits there, no text under it), then the fade
  const left = !edges.left ? '#000 0' : clear ? `transparent 0, transparent ${clear}px, #000 ${clear + px}px` : `transparent 0, #000 ${px}px`;
  const right = !edges.right ? '#000 100%' : clear ? `#000 calc(100% - ${clear + px}px), transparent calc(100% - ${clear}px), transparent 100%` : `#000 calc(100% - ${px}px), transparent 100%`;
  return `linear-gradient(to right, ${left}, ${right})`;
}
