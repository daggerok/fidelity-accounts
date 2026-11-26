/// <reference lib="esnext" />
// The rows Positions draws (owner 2026-11-24: only the rows in view, 1,100 positions were 21,000 cells): rows of one
// fixed height in a box scrolled to `top`, `height` tall; the first row drawn and the end (exclusive, not yet cut to the
// number of rows), `overscan` rows more on each side. Kept as two numbers, so a scroll inside one row gives the same window
export interface RowWindow { first: number; end: number }

export function rowWindow(top: number, height: number, row: number, overscan: number): RowWindow {
  return { first: Math.max(0, Math.floor(top / row) - overscan), end: Math.ceil((top + height) / row) + overscan };
}

export const sameWindow = (a: RowWindow, b: RowWindow): boolean => a.first === b.first && a.end === b.end;
