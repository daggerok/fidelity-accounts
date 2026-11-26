/// <reference lib="esnext" />
// Keyboard rules of the viewer, apart from the screens that use them (rules/reusable-components.md): the focus kept
// inside a ⤢ window, the arrow keys of the main tabs, the keys that press a chip

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
