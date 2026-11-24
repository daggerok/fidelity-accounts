/// <reference lib="esnext" />
// The positions columns the owner picked and their order (owner 2026-11-24, like Fidelity's "Create My View": all
// columns by group on the left, the chosen ones in order on the right). `order` holds the owner's order of keys, `hidden`
// the keys switched off; a column the app adds later and the order does not know yet takes its default place at the end

/** every key once: the owner's order first (known keys only), the rest in their default order */
export function arrange(all: string[], order: string[]): string[] {
  const known = order.filter((k, i) => all.indexOf(k) >= 0 && order.indexOf(k) === i);
  return known.concat(all.filter((k) => known.indexOf(k) < 0));
}

/** the keys the table shows, in order */
export const shownKeys = (all: string[], order: string[], hidden: string[]): string[] => arrange(all, order).filter((k) => hidden.indexOf(k) < 0);

/** `key` moved to index `to` of the list (the index it ends up at) */
export function moveKey(list: string[], key: string, to: number): string[] {
  const rest = list.filter((k) => k !== key);
  rest.splice(Math.max(0, Math.min(to, rest.length)), 0, key);
  return rest;
}

/** the new order after the shown columns were dragged: the shown ones as dragged, the hidden ones keep their order after them */
export const orderAfterDrag = (all: string[], order: string[], hidden: string[], shown: string[]): string[] =>
  shown.concat(arrange(all, order).filter((k) => hidden.indexOf(k) >= 0));

/** `keys` switched on (taken out of hidden) or off (added to it); one column or a whole group */
export const toggleKeys = (hidden: string[], keys: string[], on: boolean): string[] =>
  on ? hidden.filter((k) => keys.indexOf(k) < 0) : hidden.concat(keys.filter((k) => hidden.indexOf(k) < 0));

/** the columns whose name holds the filter text, any case */
export function filterColumns<T extends { label: string }>(cols: T[], q: string): T[] {
  const s = q.trim().toLowerCase();
  return s ? cols.filter((c) => c.label.toLowerCase().includes(s)) : cols;
}
