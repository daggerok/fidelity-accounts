/// <reference lib="esnext" />
// The phone's Positions page gives the table the whole screen once its rows are scrolled (owner 2026-11-27, after
// Fidelity's own app): the navbar folds away and the tabs panel is squashed into one thin line cut in pieces. This
// says when. (Summary needs none of it: its whole page scrolls and pushes the navbar and the tabs up, ui/App.tsx)
export const SQUASH_AFTER = 60;
export const SQUASH_TOP = 4;

/** what a scroll of the rows asks for: 'squash' on a move down past the first row, 'open' back at the top, else nothing */
export function squashAsk(top: number, before: number): 'squash' | 'open' | null {
  if (top <= SQUASH_TOP) return 'open';
  return top > before && top > SQUASH_AFTER ? 'squash' : null;
}

/**
 * Squashed or not. `asked` is the last ask of the Positions rows; `held` is the owner's tap on the lit piece, which
 * opens everything until the rows move down again. Only a phone with the settings shut is ever squashed
 */
export const squashed = (s: { phone: boolean; settings: boolean; asked: boolean; held: boolean }): boolean => s.phone && !s.settings && s.asked && !s.held;
