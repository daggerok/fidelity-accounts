/// <reference lib="esnext" />
// Notifications of the script's jobs (owner 2026-11-25: "notify when its done or send an error", "in setting enable
// notification ... success color - our theme, red color - error", "by default disabled", "user can change"): one switch
// in Tampermonkey storage, set from the viewer's ⚙️ or the 🔔 of the Fidelity panel, both see each change at once. While
// it is on, each finished job or error of the Fidelity tab gives ONE notification (owner 2026-11-25: "why I have 2?",
// then "yes, fix the double notifications"): the Fidelity tab always leaves the newest notice for the viewer, which shows
// it as a popup, and sends a Tampermonkey notification only when no viewer is on screen. A visible viewer tab says so
// with a heartbeat in Tampermonkey storage (VIEWER_KEY, written every VIEWER_BEAT_MS while visible, cleared when hidden)
import { say, wordsOf, type Word } from './notice-words';

export const NOTIFY_KEY = 'fidelity-accounts.notify'; // boolean, off when missing
export const NOTICE_KEY = 'fidelity-accounts.notice'; // the newest Notice as JSON
// a success closes by itself after 10 s (it was 6: owner 2026-11-25 "show toast 2 times longer", then "10 sec fine"), an
// error stays until closed
export const NOTICE_OK_MS = 10_000;
export const NOTICE_MAX_AGE_MS = 60_000; // an older notice is not shown when a viewer opens later
export const VIEWER_KEY = 'fidelity-accounts.viewerSeen'; // ms of the last heartbeat of a visible viewer tab
export const VIEWER_BEAT_MS = 20_000;

/**
 * a viewer is on screen: its heartbeat is younger than two beats (one missed beat of a throttled timer is fine). A
 * missing, broken or future time (another clock, a clock set back) is not: then the browser notification goes out, so a
 * doubt never means no notification at all
 */
export const viewerOnScreen = (seen: unknown, now: number): boolean => typeof seen === 'number' && seen <= now && now - seen < 2 * VIEWER_BEAT_MS;

export type NoticeLevel = 'ok' | 'error';
// `text`: the notice in English (the browser notification, and a viewer older than the words); `words`: its sentences
// as keys with values (notice-words.ts), so the viewer says it in its own language
export interface Notice { at: number; level: NoticeLevel; text: string; words?: Word[] }

export function makeNotice(level: NoticeLevel, what: string | readonly Word[], at: number): string {
  if (typeof what === 'string') return JSON.stringify({ at, level, text: what.slice(0, 300) });
  return JSON.stringify({ at, level, text: say(what).slice(0, 300), words: what });
}

/** the popups on screen: the new notice last, the same one never twice, at most `max` */
export function pushNotice(list: readonly Notice[], n: Notice, max = 3): Notice[] {
  return list.filter((x) => x.at !== n.at || x.text !== n.text).concat(n).slice(-max);
}

/** a notice worth showing now: well formed and fresh */
export function freshNotice(raw: unknown, now: number): Notice | null {
  if (typeof raw !== 'string') return null;
  try {
    const n = JSON.parse(raw) as Notice;
    if (typeof n.at !== 'number' || (n.level !== 'ok' && n.level !== 'error') || typeof n.text !== 'string' || !n.text) return null;
    if (!(now - n.at >= 0 && now - n.at < NOTICE_MAX_AGE_MS)) return null;
    const words = wordsOf(n.words);
    return words ? { at: n.at, level: n.level, text: n.text, words } : { at: n.at, level: n.level, text: n.text };
  } catch {
    return null;
  }
}
