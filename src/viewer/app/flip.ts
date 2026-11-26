/// <reference lib="esnext" />
// What moved between two draws of a stacked list (the 🔔 popups): for every item that was there before and now stands
// somewhere else, how far it has to be shifted to start from its old place and slide into the new one (first, last,
// invert, play). An item that is new or did not move is not in the answer
export function moved(before: ReadonlyMap<string, number>, after: ReadonlyMap<string, number>): { key: string; from: number }[] {
  const out: { key: string; from: number }[] = [];
  after.forEach((top, key) => {
    const old = before.get(key);
    if (old !== undefined && Math.abs(old - top) >= 1) out.push({ key, from: old - top });
  });
  return out;
}
