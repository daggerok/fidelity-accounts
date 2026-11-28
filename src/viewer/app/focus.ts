/// <reference lib="esnext" />
// Keyboard rules of the viewer, apart from the screens that use them (rules/reusable-components.md): the focus kept
// inside a ⤢ window, the arrow keys of the main tabs, the keys that press or move a chip

/**
 * Tab inside a modal window (Zoom): where the focus goes among its `count` focusable controls when Tab (`back` = Shift+Tab)
 * is pressed on control `current` (-1 = the focus is outside the window). A number = move there and stop the browser's
 * own step; null = let the browser step to the next control, which is inside the window anyway
 */
export function trapIndex(count: number, current: number, back: boolean): number | null {
  if (count <= 0) return null;
  if (current < 0) return back ? count - 1 : 0;
  if (back && current === 0) return count - 1;
  if (!back && current === count - 1) return 0;
  return null;
}

/** the arrow keys of a row of tabs (WAI-ARIA tabs): Left and Right step and wrap around, Home and End jump; null = not ours */
export function rovingIndex(count: number, current: number, key: string): number | null {
  if (count <= 0) return null;
  if (key === 'ArrowRight') return (current + 1) % count;
  if (key === 'ArrowLeft') return (current - 1 + count) % count;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  return null;
}

/**
 * A chip drawn as role="button" (the accounts strip) is pressed by Enter or Space like a real button, but only when the
 * key comes to the chip itself (`self`): Enter or Space on the checkbox inside it bubbles up and must not fold the strip
 */
export const chipActivates = (key: string, self: boolean): boolean => self && (key === 'Enter' || key === ' ');

/**
 * Alt+Left or Alt+Right on a chip of the accounts strip (`alone`: Alt with no other modifier) moves it one place, the
 * keyboard path of its drag: -1 left, 1 right, null = not ours. Plain arrows stay the page's, and like Enter and Space
 * only a key that comes to the chip itself counts, not one of its checkbox
 */
export function chipStep(key: string, alone: boolean, self: boolean): -1 | 1 | null {
  if (!self || !alone) return null;
  return key === 'ArrowLeft' ? -1 : key === 'ArrowRight' ? 1 : null;
}

/**
 * A focus the page moves by itself must not draw the focus ring for someone who works with the mouse or a finger (owner
 * 2026-11-27: after ⤢ and Esc "I see this selection box", "I don't want to keep it"): the focus still goes where it
 * should, for the keys and the screen reader, but quietly, until the element loses it. `byPointer`: the window was
 * opened with a pointer, not with the keys
 */
export const QUIET_FOCUS = 'data-quiet-focus';
export function focusQuietly(el: HTMLElement | null | undefined, byPointer: boolean): void {
  if (!el) return;
  if (byPointer) {
    el.setAttribute(QUIET_FOCUS, '');
    el.addEventListener('blur', () => el.removeAttribute(QUIET_FOCUS), { once: true });
  }
  el.focus({ preventScroll: true });
}
/** how the last thing on the page was done: true after a press of a pointer, false after Tab, Enter or Space */
let pointerLast = false;
export const lastWasPointer = (): boolean => pointerLast;
/** watch how things are done while something needs to know (a mounted window); returns what stops the watch */
export function watchInput(): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const down = () => { pointerLast = true; };
  const key = (e: KeyboardEvent) => { if (e.key === 'Tab' || e.key === 'Enter' || e.key === ' ') pointerLast = false; };
  window.addEventListener('pointerdown', down, true);
  window.addEventListener('keydown', key, true);
  return () => { window.removeEventListener('pointerdown', down, true); window.removeEventListener('keydown', key, true); };
}
