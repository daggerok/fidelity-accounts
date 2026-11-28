/// <reference lib="esnext" />
// When the API reads run, in New York time (owner 2026-11-25): the daily values and the full transactions read after
// 20:00 on a workday, when the day is posted; nothing again until the market opens ("no sense to re-read until opening
// if we have read it after 20:00"); the transactions once more after 9:30 if not read since, and while 👀 is on every
// 10 minutes of the session (only the last days, the sheet gets a copy only when something new came). A read that was
// missed (the tab was closed) runs at the next page load. Exchange holidays are not known: a read then finds nothing new
import { addDays } from '../shared/dates';

export const OPEN_MIN = 9 * 60 + 30; // 9:30 New York
export const CLOSE_MIN = 16 * 60; // 16:00
export const POSTED_MIN = 20 * 60; // 20:00: the day is posted, the evening reads run (the ETF schedule's evening time)
export const TXNS_GAP_MS = 10 * 60_000; // 👀 during the session: the transactions at most every 10 minutes
export const DUE_TICK_MS = 5 * 60_000; // how often an open Fidelity page checks if a read is due

const NY = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short', hour: 'numeric', minute: 'numeric', hour12: false });
const WEEKEND = new Set(['Sat', 'Sun']);

/** the New York calendar day (YYYY-MM-DD), weekday and minute of the day */
export function nyClock(now: Date): { day: string; weekend: boolean; minutes: number } {
  const parts = NY.formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return { day: `${get('year')}-${get('month')}-${get('day')}`, weekend: WEEKEND.has(get('weekday')), minutes: (Number(get('hour')) % 24) * 60 + Number(get('minute')) };
}

/** the regular US session, 9:30 to 16:00 New York on weekdays */
export function marketOpen(now: Date): boolean {
  const c = nyClock(now);
  return !c.weekend && c.minutes >= OPEN_MIN && c.minutes < CLOSE_MIN;
}

/** the last workday cutoff (minutes of the day) at or before `at`, as `day@minutes`: two times in one slot need no new read */
export function slotOf(at: Date, cutoffs: readonly number[]): string {
  const c = nyClock(at);
  let day = c.day;
  let minutes = c.minutes;
  for (let i = 0; i < 10; i++) {
    const weekend = WEEKEND.has(new Date(`${day}T12:00:00Z`).toUTCString().slice(0, 3));
    const hit = weekend ? undefined : cutoffs.filter((m) => m <= minutes).sort((a, b) => b - a)[0];
    if (hit !== undefined) return `${day}@${hit}`;
    day = addDays(day, -1);
    minutes = 24 * 60;
  }
  return '';
}

const due = (lastAt: string | undefined, now: Date, cutoffs: readonly number[]): boolean =>
  !lastAt || Number.isNaN(Date.parse(lastAt)) || slotOf(new Date(lastAt), cutoffs) !== slotOf(now, cutoffs);

/** the daily values: once after 20:00 of each workday (a missed evening runs at the next page load) */
export const historyDue = (historyAt: string | undefined, now: Date): boolean => due(historyAt, now, [POSTED_MIN]);

/**
 * the transactions: `full` (10 days again) after 20:00 and after the open when not read since; `recent` (yesterday and
 * today) every 10 minutes of the session while 👀 is on; `full` also on a sync the owner asked for; else nothing
 */
export function txnsPlan(lastAt: string | undefined, now: Date, watching: boolean, asked = false): 'full' | 'recent' | null {
  if (due(lastAt, now, [OPEN_MIN, POSTED_MIN])) return 'full';
  const waited = now.getTime() - Date.parse(lastAt!) >= TXNS_GAP_MS;
  if (watching && marketOpen(now) && waited) return 'recent';
  // a sync the owner asked for (a reload of the viewer, ⬇ on the panel) reads at any hour and on any day (owner
  // 2026-11-28: a pending dividend showed on Fidelity on a Saturday, "I did refresh" and nothing came), though not more
  // often than the 👀 reads. The full ten days: on a Sunday the news is of Friday, two days back
  return asked && waited ? 'full' : null;
}
