/// <reference lib="esnext" />
// A column's filter picked from a list (owner 2026-11-28: a filter icon by the Account and Type headers, "we can still
// do complex filters by typing"). The picks live IN the filter text, as parts the filter engine already understands:
// ="value" is an exact match and a comma is OR, so `="Stocks ···7325", ="ETFs ···7706"` shows those two accounts.
// Whatever else was typed stays where it is, and the text can be edited by hand afterwards

/** the part of a filter text that picks exactly this value */
export const choicePart = (value: string): string => `="${value.replace(/"/g, '')}"`;

/** a filter text cut at its commas (those outside quotes), trimmed, empty parts dropped */
export function filterParts(text: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (ch === '"') quoted = !quoted;
    if (ch === ',' && !quoted) { out.push(cur.trim()); cur = ''; } else cur += ch;
  }
  out.push(cur.trim());
  return out.filter(Boolean);
}

const same = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();

/** the values of `choices` the filter text picks */
export function pickedChoices(text: string, choices: readonly string[]): string[] {
  const parts = filterParts(text);
  return choices.filter((c) => parts.some((p) => same(p, choicePart(c))));
}

/** the filter text with this value picked or, when it was, not picked any more; other parts keep their place */
export function toggleChoice(text: string, value: string): string {
  const parts = filterParts(text);
  const part = choicePart(value);
  return (parts.some((p) => same(p, part)) ? parts.filter((p) => !same(p, part)) : parts.concat(part)).join(', ');
}

/** the filter text with no pick left: what was typed by hand stays */
export function clearChoices(text: string, choices: readonly string[]): string {
  const picks = choices.map(choicePart);
  return filterParts(text).filter((p) => !picks.some((c) => same(c, p))).join(', ');
}

/** the values a column offers: every text it shows, once each, in order */
export function choicesOf<T>(rows: readonly T[], text: (row: T) => string): string[] {
  const seen = new Set<string>();
  rows.forEach((r) => { const v = text(r).trim(); if (v) seen.add(v); });
  return Array.from(seen).sort((a, b) => a.localeCompare(b));
}
