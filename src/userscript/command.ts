/// <reference lib="esnext" />
// Commands from the viewer toolbar (⬇ Sync): the viewer page posts them, the bridge stores them in Tampermonkey
// storage, the Fidelity tab picks them up. A command is used once and only while fresh, so an old click never starts
// a read days later. Only reads exist: there is no command that changes anything on Fidelity
export type Command = { mode: 'sync'; at: number };

export const COMMAND_KEY = 'fidelity-accounts.command';
export const COMMAND_MAX_AGE_MS = 2 * 60 * 1000;

// The bridge takes a command from any page of the viewer's origin, and every app of the owner on daggerok.github.io
// shares it and may post to a viewer window it opened: a page posting `sync` in a loop would press Refresh Positions (or
// start the round trip) on Fidelity again and again with the owner's session. So a sync command is taken at most once a
// minute, the time of the last one kept in Tampermonkey storage (the round trip opens new pages, a variable would not
// last). A minute keeps every real flow: a viewer reload asks for one sync, Create a spreadsheet asks for one more (if it
// falls in the minute, Allow on the panel writes every stored set anyway), and 👀 every 10 minutes syncs by its own timer
// in the Fidelity tab, not through a command
export const SYNC_AT_KEY = 'fidelity-accounts.commandTakenAt';
export const SYNC_GAP_MS = 60 * 1000;

/** a sync command may be taken now: a minute after the last one taken; a time ahead of the clock (it was set back) does not block */
export const syncAllowed = (lastAt: unknown, now: number): boolean => typeof lastAt !== 'number' || lastAt > now || now - lastAt >= SYNC_GAP_MS;

export function freshCommand(raw: unknown, now: number): Command | null {
  if (typeof raw !== 'string') return null;
  try {
    const c = JSON.parse(raw) as Command;
    if (c.mode !== 'sync' || typeof c.at !== 'number') return null;
    return now - c.at >= 0 && now - c.at < COMMAND_MAX_AGE_MS ? c : null;
  } catch {
    return null;
  }
}
