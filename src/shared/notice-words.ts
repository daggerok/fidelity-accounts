/// <reference lib="esnext" />
// The words of a notification (owner 2026-11-25, about "read: 6 accounts, 1090 positions; sheets: positions written ·
// back to summary": "is very low quality"; then "and they should support i18n"): a notice is read by a person away
// from the panel, so it is plain sentences about what happened, not the panel's log lines glued together. Each sentence
// is a key (the English text, as everywhere in the viewer's i18n) with its values, so the viewer shows it in its
// language (i18n/ru.ts holds every key of NOTICE_KEYS, a test checks it) and the browser notification, which has no
// language switch, says it in English. Counts follow a colon ("Accounts: 6"), which reads right for any number in both
// languages
export interface Word { key: string; params?: Record<string, string | number> }

const K = {
  positions: 'Positions updated. Accounts: {accounts}, positions: {positions}.',
  saved: 'Saved to Google Sheets.',
  balances: 'Daily balances updated. Accounts: {read} of {accounts}.',
  txnsNew: 'Transactions updated. New: {added}, total: {total}.',
  txnsSame: 'Transactions checked, nothing new. Total: {total}.',
  txnsFailed: 'Transactions could not be read. Accounts failed: {accounts}.',
  betas: 'Betas updated. Found: {found} of {held}.',
  betasFailed: 'Betas: found {found} of {held}, could not read {parts}.',
  failPositions: 'Could not read the positions: {error}',
  failBalances: 'Could not read the daily balances: {error}',
  failTransactions: 'Could not read the transactions: {error}',
  failBetas: 'Could not read the betas: {error}',
  failPage: 'Could not read the page: {error}',
  changed: 'Fidelity changed something this script reads ({what}). Details are in ⚙️ Settings of the viewer.',
  sheetsWaiting: 'Not saved to Google Sheets yet: connect Google with ☁️ in the viewer.',
  sheetsFailed: 'Could not save to Google Sheets: {error}',
  sheetWaits: 'The viewer now points to another spreadsheet ({tail}). Nothing is saved until you press Allow on the Fidelity panel.',
  noReader: 'Could not start reading the page: allow GM_addElement for this script in Tampermonkey.',
  noPositions: 'Positions were not read within 3 minutes.',
} as const;

/** every key a notice can carry: the viewer's Russian dictionary must hold each one */
export const NOTICE_KEYS: string[] = Object.keys(K).map((k) => K[k as keyof typeof K]);

const why = (err: unknown): string => (err instanceof Error ? err.message : String(err)).slice(0, 200);
const withSaved = (w: Word, saved: boolean): Word[] => (saved ? [w, { key: K.saved }] : [w]);

/** the positions were read; `saved`: this read also reached the sheet */
export const positionsRead = (accounts: number, positions: number, saved: boolean): Word[] => withSaved({ key: K.positions, params: { accounts, positions } }, saved);
/** the daily account values for the balance chart */
export const balancesRead = (read: number, accounts: number, saved: boolean): Word[] => withSaved({ key: K.balances, params: { read, accounts } }, saved);
/** the transactions history: how many rows are new, how many there are */
export const transactionsRead = (total: number, added: number, saved: boolean): Word[] => withSaved(added > 0 ? { key: K.txnsNew, params: { added, total } } : { key: K.txnsSame, params: { total } }, saved);
export const transactionsFailed = (accounts: number): Word[] => [{ key: K.txnsFailed, params: { accounts } }];
/** the betas of the held symbols */
export const betasRead = (found: number, held: number, saved: boolean): Word[] => withSaved({ key: K.betas, params: { found, held } }, saved);
export const betasFailed = (found: number, held: number, parts: string[]): Word[] => [{ key: K.betasFailed, params: { found, held, parts: parts.join(', ') } }];

const FAIL = { positions: K.failPositions, balances: K.failBalances, transactions: K.failTransactions, betas: K.failBetas, page: K.failPage } as const;
/** a job that threw */
export const jobFailed = (job: keyof typeof FAIL, err: unknown): Word[] => [{ key: FAIL[job], params: { error: why(err) } }];
/** Fidelity's page or answers no longer look as this version expects (contract.ts ids) */
export const fidelityChanged = (what: string): Word[] => [{ key: K.changed, params: { what: what.slice(0, 200) } }];
export const SHEETS_WAITING: Word[] = [{ key: K.sheetsWaiting }];
export const sheetsFailed = (err: unknown): Word[] => [{ key: K.sheetsFailed, params: { error: why(err) } }];
export const sheetWaitsAllow = (tail: string): Word[] => [{ key: K.sheetWaits, params: { tail } }];
export const NO_READER: Word[] = [{ key: K.noReader }];
export const NO_POSITIONS: Word[] = [{ key: K.noPositions }];

/**
 * The sentences as text. `line`: the sentence of a key in the reader's language (the viewer passes its t; none = English,
 * the key itself); numbers are grouped the way `locale` writes them (1,090 or 1 090)
 */
export function say(words: readonly Word[], line: (key: string) => string = (key) => key, locale = 'en-US'): string {
  return words.map((w) => {
    let out = line(w.key);
    const params = w.params ?? {};
    Object.keys(params).forEach((k) => { const v = params[k]!; out = out.split(`{${k}}`).join(typeof v === 'number' ? v.toLocaleString(locale) : v); });
    return out;
  }).join(' ');
}

/** words read back from storage or a message: well formed or none */
export function wordsOf(raw: unknown): Word[] | null {
  if (!Array.isArray(raw) || !raw.length || raw.length > 4) return null;
  const out: Word[] = [];
  for (const w of raw as Word[]) {
    if (!w || typeof w.key !== 'string' || w.key.length > 300) return null;
    const params: Record<string, string | number> = {};
    const given = w.params && typeof w.params === 'object' ? w.params : {};
    for (const k of Object.keys(given)) {
      const v = given[k];
      if (typeof v === 'number') params[k] = v; else if (typeof v === 'string') params[k] = v.slice(0, 300); else return null;
    }
    out.push({ key: w.key, params });
  }
  return out;
}
