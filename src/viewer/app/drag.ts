/// <reference lib="esnext" />
// The rules of dragging a row in a list that scrolls (SortableList in the columns window), apart from the drawing

/** the index the dragged row lands at: after every middle of the other rows above the pointer (both in list coordinates) */
export const dropIndex = (mids: number[], y: number): number => mids.filter((m) => m < y).length;

export const EDGE_ZONE_PX = 32;
export const EDGE_MAX_PX = 12;

/**
 * how far a scroll box scrolls in one frame while a row is dragged near its edge: up (negative) in the band of `zone` px
 * under its top, down near its bottom, faster the closer to the edge (and past it), 0 in between
 */
export function edgeSpeed(y: number, top: number, bottom: number, zone = EDGE_ZONE_PX, max = EDGE_MAX_PX): number {
  if (bottom - top <= zone * 2) return 0;
  if (y < top + zone) return -Math.ceil(max * Math.min(1, (top + zone - y) / zone));
  if (y > bottom - zone) return Math.ceil(max * Math.min(1, (y - (bottom - zone)) / zone));
  return 0;
}
