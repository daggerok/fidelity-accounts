/// <reference lib="esnext" />
// Commands from the viewer toolbar (⬇ Sync): the viewer page posts them, the bridge stores them in Tampermonkey
// storage, the Fidelity tab picks them up. A command is used once and only while fresh, so an old click never starts
// a read days later. Only reads exist: there is no command that changes anything on Fidelity
export type Command = { mode: 'sync'; at: number };

export const COMMAND_KEY = 'fidelity-accounts.command';
export const COMMAND_MAX_AGE_MS = 2 * 60 * 1000;

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
