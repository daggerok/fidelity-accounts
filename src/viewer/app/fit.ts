/// <reference lib="esnext" />
// How many rows a card shows so it ends close to the footer (owner 2026-11-25: "add more items in our plates for Your top
// and bottom movers and for Upcoming dividends just enough to be close to the footer"): from the rows shown now and the
// room left under the card (negative = it already runs past), in steps of one row or one pair of rows, kept between
// the card's own count and all the rows there are
export function fitCount(current: number, roomPx: number, stepPx: number, min: number, max: number): number {
  if (!(stepPx > 0) || !Number.isFinite(roomPx)) return Math.max(min, Math.min(max, current));
  const next = roomPx >= 0 ? current + Math.floor(roomPx / stepPx) : current - Math.ceil(-roomPx / stepPx);
  return Math.max(min, Math.min(Math.max(min, max), next));
}
