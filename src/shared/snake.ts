/// <reference lib="esnext" />
// One naming for everything this app writes: snake_case, as in SQL (owner 2026-11-26: "standard names for columns not
// combination of camelcase and sneiky_case"). Our own columns and Fidelity's field names (todGLPct, fifTwo_low, isHTB)
// go through the same function: today_gl_pct, tod_gl_pct, fif_two_low, is_htb. A name already in snake_case stays as is
export const snakeCase = (k: string): string => k.replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/([A-Z])([A-Z][a-z])/g, '$1_$2').toLowerCase();

/** an object's keys in snake_case; a copy written before this naming reads the same as a new one */
export function snakeKeys<V>(o: Record<string, V>): Record<string, V> {
  const out: Record<string, V> = {};
  Object.keys(o).forEach((k) => { out[snakeCase(k)] = o[k]!; });
  return out;
}
