/// <reference lib="esnext" />
// The phone's Positions page gives the table the whole screen once its rows are scrolled (owner 2026-11-27, after
// Fidelity's own app): the navbar folds away and the tabs panel is squashed into two thin stripes. This says when
export const SQUASH_AFTER = 60;
export const SQUASH_TOP = 4;

/** what a scroll of the rows asks for: 'squash' on a move down past the first row, 'open' back at the top, else nothing */
export function squashAsk(top: number, before: number): 'squash' | 'open' | null {
  if (top <= SQUASH_TOP) return 'open';
  return top > before && top > SQUASH_AFTER ? 'squash' : null;
}

/**
 * Squashed or not. `asked` is the last ask of the rows; `held` is the owner's tap on the lit stripe, which opens
 * everything until the rows move down again. Only a phone on Positions with the settings shut is ever squashed
 */
export const squashed = (s: { phone: boolean; positions: boolean; settings: boolean; asked: boolean; held: boolean }): boolean => s.phone && s.positions && !s.settings && s.asked && !s.held;
