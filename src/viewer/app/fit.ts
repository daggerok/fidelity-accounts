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

/**
 * A size change after a card's own row change is not a reason to start counting rounds again (useFitRows): the card that
 * grew pushes the cards in the packed columns, and two cards that answer each other's change could go on forever. The
 * page around the cards (the settings, the tabs panel, the window) always starts again; a change of the cards themselves
 * only when no card changed its rows in the last `FIT_SELF_MS` (new data, a card of another column growing)
 */
export const FIT_SELF_MS = 300;
export function fitRestarts(byPage: boolean, msSinceOwnChange: number): boolean {
  return byPage || msSinceOwnChange > FIT_SELF_MS;
}

/**
 * The phone's Positions table (owner 2026-11-27: the ticker column was too wide, "we must fit the 4 first columns ...
 * on the mobile view screen"): the width of a plain column, so the Symbol column and four of them fill the table's box
 * exactly; never so narrow that +12.34% is cut, never wider than a readable gap
 */
export const PHONE_SYMBOL_W = 76;
export const PHONE_EDGE = 4;
export const phoneColumnWidth = (boxWidth: number): number => Math.max(60, Math.min(84, Math.floor((boxWidth - PHONE_SYMBOL_W - PHONE_EDGE) / 4)));
