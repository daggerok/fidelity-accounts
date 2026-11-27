/// <reference lib="esnext" />
// One naming for everything this app writes: snake_case, as in SQL (owner 2026-11-26: "standard names for columns not
// combination of camelcase and sneiky_case"), and readable words instead of Fidelity's abbreviations (owner: "use
// readable names instead of lst_prc and cst_bas_tot"). Our own columns go through snakeCase; a field of Fidelity's grid
// goes through fieldName: lstPrc -> last_price, cstBasTot -> cost_basis_total, todGLPct -> today_gl_pct,
// fifTwo.low -> week_52_low. Where our own tab has a column for the same thing the two names agree
export const snakeCase = (k: string): string => k.replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/([A-Z])([A-Z][a-z])/g, '$1_$2').toLowerCase();

// one abbreviation of Fidelity -> its word; a token that is not here stays as it is (a new field of the site still gets
// a snake_case name)
const WORDS: Record<string, string> = {
  act: 'account', acct: 'account', nam: 'name', num: 'number', avg: 'average', vol: 'volume', cst: 'cost', bas: 'basis',
  cstbas: 'cost_basis', tot: 'total', cur: 'current', val: 'value', dist: 'distribution', yld: 'yield', dv: 'dividend',
  amt: 'amount', anu: 'annual', inc: 'income', dte: 'date', dt: 'date', fiv: 'five', thr: 'three', yr: 'year',
  lst: 'last', pr: 'price', prc: 'price', chg: 'change', prev: 'previous', cls: 'close', desc: 'description',
  sym: 'symbol', mstar: 'morningstar', cnt: 'count', py: 'pay', qty: 'quantity', tod: 'today', dly: 'daily',
  pend: 'pending', unavail: 'unavailable', stk: 'stacked', shr: 'share', ctg: 'category',
};
// runs of tokens that mean one thing, tried before the single words (the longest first)
const PHRASES: Array<[string[], string]> = [
  [['cst', 'bas', 'shr'], 'cost_basis_per_share'],
  [['ex', 'dv', 'dte'], 'ex_date'],
  [['ex', 'rt', 'gs'], 'expense_ratio_gross'],
  [['ex', 'rt', 'nt'], 'expense_ratio_net'],
  [['fif', 'two'], 'week_52'],
  [['act', 'per'], 'percent_of_account'],
  [['mng', 'ctg'], 'morningstar_category'],
  [['is', 'htb'], 'is_hard_to_borrow'],
  [['mstar', 'rate'], 'morningstar_rating'],
  // the grid has both lstPrc (the price of the position's line, our last_price) and lastPrice (the quote's own)
  [['last', 'price'], 'quote_last_price'],
];

/** a flattened grid field in snake_case (sym_name, lst_prc, avg_vol10_day) -> its readable name */
export function readable(snake: string): string {
  const tokens = snake.replace(/([a-z])(\d)/g, '$1_$2').replace(/(\d)([a-z])/g, '$1_$2').split('_').filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i < tokens.length;) {
    const hit = PHRASES.filter(([p]) => p.every((t, j) => tokens[i + j] === t))[0];
    if (hit) { out.push(hit[1]); i += hit[0].length; continue; }
    out.push(WORDS[tokens[i]!] ?? tokens[i]!);
    i += 1;
  }
  return out.join('_');
}

/** an object's snake_case keys under their readable names (run once, on Fidelity's own keys) */
export function readableKeys<V>(o: Record<string, V>): Record<string, V> {
  const out: Record<string, V> = {};
  Object.keys(o).forEach((k) => { out[readable(k)] = o[k]!; });
  return out;
}

/** the name of a grid field as the app and the sheet know it: from Fidelity's own key or flattened path */
export const fieldName = (raw: string): string => readable(snakeCase(raw));

/**
 * the fields of a copy written before this naming (Fidelity's keys as they came, or their plain snake_case): every such
 * copy holds the account number under actNum or act_num. A copy with the new names is left alone: readable() is not
 * meant to run twice (last_price would turn into quote_last_price)
 */
export const oldFieldNames = (keys: readonly string[]): boolean => keys.some((k) => k !== k.toLowerCase() || k === 'act_num');

export function fieldNames<V>(o: Record<string, V>): Record<string, V> {
  if (!oldFieldNames(Object.keys(o))) return o;
  const out: Record<string, V> = {};
  Object.keys(o).forEach((k) => { out[fieldName(k)] = o[k]!; });
  return out;
}
