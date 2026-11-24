/// <reference lib="esnext" />
// One bundle, three roles picked by the address: the Fidelity portfolio pages (read the positions), the Fidelity
// login page (optional automatic login) and the viewer (bridge to the page). READ ONLY on Fidelity: the script never
// clicks or submits anything there except the login form with the owner's saved login
import { buildDataset, type GridRow } from '../shared/parse';
import { mergeDatasets, parseDataset } from '../shared/model';
import { mountBadge, type Badge } from './badge';
import { COMMAND_KEY, freshCommand } from './command';
import { DATASET_KEY, RUN_KEY, SHEETS_KEY, TXNS_KEY, gmDelete, gmGet, gmSet, gmWatch, notify } from './gm';
import { POSITIONS_URL } from './header';
import { PAGE_TAG, askGrid, injectPageReader } from './inject';
import { historyDue, pagePost, readHistory } from './history-sync';
import { mergeHistory } from '../shared/history';
import { parseTxnStore } from '../shared/transactions';
import { EMPTY_STORE, readTransactions } from './transactions-sync';
import { checkBalanceHistory, checkGridRows, checkPage, mergeReport, type Finding, type Report } from '../shared/contract';
import { WATCH_KEY, WATCH_REFRESH_MS, acceptRead, findRefreshButton, marketOpen, sheetsDue } from './watch';
import { readAsOf, readSidebar } from './read';
import { GOOGLE_KEY, gmFetch, usableHandoff, writeSets, type Prints } from './sheets-gm';
import { createSheetsQueue } from './sheets-queue';
import { isLoginPage, passwordRefused, planSignin, signinStep, type Login } from './signin';

declare const GM_xmlhttpRequest: Parameters<typeof gmFetch>[0] | undefined;
declare const __VERSION__: string;
const VERSION = typeof __VERSION__ === 'string' ? __VERSION__ : 'dev';

// Tampermonkey storage keys (this script only)
const LOGIN_KEY = 'fidelity-accounts.login'; // { user, pass }: never leaves Tampermonkey storage
const AUTO_KEY = 'fidelity-accounts.autoLogin'; // log in whenever the login page opens (default on, owner 2026-11-23)
const PRINTS_KEY = 'fidelity-accounts.sheetsPrints'; // { id, prints }: each set's last write to that sheet (skip same content)
const RESUME_KEY = 'fidelity-accounts.resume'; // { at }: a sync asked while logged out, go to Positions after the login
const FLOW_KEY = 'fidelity-accounts.loginFlowAt';
const PASS_KEY = 'fidelity-accounts.loginPassAt';
const REFUSED_KEY = 'fidelity-accounts.loginRefusedAt'; // the saved password was refused: no auto login until 🔑 Save
const RESUME_MAX_AGE_MS = 30 * 60 * 1000;
// the live check of the contract with Fidelity (src/shared/contract.ts): the newest result per entry, for the panel and the viewer
const CONTRACT_KEY = 'fidelity-accounts.contract';
function report(checked: string[], findings: Finding[]): Report {
  const prev = (() => { try { return JSON.parse(gmGet<string>(CONTRACT_KEY, '')) as Report; } catch { return null; } })();
  const next = mergeReport(prev, { at: new Date().toISOString(), checked, findings });
  gmSet(CONTRACT_KEY, JSON.stringify(next));
  return next;
}

const time = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const onPositions = () => /\/portfolio\/positions/.test(location.pathname);

function download(name: string, data: string): void {
  const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function loginHooks() {
  return {
    saved: () => gmGet<Login | null>(LOGIN_KEY, null)?.user ?? null,
    save: (user: string, pass: string) => { gmSet(LOGIN_KEY, { user, pass }); gmDelete(REFUSED_KEY); },
    forget: () => gmDelete(LOGIN_KEY),
    auto: () => gmGet<boolean>(AUTO_KEY, true),
    setAuto: (on: boolean) => gmSet(AUTO_KEY, on),
  };
}

function onPortfolio(): void {
  let lastRead = 0;
  let lastWrite = 0;
  let asked = false; // the next copy of the grid was asked for (⬇, a command): taken at once, the sheet written at once
  const watching = () => gmGet<boolean>(WATCH_KEY, false) === true;
  const goPositions = () => { asked = true; if (onPositions()) askGrid(); else location.href = POSITIONS_URL; };
  const badge: Badge = mountBadge(VERSION, (a) => {
    if (a === 'read') { badge.status('reading the positions…'); goPositions(); }
    if (a === 'watch') gmSet(WATCH_KEY, !watching());
    if (a === 'json') { const saved = gmGet<string | null>(DATASET_KEY, null); if (saved) download(`fidelity-accounts-${new Date().toISOString().slice(0, 10)}.json`, saved); }
  }, loginHooks());
  const how = injectPageReader();
  badge.status(how === 'failed' ? '!could not start the page reader (Tampermonkey: allow GM_addElement)' : onPositions() ? 'waiting for the positions table…' : 'open Positions (or press ⬇): the script reads it by itself');

  // the fidelity_* tabs are written only from here (one way data flow, shared/sheets/sync.ts), by data set: summary and
  // positions after a read of the grid, summary after the daily values, transactions after their daily read. Each write
  // marks fidelity_updates and leaves a signal for the viewer, which then reads those sets back from the sheet. Without
  // a Google token the sets wait until the viewer hands one over
  const sheetsQueue = createSheetsQueue({
    ready: () => !!usableHandoff(gmGet<string | null>(GOOGLE_KEY, null), Date.now()) && typeof GM_xmlhttpRequest === 'function',
    waiting: () => badge.sheets('sheets: waiting for ☁️ in the viewer (it hands over the Google sign-in)'),
    failed: (err) => badge.sheets(`sheets: ${err instanceof Error ? err.message : String(err)}`.slice(0, 200)),
    write: async (sets) => {
      const g = usableHandoff(gmGet<string | null>(GOOGLE_KEY, null), Date.now());
      if (!g || typeof GM_xmlhttpRequest !== 'function') throw new Error('no Google sign-in');
      const data = { ds: parseDataset(gmGet<string>(DATASET_KEY, '')), store: parseTxnStore(gmGet<string>(TXNS_KEY, '')) };
      // prints belong to one spreadsheet: a new one gets every set
      const kept = gmGet<{ id?: string; prints?: Prints }>(PRINTS_KEY, {});
      const { done, prints } = await writeSets(sets, data, kept.id === g.spreadsheetId ? kept.prints ?? {} : {}, g, gmFetch(GM_xmlhttpRequest), () => {});
      gmSet(PRINTS_KEY, { id: g.spreadsheetId, prints });
      // the viewer is told only when something new is in the sheet
      if (done.length) gmSet(SHEETS_KEY, JSON.stringify({ at: Date.now(), sets: done }));
      badge.sheets(done.length ? `sheets: ${done.join(', ')} written ${time()}` : `sheets: nothing new ${time()}`);
    },
  });
  gmWatch(GOOGLE_KEY, () => void sheetsQueue.retry());

  // the daily values for the chart (BalanceHistory), once a day after a read: 3Y the first time, then 1M
  let historyBusy = false;
  const syncHistory = async () => {
    historyBusy = true;
    try {
      const stored = parseDataset(gmGet<string>(DATASET_KEY, ''));
      if (stored && stored.accounts.length) {
        const seen: Finding[] = [];
        const fresh = await readHistory(stored.accounts, stored.history, async (url, body) => { const json = await pagePost(url, body); seen.push(...checkBalanceHistory(json)); return json; });
        report(['balanceHistory'], seen.slice(0, 1));
        const latest = parseDataset(gmGet<string>(DATASET_KEY, '')) ?? stored;
        const next = { ...latest, history: mergeHistory(latest.history, fresh), historyAt: new Date().toISOString() };
        gmSet(DATASET_KEY, JSON.stringify(next));
        badge.status(`history: ${Object.keys(fresh).length} accounts updated ${time()}`);
        void sheetsQueue.add(['summary']);
      }
    } catch (err) {
      badge.status(`!history: ${err instanceof Error ? err.message : String(err)}`);
    }
    historyBusy = false;
    if (historyDue(parseTxnStore(gmGet<string>(TXNS_KEY, ''))?.at || undefined, new Date()) && !txnsBusy) void syncTransactions();
  };

  // the transactions history once a day, right after the daily values: facts for income, deposits and holdings
  let txnsBusy = false;
  const syncTransactions = async () => {
    txnsBusy = true;
    try {
      const stored = parseDataset(gmGet<string>(DATASET_KEY, ''));
      if (stored && stored.accounts.length) {
        badge.status('transactions: reading…');
        const now = new Date();
        const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const { store, failed } = await readTransactions(stored.accounts, parseTxnStore(gmGet<string>(TXNS_KEY, '')) ?? EMPTY_STORE, stored.history, today, pagePost);
        gmSet(TXNS_KEY, JSON.stringify(store));
        void sheetsQueue.add(['transactions']);
        badge.status(`transactions: ${store.rows.length} rows${failed.length ? `, !${failed.length} accounts wait for tomorrow` : ''} · ${time()}`);
      }
    } catch (err) {
      badge.status(`!transactions: ${err instanceof Error ? err.message : String(err)}`);
    }
    txnsBusy = false;
  };

  window.addEventListener('message', (e) => {
    if (e.origin !== location.origin || !e.data || e.data.source !== PAGE_TAG) return;
    if (e.data.type === 'error') { badge.status(`!page reader: ${String(e.data.message)}`); report(['grid.api'], [{ id: 'grid.api', level: 'error', problem: String(e.data.message).slice(0, 200) }]); return; }
    if (e.data.type !== 'grid' || typeof e.data.json !== 'string') return;
    const now = Date.now();
    const wasAsked = asked || e.data.forced === true;
    if (!acceptRead({ asked: wasAsked, watching: watching(), now, lastRead })) return;
    lastRead = now;
    asked = false;
    try {
      const rows = JSON.parse(e.data.json) as GridRow[];
      const r = report(['grid.api', 'grid.rowTypes', 'grid.fields', 'grid.dates', 'grid.percents', 'sidebar', 'asOf', 'refresh'], checkGridRows(rows).concat(checkPage(document, onPositions())));
      const broken = r.findings.filter((f) => f.level === 'error');
      if (broken.length) badge.sheets(`!Fidelity changed: ${broken.map((f) => f.id).join(', ')} (details in ⚙️ of the viewer)`);
      const ds = buildDataset({ rows, sidebar: readSidebar(document), asOf: readAsOf(document), builtAt: new Date().toISOString() });
      const merged = mergeDatasets(parseDataset(gmGet<string>(DATASET_KEY, '')), ds);
      gmSet(DATASET_KEY, JSON.stringify(merged));
      gmSet(RUN_KEY, JSON.stringify({ status: 'done', at: Date.now(), accounts: merged.accounts.length, positions: merged.positions.length, message: ds.asOf }));
      badge.status(`read: ${ds.accounts.length} accounts, ${ds.positions.length} positions · ${time()}${watching() ? ' · watching' : ''}${ds.asOf ? `\n${ds.asOf}` : ''}`);
      if (sheetsDue({ asked: wasAsked, watching: watching(), now, lastWrite })) { lastWrite = now; void sheetsQueue.add(['summary', 'positions']); }
      if (historyDue(merged.historyAt, new Date()) && !historyBusy) void syncHistory();
    } catch (err) {
      badge.status(`!read failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  });

  // 👀 Watch: press the page's own Refresh Positions every 10 minutes while it is on (a read, nothing changes on Fidelity)
  let refreshTimer: ReturnType<typeof setInterval> | null = null;
  const applyWatch = () => {
    const on = watching();
    badge.watching(on);
    // no jump to Positions and no refresh when a page opens or reloads (owner 2026-11-24): the page reads the grid by
    // itself; only the viewer's 👀 opens Positions. On Positions the refresh runs every 10 minutes, first after 10 minutes,
    // and only while the market is open (positions do not change otherwise)
    if (on && !refreshTimer) {
      refreshTimer = setInterval(() => {
        if (!onPositions() || !marketOpen(new Date())) return;
        const b = findRefreshButton(document);
        if (b) b.click(); else askGrid();
      }, WATCH_REFRESH_MS);
    }
    if (!on && refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
  };
  applyWatch();
  gmWatch(WATCH_KEY, applyWatch);

  // the daily values and the transactions are API reads, they need no grid: on any portfolio page (Summary too) they
  // run once a day a few seconds after the page opens (owner 2026-11-24: the income stayed -- on the Summary page)
  setTimeout(() => {
    const stored = parseDataset(gmGet<string>(DATASET_KEY, ''));
    if (!stored || !stored.accounts.length) return;
    if (historyDue(stored.historyAt, new Date())) { if (!historyBusy) void syncHistory(); }
    else if (historyDue(parseTxnStore(gmGet<string>(TXNS_KEY, ''))?.at || undefined, new Date()) && !txnsBusy) void syncTransactions();
  }, 3000);

  // ⬇ Sync in the viewer: this tab was opened (or is reused) for it
  const takeCommand = (raw: unknown) => {
    if (!freshCommand(raw, Date.now())) return;
    gmDelete(COMMAND_KEY);
    badge.status('sync asked from the viewer: reading the positions…');
    // on Positions: the page's own refresh brings fresh numbers, the read follows; elsewhere: go to Positions
    if (onPositions()) { asked = true; const b = findRefreshButton(document); if (b) b.click(); else askGrid(); } else goPositions();
  };
  takeCommand(gmGet<string | null>(COMMAND_KEY, null));
  gmWatch(COMMAND_KEY, takeCommand);
  // back after a login with a sync waiting
  const resume = gmGet<{ at: number } | null>(RESUME_KEY, null);
  if (resume) {
    gmDelete(RESUME_KEY);
    if (Date.now() - resume.at < RESUME_MAX_AGE_MS) goPositions();
  }
}

// the login page renders its form a little after load: wait until a field shows before judging it
const fieldsReady = (): boolean => !!document.querySelector('input');

function onLogin(): void {
  const badge = mountBadge(VERSION, (a) => { if (a === 'read') location.href = POSITIONS_URL; }, loginHooks());
  badge.status('log in (or save the login under 🔑): reading starts after the login');
  // a sync asked while logged out: continue on Positions after this login
  if (freshCommand(gmGet<string | null>(COMMAND_KEY, null), Date.now())) {
    gmSet(RESUME_KEY, { at: Date.now() });
    gmDelete(COMMAND_KEY);
  }
  const login = gmGet<Login | null>(LOGIN_KEY, null);
  const resume = gmGet<{ at: number } | null>(RESUME_KEY, null);
  const wanted = gmGet<boolean>(AUTO_KEY, true) || (!!resume && Date.now() - resume.at < RESUME_MAX_AGE_MS);
  if (!login || !wanted || !isLoginPage(location.pathname)) return;
  if (gmGet<number>(REFUSED_KEY, 0)) { badge.status('!the saved password was refused: log in yourself and save the new one under 🔑'); return; }
  const first = { flowAt: gmGet<number>(FLOW_KEY, 0), passAt: gmGet<number>(PASS_KEY, 0) };
  let tries = 0;
  let checkedRefusal = false;
  const timer = setInterval(() => {
    const now = Date.now();
    if (!fieldsReady() && ++tries < 60) return;
    if (!fieldsReady()) { report(['login'], [{ id: 'login', level: 'error', problem: 'no input fields on the login page after 60 s' }]); clearInterval(timer); return; }
    if (!checkedRefusal) {
      checkedRefusal = true;
      if (passwordRefused(document, first, now)) {
        gmSet(REFUSED_KEY, now);
        notify('fidelity-accounts: saved password refused', 'Fidelity did not accept the saved login: log in yourself and save the new password under 🔑');
        badge.status('!the saved password was refused: log in yourself and save the new one under 🔑');
        clearInterval(timer);
        return;
      }
    }
    const marks = { flowAt: gmGet<number>(FLOW_KEY, 0), passAt: gmGet<number>(PASS_KEY, 0) };
    const step = signinStep(document, login, planSignin(marks, now));
    if (step === 'filled-user') gmSet(FLOW_KEY, now);
    if (step === 'filled-pass') {
      if (now - marks.flowAt >= 2 * 60 * 1000) gmSet(FLOW_KEY, now); // one-page form: the password step starts the flow
      gmSet(PASS_KEY, now);
      badge.status('logging in with the saved login…');
    }
    if (step === 'mfa') { notify('fidelity-accounts: enter the code', 'Fidelity asks for a one-time code: type it, reading starts after the login'); badge.status('!type the one-time code: reading starts after the login'); }
    if (step === 'too-soon') badge.status('!an automatic login was tried less than 30 minutes ago: log in yourself (no lockout)');
    if (step === 'filled-pass' || step === 'mfa' || step === 'too-soon' || ++tries > 120) clearInterval(timer);
  }, 1000);
}

// Viewer page (GitHub Pages or the dev server): mark the page and hand over the data, now and on every change
function onViewer(): void {
  document.documentElement.dataset.fidelityAccountsUserscript = VERSION;
  const post = (type: string, json: unknown) => { if (typeof json === 'string') window.postMessage({ type, json }, location.origin); };
  // `chosen`: the owner switched 👀 on or off at least once (here, on the Fidelity badge or in the viewer); the viewer
  // then never switches it on by itself (owner 2026-11-24: "do not want if it was disabled previously")
  const postWatch = () => post('fidelity-accounts:watch', JSON.stringify({ on: gmGet<boolean>(WATCH_KEY, false) === true, chosen: gmGet<boolean | null>(WATCH_KEY, null) !== null }));
  window.addEventListener('message', (e) => {
    if (e.origin !== location.origin || !e.data) return;
    // the Google token after ☁️ and each silent renew: the Fidelity tab writes the fidelity_* tabs with it
    if (e.data.type === 'fidelity-accounts:google' && typeof e.data.json === 'string') gmSet(GOOGLE_KEY, e.data.json);
    if (e.data.type === 'fidelity-accounts:command' && e.data.mode === 'sync') gmSet(COMMAND_KEY, JSON.stringify({ mode: 'sync', at: Date.now() }));
    if (e.data.type === 'fidelity-accounts:watch-set' && typeof e.data.on === 'boolean') gmSet(WATCH_KEY, e.data.on);
    if (e.data.type === 'fidelity-accounts:request') { post('fidelity-accounts:run', gmGet(RUN_KEY, null)); post('fidelity-accounts:contract', gmGet(CONTRACT_KEY, null)); }
    // Full reset in the viewer: the script forgets its copy of the data, the last read and the Google token (the
    // Fidelity login stays: 🔑 on Fidelity manages it)
    if (e.data.type === 'fidelity-accounts:forget') [DATASET_KEY, RUN_KEY, GOOGLE_KEY, COMMAND_KEY, RESUME_KEY, WATCH_KEY, CONTRACT_KEY, TXNS_KEY, SHEETS_KEY, PRINTS_KEY].forEach(gmDelete);
    if (e.data.type === 'fidelity-accounts:hello') { post('fidelity-accounts:login', JSON.stringify({ saved: !!gmGet<Login | null>(LOGIN_KEY, null) })); postWatch(); }
  });
  // no data crosses this bridge (one way data flow): only the signal that the sheet has new sets, the viewer reads them
  // from the sheet; the run state, the login yes or no, 👀 and the contract report are status, not data
  gmWatch(SHEETS_KEY, (v) => post('fidelity-accounts:sheets', v));
  post('fidelity-accounts:run', gmGet(RUN_KEY, null));
  post('fidelity-accounts:login', JSON.stringify({ saved: !!gmGet<Login | null>(LOGIN_KEY, null) }));
  gmWatch(RUN_KEY, (v) => post('fidelity-accounts:run', v));
  gmWatch(LOGIN_KEY, (v) => post('fidelity-accounts:login', JSON.stringify({ saved: !!v })));
  postWatch();
  gmWatch(WATCH_KEY, postWatch);
  post('fidelity-accounts:contract', gmGet(CONTRACT_KEY, null));
  gmWatch(CONTRACT_KEY, (v) => post('fidelity-accounts:contract', v));
}

if (location.hostname === 'digital.fidelity.com' && isLoginPage(location.pathname)) onLogin();
else if (location.hostname === 'digital.fidelity.com') onPortfolio();
else onViewer();
