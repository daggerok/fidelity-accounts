/// <reference lib="esnext" />
// Notifications of the script's jobs (owner 2026-11-25: "notify when its done or send an error", "in setting enable
// notification ... success color - our theme, red color - error", "by default disabled", "user can change"): one switch
// in Tampermonkey storage, set from the viewer's ⚙️ or the 🔔 of the Fidelity panel, both see each change at once. While
// it is on the Fidelity tab sends a Tampermonkey notification per finished job or error and leaves the newest notice for
// the viewer, which shows it as a popup
export const NOTIFY_KEY = 'fidelity-accounts.notify'; // boolean, off when missing
export const NOTICE_KEY = 'fidelity-accounts.notice'; // the newest Notice as JSON
export const NOTICE_OK_MS = 6_000; // a success closes by itself, an error stays until closed
export const NOTICE_MAX_AGE_MS = 60_000; // an older notice is not shown when a viewer opens later

export type NoticeLevel = 'ok' | 'error';
export interface Notice { at: number; level: NoticeLevel; text: string }

export const makeNotice = (level: NoticeLevel, text: string, at: number): string => JSON.stringify({ at, level, text: text.slice(0, 300) });

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
    return now - n.at >= 0 && now - n.at < NOTICE_MAX_AGE_MS ? n : null;
  } catch {
    return null;
  }
}
