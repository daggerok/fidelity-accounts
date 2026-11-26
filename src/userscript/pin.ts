/// <reference lib="esnext" />
// The spreadsheet the Fidelity tab may write to, pinned in this script's Tampermonkey storage. The viewer hands over the
// spreadsheet id from its config in localStorage, and every app of the owner on daggerok.github.io shares that storage
// and can post to a viewer window it opened: without a pin a sibling page could swap the id and get every write
// (accounts, positions, transactions). So a new id is written to only after Allow on the Fidelity corner panel (another
// origin, no sibling page can script it); a declined id is remembered and not asked again
export const PIN_KEY = 'fidelity-accounts.sheetsPin'; // { id, declined }: the allowed spreadsheet, the last declined one

export interface Pin { id: string; declined: string }

/**
 * - `idle`: no spreadsheet handed over (disconnected), nothing to write
 * - `write`: the handed-over id is the pinned one
 * - `adopt`: no pin yet, and the id is the sheet this script has been writing to (its prints): pin it with no question,
 *   so an update of the script keeps the owner's working setup (the migration to the pin)
 * - `ask`: another id, or the first one of a fresh install: nothing is written until Allow
 * - `declined`: the id the owner declined: nothing is written, not asked again
 */
export type PinStep = 'idle' | 'write' | 'adopt' | 'ask' | 'declined';

export function pinStep(s: { pin: string; printsId: string; declined: string; handoffId: string }): PinStep {
  if (!s.handoffId) return 'idle';
  if (s.pin && s.handoffId === s.pin) return 'write';
  if (!s.pin && s.printsId && s.printsId === s.handoffId) return 'adopt';
  return s.handoffId === s.declined ? 'declined' : 'ask';
}

export function readPin(raw: unknown): Pin {
  const p = (raw && typeof raw === 'object' ? raw : {}) as Partial<Pin>;
  return { id: typeof p.id === 'string' ? p.id : '', declined: typeof p.declined === 'string' ? p.declined : '' };
}

export const allowPin = (id: string): Pin => ({ id, declined: '' });
export const declinePin = (pin: Pin, id: string): Pin => ({ id: pin.id, declined: id });

// the panel and the viewer show only a short tail of a spreadsheet id, never the whole id
export const idTail = (id: string): string => `…${id.slice(-6)}`;
