/// <reference lib="esnext" />
// 👀 Watch (owner 2026-11-23: "if markets are open we would want to see how data is changing"): while it is on, the
// Fidelity tab presses the page's own "Refresh Positions" button every minute (a read: the page asks for the positions
// again, nothing changes on Fidelity) and hands every change to the viewer, at most every 30 s; Sheets get a copy at most
// every 10 minutes (each write is a few MB). Off: one read when Positions opens, and whenever asked (⬇ on the panel)
export const WATCH_KEY = 'fidelity-accounts.watch'; // boolean, shared by the viewer and the Fidelity tab
export const WATCH_REFRESH_MS = 60_000;
export const WATCH_READ_GAP_MS = 30_000;
export const WATCH_SHEETS_GAP_MS = 10 * 60_000;

/** take this copy of the grid? asked = ⬇ or a command; otherwise once per page, or every 30 s while watching */
export function acceptRead(p: { asked: boolean; watching: boolean; now: number; lastRead: number }): boolean {
  if (p.asked || p.lastRead === 0) return true;
  return p.watching && p.now - p.lastRead >= WATCH_READ_GAP_MS;
}

/** write the sheet now? always when not watching (reads are rare then), else at most every 10 minutes */
export function sheetsDue(p: { asked: boolean; watching: boolean; now: number; lastWrite: number }): boolean {
  return p.asked || !p.watching || p.now - p.lastWrite >= WATCH_SHEETS_GAP_MS;
}

/**
 * Is the regular US session open (9:30 to 16:00 New York, Monday to Friday)? Refresh Positions only matters then
 * (owner 2026-11-24: "refresh positions needed only to get new data from position changes on open market"); exchange
 * holidays are not known here, a refresh on one just reads the same numbers
 */
export function marketOpen(now: Date): boolean {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', minute: 'numeric', hour12: false }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  if (get('weekday') === 'Sat' || get('weekday') === 'Sun') return false;
  const minutes = (Number(get('hour')) % 24) * 60 + Number(get('minute'));
  return minutes >= 9 * 60 + 30 && minutes < 16 * 60;
}

/** the page's own refresh button of the positions grid (seen live 2026-11-23: accessible name "Refresh Positions") */
export function findRefreshButton(doc: Document): HTMLElement | null {
  const byLabel = doc.querySelector<HTMLElement>('button[aria-label="Refresh Positions" i], button[title="Refresh Positions" i]');
  if (byLabel) return byLabel;
  return Array.from(doc.querySelectorAll<HTMLElement>('button')).find((b) => /^refresh positions$/i.test((b.getAttribute('aria-label') || b.textContent || '').trim())) ?? null;
}
