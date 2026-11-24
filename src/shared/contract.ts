/// <reference lib="esnext" />
// The contract with Fidelity (owner 2026-11-23: "a mapping for each and every functionality or data we fetch from
// Fidelity, so if they change something we will know what it was, what it is now and where to fix it"). Every thing
// this app relies on is one entry: what we expect, where on Fidelity it comes from, and the files that use it. The
// userscript runs the checks on every read and shows the broken entries (panel and ⚙️ in the viewer); the tests run them
// on recorded shapes (made-up values) and on broken copies, so a check that would not notice a change fails too.
// Seen live on 2026-11-23..24 (1,100 positions, 6 accounts): every check below passed

export interface Clause {
  id: string;
  what: string; // what we rely on, in plain words
  source: string; // where on Fidelity
  usedIn: string[]; // the files to fix when it breaks
}

export interface Finding { id: string; level: 'error' | 'warning'; problem: string }

export const CLAUSES: Clause[] = [
  { id: 'pages.urls', what: 'the positions, portfolio and login pages live at these paths', source: 'https://digital.fidelity.com/ftgw/digital/portfolio/positions, /portfolio/*, /prgw/digital/login/*', usedIn: ['src/userscript/header.ts', 'src/userscript/main.ts'] },
  { id: 'grid.api', what: 'the positions grid is an ag-grid whose rows keep their data: .ag-row -> __AG_* -> renderedRow.beans.gridApi.forEachNode', source: '/ftgw/digital/portfolio/positions', usedIn: ['src/userscript/inject.ts'] },
  { id: 'grid.rowTypes', what: 'row kinds ACCOUNT, POSITION, POSITION_CORE, PENDING, ACCOUNT_TOTAL, SPACER, GRAND_TOTAL', source: 'positions grid rows', usedIn: ['src/shared/parse.ts'] },
  { id: 'grid.fields', what: 'the fields we read on each row kind exist, cells as { val, disp }, names as text', source: 'positions grid rows', usedIn: ['src/shared/parse.ts', 'src/shared/sheets/tabs.ts'] },
  { id: 'grid.dates', what: 'dates shown as Mon-DD-YYYY (Dec-12-2026) or --', source: 'exDvDte, pyDte of positions', usedIn: ['src/shared/parse.ts'] },
  { id: 'grid.percents', what: 'percents in percent units: val 4.06 is shown as 4.06%', source: 'todGLPct, totGLPct, actPer', usedIn: ['src/shared/parse.ts', 'src/viewer/ui/format.ts'] },
  { id: 'sidebar', what: 'the account list: .acct-selector__group (-name), __acct-wrapper, __acct-name, __acct-num, __balance-wrapper', source: 'left column of the portfolio pages', usedIn: ['src/userscript/read.ts'] },
  { id: 'asOf', what: 'the line "As of Nov-23-2026 9:37 p.m. ET"', source: 'portfolio pages', usedIn: ['src/userscript/read.ts', 'src/shared/sheets/sync.ts'] },
  { id: 'refresh', what: 'a button named "Refresh Positions" (👀 Watch presses it)', source: 'positions grid toolbar', usedIn: ['src/userscript/watch.ts'] },
  { id: 'balanceHistory', what: 'POST /ftgw/digital/portfolio/api/BalanceHistory { range, acctList } answers balHistoryDetail.balances [{ value, date MM/DD/YYYY }]', source: 'the Summary balance chart', usedIn: ['src/shared/history.ts', 'src/userscript/history-sync.ts'] },
  { id: 'login', what: 'the login page has a username field, a password field and a "Log In" button; a one-time code page has a code field', source: '/prgw/digital/login/full-page', usedIn: ['src/userscript/signin.ts'] },
];

export const clause = (id: string): Clause => CLAUSES.find((c) => c.id === id)!;

export const ROW_TYPES = ['ACCOUNT', 'POSITION', 'POSITION_CORE', 'PENDING', 'ACCOUNT_TOTAL', 'SPACER', 'GRAND_TOTAL'];

// t = text, c = { val, disp } cell; required = an error when no row of that kind has it, optional = a warning
type Want = Record<string, 't' | 'c'>;
export const REQUIRED: Record<string, Want> = {
  POSITION: { actNum: 't', 'sym.name': 't', 'sym.desc': 't', qty: 'c', lstPrc: 'c', curVal: 'c', todGL: 'c', todGLPct: 'c', totGL: 'c', totGLPct: 'c', cstBasTot: 'c', 'meta.securityType': 't' },
  POSITION_CORE: { actNum: 't', 'sym.name': 't', curVal: 'c' },
  PENDING: { actNum: 't', curVal: 'c' },
  ACCOUNT: { actNum: 't', actNam: 't', 'meta.acctType': 't' },
  ACCOUNT_TOTAL: { actNum: 't', curVal: 'c', todGL: 'c', todGLPct: 'c' },
};
export const OPTIONAL: Record<string, Want> = {
  POSITION: { 'sym.cusip': 't', 'meta.securitySubType': 't', cstBasShr: 'c', actPer: 'c', distYld: 'c', secYld: 'c', estAnuInc: 'c', dvAmt: 'c', dividendFrequency: 'c', exDvDte: 'c', pyDte: 'c', marketCap: 'c', sector: 'c', industry: 'c', 'fifTwo.low': 'c', 'fifTwo.high': 'c', lstPrChg: 'c', lstPrChgPct: 'c' },
  ACCOUNT_TOTAL: { totGL: 'c', cstBasTot: 'c', estAnuInc: 'c' },
};

const get = (o: unknown, path: string): unknown => path.split('.').reduce<unknown>((x, k) => (x === null || x === undefined ? undefined : (x as Record<string, unknown>)[k]), o);
const isCell = (v: unknown): boolean => !!v && typeof v === 'object' && ('val' in (v as object) || 'disp' in (v as object));

/** grid rows against grid.rowTypes, grid.fields, grid.dates, grid.percents */
export function checkGridRows(rows: Array<Record<string, unknown>>): Finding[] {
  const out: Finding[] = [];
  if (!rows.length) return [{ id: 'grid.api', level: 'error', problem: 'the grid gave no rows' }];
  const kinds = new Set(rows.map((r) => String(r.rowType)));
  ['POSITION', 'ACCOUNT', 'ACCOUNT_TOTAL'].forEach((k) => { if (!kinds.has(k)) out.push({ id: 'grid.rowTypes', level: 'error', problem: `no ${k} rows` }); });
  kinds.forEach((k) => { if (ROW_TYPES.indexOf(k) < 0) out.push({ id: 'grid.rowTypes', level: 'warning', problem: `a new row kind: ${k}` }); });
  const fields = (want: Record<string, Want>, level: Finding['level']) => Object.keys(want).forEach((kind) => {
    const rs = rows.filter((r) => r.rowType === kind);
    if (!rs.length) return;
    Object.keys(want[kind]!).forEach((path) => {
      const vals = rs.map((r) => get(r, path)).filter((v) => v !== undefined && v !== null);
      if (!vals.length) { out.push({ id: 'grid.fields', level, problem: `${kind}.${path} is gone` }); return; }
      const t = want[kind]![path];
      const bad = vals.filter((v) => (t === 't' ? typeof v !== 'string' : !isCell(v))).length;
      if (bad) out.push({ id: 'grid.fields', level, problem: `${kind}.${path} is not ${t === 't' ? 'text' : 'a { val, disp } cell'} in ${bad} of ${vals.length} rows` });
    });
  });
  fields(REQUIRED, 'error');
  fields(OPTIONAL, 'warning');
  const positions = rows.filter((r) => r.rowType === 'POSITION');
  const dates = positions.flatMap((r) => ['exDvDte', 'pyDte'].map((k) => (get(r, k) as { disp?: unknown } | undefined)?.disp)).filter((d) => d !== undefined && d !== null).map(String);
  const badDates = dates.filter((d) => !/^[A-Z][a-z]{2}-\d{2}-\d{4}$/.test(d) && d.trim() !== '--' && d.trim() !== '');
  if (badDates.length) out.push({ id: 'grid.dates', level: 'error', problem: `dates in another format, e.g. "${badDates[0]}" (${badDates.length} of ${dates.length})` });
  const ratios = positions.map((r) => r.todGLPct as { val?: unknown; disp?: unknown } | undefined)
    .filter((c) => c && typeof c.val === 'number' && Math.abs(c.val) >= 0.5 && /%/.test(String(c.disp)))
    .map((c) => Math.abs(parseFloat(String(c!.disp).replace(/[^0-9.-]/g, '')) / (c!.val as number)));
  if (ratios.length && ratios.some((x) => Math.abs(x - 1) > 0.02)) out.push({ id: 'grid.percents', level: 'error', problem: `todGLPct val is not in percent units (disp / val = ${ratios.find((x) => Math.abs(x - 1) > 0.02)!.toFixed(3)})` });
  return out;
}

/** the account list, the "As of" line and the refresh button of a portfolio page */
export function checkPage(doc: Document, onPositions: boolean): Finding[] {
  const out: Finding[] = [];
  const need = ['.acct-selector__group', '.acct-selector__group-name', '.acct-selector__acct-wrapper', '.acct-selector__acct-num', '.acct-selector__acct-name', '.acct-selector__balance-wrapper'];
  const missing = need.filter((s) => !doc.querySelector(s));
  if (missing.length) out.push({ id: 'sidebar', level: 'error', problem: `not found: ${missing.join(', ')}` });
  if (!/As of [A-Z][a-z]{2}-\d{2}-\d{4}[^\n]{0,20}?(a\.m\.|p\.m\.) ET/.test(doc.body?.innerText ?? doc.body?.textContent ?? '')) out.push({ id: 'asOf', level: 'warning', problem: 'no "As of Mon-DD-YYYY h:mm a.m./p.m. ET" line' });
  if (onPositions) {
    const refresh = Array.from(doc.querySelectorAll('button')).some((b) => /^refresh positions$/i.test((b.getAttribute('aria-label') || b.textContent || '').trim()));
    if (!refresh) out.push({ id: 'refresh', level: 'warning', problem: 'no "Refresh Positions" button (👀 Watch cannot refresh)' });
  }
  return out;
}

/** a BalanceHistory answer */
export function checkBalanceHistory(json: unknown): Finding[] {
  const list = (json as { balHistoryDetail?: { balances?: unknown } } | null)?.balHistoryDetail?.balances;
  if (!Array.isArray(list)) return [{ id: 'balanceHistory', level: 'error', problem: 'no balHistoryDetail.balances list in the answer' }];
  const bad = list.filter((b) => typeof (b as { value?: unknown })?.value !== 'number' || !/^\d{2}\/\d{2}\/\d{4}$/.test(String((b as { date?: unknown })?.date)));
  return bad.length ? [{ id: 'balanceHistory', level: 'error', problem: `${bad.length} of ${list.length} points are not { value: number, date: MM/DD/YYYY }` }] : [];
}

/** a stored report for the viewer and the panel */
export interface Report { at: string; checked: string[]; findings: Finding[] }

/** "id: problem (fix in file, file)" lines for people */
export function describe(f: Finding): string {
  const c = clause(f.id);
  return `${f.level === 'error' ? '✗' : '!'} ${f.id}: ${f.problem} (fix in ${c ? c.usedIn.join(', ') : '?'})`;
}

/** the newest report wins per check, so a page that only checks the sidebar keeps the grid's last result */
export function mergeReport(prev: Report | null, next: Report): Report {
  if (!prev) return next;
  const findings = prev.findings.filter((f) => next.checked.indexOf(f.id) < 0).concat(next.findings);
  return { at: next.at, checked: Array.from(new Set(prev.checked.concat(next.checked))), findings };
}
