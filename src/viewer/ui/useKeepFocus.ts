/// <reference lib="esnext" />
import { useEffect, useState } from 'react';

// An item moved by the keys keeps its focus, so the next key press moves it again (the columns list, the accounts strip):
// React may move the item's node to its new place, and a moved node can lose the focus. `keep(id)` before the move;
// after each draw of a new `order` the element `[attr="id"]` under `root` gets the focus back. `keep(null)` when the item
// loses the focus, so a later change of the list never pulls the focus back to it
export function useKeepFocus(root: React.RefObject<HTMLElement | null>, attr: string, order: unknown): (id: string | null) => void {
  const [focus, setFocus] = useState<string | null>(null);
  useEffect(() => {
    if (focus) root.current?.querySelector<HTMLElement>(`[${attr}="${CSS.escape(focus)}"]`)?.focus();
  }, [order, focus]);
  return setFocus;
}
