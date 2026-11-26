/// <reference lib="esnext" />
// The words of a notification (owner 2026-11-25, about "read: 6 accounts, 1090 positions; sheets: positions written ·
// back to summary": "is very low quality"; "they should support i18n"; then "toast should contain 1 line per item, if
// there are 2-3 different items there should be 2-3 lines"): a notice is read by a person away from the panel, so it is
// a short list, one thing a line: what happened first, then each number or step on a line of its own. It is not the
// panel's log lines glued together. Each line is a key (the English text, as everywhere in the viewer's i18n) with its
// values, so the viewer shows it in its language (i18n/ru.ts holds every key of NOTICE_KEYS, a test checks it) and the
// browser notification, which has no language switch, says it in English. Counts follow a colon ("Accounts: 6"), which
// reads right for any number in both languages
export interface Word { key: string; params?: Record<string, string | number> }

const K = {
  positions: 'Positions updated',
  accounts: 'Accounts: {n}',
  positionsCount: 'Positions: {n}',
  sheets: 'Google Sheets updated',
  balancesOf: 'Daily balances, accounts: {read} of {accounts}',
  txnsAdded: 'New transactions: {n}',
  txnsTotal: 'Transactions: {n}',
  betasOf: 'Betas: {found} of {held}',
  balances: 'Daily balances updated',
  accountsOf: 'Accounts: {read} of {accounts}',
  txnsNew: 'Transactions updated',
  txnsSame: 'Transactions checked',
  added: 'New: {n}',
  nothingNew: 'Nothing new',
  total: 'Total: {n}',
  txnsFailed: 'Failed transactions update',
  accountsFailed: 'Accounts failed: {n}',
  betas: 'Betas updated',
  betasFailed: 'Failed betas update',
  found: 'Found: {found} of {held}',
  failedParts: 'Failed: {parts}',
  failPositions: 'Failed positions update',
  failBalances: 'Failed daily balances update',
  failTransactions: 'Failed transactions read',
  failBetas: 'Failed betas read',
  failPage: 'Failed page read',
  // the reason as it came, a line of its own with no label (owner 2026-11-25: "Failed Google sheets update / Error details...")
  reason: '{error}',
  changed: 'Fidelity changed something this script reads',
  changedWhat: 'What: {what}',
  changedWhere: 'Details are in ⚙️ Settings of the viewer',
  sheetsWaiting: 'Not saved to Google Sheets yet',
  connect: 'Connect Google with ☁️ in the viewer',
  sheetsFailed: 'Failed Google Sheets update',
  sheetWaits: 'The viewer points to another spreadsheet',
  sheetTail: 'Spreadsheet: {tail}',
  sheetAllow: 'Nothing is saved until you press Allow on the Fidelity panel',
  noReader: 'Could not start reading the page',
  allowReader: 'Allow GM_addElement for this script in Tampermonkey',
  noPositions: 'Positions were not read within 3 minutes',
} as const;

/** every key a notice can carry: the viewer's Russian dictionary must hold each one */
export const NOTICE_KEYS: string[] = Object.keys(K).map((k) => K[k as keyof typeof K]);
/** the most lines a notice has */
export const NOTICE_LINES = 6;

const why = (err: unknown): string => (err instanceof Error ? err.message : String(err)).slice(0, 200);
const line = (key: string, params?: Record<string, string | number>): Word => (params ? { key, params } : { key });
// A failure is titled "Failed ..." with the error details on the line under it (owner 2026-11-25: "Failed Google
// sheets update / Error details...")
// A job whose result reached the sheet is announced by that (owner 2026-11-25: not "Positions updated ... Saved to Google
// Sheets" but "Google Sheets updated" on top and the numbers under it): the first line is the sheet, and each line under
// it names what it counts, since the title no longer does. A job that did not write the sheet keeps its own title
const sheet = (...lines: Word[]): Word[] => [line(K.sheets)].concat(lines);

/** the positions were read; `saved`: this read also reached the sheet */
export const positionsRead = (accounts: number, positions: number, saved: boolean): Word[] =>
  (saved ? sheet : (...l: Word[]) => [line(K.positions)].concat(l))(line(K.accounts, { n: accounts }), line(K.positionsCount, { n: positions }));
/** the daily account values for the balance chart */
export const balancesRead = (read: number, accounts: number, saved: boolean): Word[] => (saved ? sheet(line(K.balancesOf, { read, accounts })) : [line(K.balances), line(K.accountsOf, { read, accounts })]);
/** the transactions history: how many rows are new, how many there are */
export const transactionsRead = (total: number, added: number, saved: boolean): Word[] => {
  if (saved) return sheet(line(K.txnsAdded, { n: Math.max(0, added) }), line(K.txnsTotal, { n: total }));
  return added > 0 ? [line(K.txnsNew), line(K.added, { n: added }), line(K.total, { n: total })] : [line(K.txnsSame), line(K.nothingNew), line(K.total, { n: total })];
};
export const transactionsFailed = (accounts: number): Word[] => [line(K.txnsFailed), line(K.accountsFailed, { n: accounts })];
/** the betas of the held symbols */
export const betasRead = (found: number, held: number, saved: boolean): Word[] => (saved ? sheet(line(K.betasOf, { found, held })) : [line(K.betas), line(K.found, { found, held })]);
export const betasFailed = (found: number, held: number, parts: string[]): Word[] => [line(K.betasFailed), line(K.found, { found, held }), line(K.failedParts, { parts: parts.join(', ') })];

const FAIL = { positions: K.failPositions, balances: K.failBalances, transactions: K.failTransactions, betas: K.failBetas, page: K.failPage } as const;
/** a job that threw */
export const jobFailed = (job: keyof typeof FAIL, err: unknown): Word[] => [line(FAIL[job]), line(K.reason, { error: why(err) })];
/** Fidelity's page or answers no longer look as this version expects (contract.ts ids) */
export const fidelityChanged = (what: string): Word[] => [line(K.changed), line(K.changedWhat, { what: what.slice(0, 200) }), line(K.changedWhere)];
export const SHEETS_WAITING: Word[] = [line(K.sheetsWaiting), line(K.connect)];
export const sheetsFailed = (err: unknown): Word[] => [line(K.sheetsFailed), line(K.reason, { error: why(err) })];
export const sheetWaitsAllow = (tail: string): Word[] => [line(K.sheetWaits), line(K.sheetTail, { tail }), line(K.sheetAllow)];
export const NO_READER: Word[] = [line(K.noReader), line(K.allowReader)];
export const NO_POSITIONS: Word[] = [line(K.noPositions)];

/**
 * The lines of a notice as text, one item a line. `tr`: the line of a key in the reader's language (the viewer passes
 * its t; none = English, the key itself); numbers are grouped the way `locale` writes them (1,090 or 1 090)
 */
export function lines(words: readonly Word[], tr: (key: string) => string = (key) => key, locale = 'en-US'): string[] {
  return words.map((w) => {
    let out = tr(w.key);
    const params = w.params ?? {};
    Object.keys(params).forEach((k) => { const v = params[k]!; out = out.split(`{${k}}`).join(typeof v === 'number' ? v.toLocaleString(locale) : v); });
    return out;
  });
}

/** the same lines as one text (the browser notification) */
export const say = (words: readonly Word[]): string => lines(words).join('\n');

/** words read back from storage or a message: well formed or none */
export function wordsOf(raw: unknown): Word[] | null {
  if (!Array.isArray(raw) || !raw.length || raw.length > NOTICE_LINES) return null;
  const out: Word[] = [];
  for (const w of raw as Word[]) {
    if (!w || typeof w.key !== 'string' || w.key.length > 300) return null;
    const params: Record<string, string | number> = {};
    const given = w.params && typeof w.params === 'object' ? w.params : {};
    for (const k of Object.keys(given)) {
      const v = given[k];
      if (typeof v === 'number') params[k] = v; else if (typeof v === 'string') params[k] = v.slice(0, 300); else return null;
    }
    out.push(Object.keys(params).length ? { key: w.key, params } : { key: w.key });
  }
  return out;
}
