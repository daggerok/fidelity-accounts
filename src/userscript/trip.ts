/// <reference lib="esnext" />
// The round trip to Positions (owner 2026-11-25: "remember which page has been opened to back to it when script
// done"; 👀: "each 10 minutes switch, do and go back"): before the script leaves a portfolio page for Positions it keeps
// that page here; on Positions it reads the grid, waits for the sheet write and the daily reads, then goes back. So the
// next sync opens Positions again (a fresh page) instead of finding it already open
import { PORTFOLIO_URL } from './header';

export const TRIP_KEY = 'fidelity-accounts.trip'; // { from, at } in Tampermonkey storage
export const TRIP_MAX_MS = 3 * 60_000; // back after this even without a read (the grid never came, a long first read)
export const TRIP_STALE_MS = 10 * 60_000; // an older trip is forgotten: Positions opened later stays open

export type Trip = { from: string; at: number };

const positions = (url: URL) => /\/portfolio\/positions/.test(url.pathname);

/** the page to come back to: a portfolio page of Fidelity other than Positions */
export function tripFrom(href: string): string | null {
  try {
    const url = new URL(href);
    return href.startsWith(PORTFOLIO_URL) && !positions(url) ? href : null;
  } catch {
    return null;
  }
}

/** the kept trip while it is fresh and points to a page to come back to */
export function freshTrip(raw: unknown, now: number): Trip | null {
  const t = raw as Trip | null;
  if (!t || typeof t !== 'object' || typeof t.at !== 'number' || typeof t.from !== 'string') return null;
  if (now - t.at < 0 || now - t.at >= TRIP_STALE_MS) return null;
  return tripFrom(t.from) ? t : null;
}

/** go back now? after the read once nothing runs, or when the trip took too long */
export function backNow(p: { trip: Trip; now: number; read: boolean; busy: boolean }): boolean {
  return (p.read && !p.busy) || p.now - p.trip.at >= TRIP_MAX_MS;
}

/** the page's short name for the panel and the notification: summary, activity, ... */
export function pageName(href: string): string {
  try {
    const parts = new URL(href).pathname.split('/').filter(Boolean);
    return parts[parts.length - 1] ?? 'portfolio';
  } catch {
    return 'portfolio';
  }
}
