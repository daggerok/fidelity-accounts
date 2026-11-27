/// <reference lib="esnext" />
// One bundle, three roles picked by the address: the Fidelity portfolio pages (read the positions), the Fidelity
// login page (optional automatic login) and the viewer (bridge to the page). READ ONLY on Fidelity: the script never
// clicks or submits anything there except the login form with the owner's saved login
import { buildDataset, type GridRow } from '../shared/parse';
import { mergeDatasets, parseDataset, type Account } from '../shared/model';
import { mountBadge, type Badge } from './badge';
import { COMMAND_KEY, SYNC_AT_KEY, freshCommand, syncAllowed } from './command';
import { DATASET_KEY, RUN_KEY, SHEETS_KEY, TXNS_CHECKED_KEY, TXNS_KEY, gmDelete, gmGet, gmSet, gmWatch, notify } from './gm';
import { POSITIONS_URL } from './header';
import { PAGE_TAG, askGrid, injectPageReader } from './inject';
import { pagePost, readHistory } from './history-sync';
import { mergeHistory } from '../shared/history';
import { parseTxnStore } from '../shared/transactions';
import { EMPTY_STORE, OVERLAP_DAYS, RECENT_DAYS, lastTxnsRead, readTransactions, sameTxns } from './transactions-sync';
import { betaRequest, betasDue, readBetas } from './beta-sync';
import { brokenProblems, checkBalanceHistory, checkGridRows, checkPage, mergeReport, type Finding, type Report } from '../shared/contract';
import { FORCE_READ_MS, WATCH_KEY, WATCH_REFRESH_MS, acceptRead, findRefreshButton, sheetsDue } from './watch';
import { DUE_TICK_MS, historyDue, marketOpen, txnsPlan } from './schedule';
import { READS_KEY, accountsHere, markRead, oldestRead, readsOf, type ReadKind } from './here';
import { TRIP_KEY, backNow, freshTrip, pageName, tripFrom } from './trip';
import { NOTICE_KEY, NOTICE_OK_MS, NOTIFY_KEY, VIEWER_BEAT_MS, VIEWER_KEY, makeNotice, viewerOnScreen, type NoticeLevel } from '../shared/notice';
import { readAsOf, readSidebar } from './read';
import { GOOGLE_KEY, gmFetch, handoffSheet, usableHandoff, writeKept, type KeptPrints } from './sheets-gm';
import { NO_POSITIONS, NO_READER, SHEETS_WAITING, balancesRead, betasFailed, betasRead, fidelityChanged, jobFailed, positionsRead, say, sheetWaitsAllow, sheetsFailed, transactionsFailed, transactionsRead, type Word } from '../shared/notice-words';
import { PIN_KEY, allowPin, declinePin, idTail, pinStep, readPin, type PinStep } from './pin';
import { DATA_SETS, type DataSet } from '../shared/sheets/sync';
import { memoByRaw } from './memo';
import { createSheetsQueue } from './sheets-queue';
import { inFlow, isLoginPage, passwordRefused, planSignin, signinStep, type Login } from './signin';

declare const GM_xmlhttpRequest: Parameters<typeof gmFetch>[0] | undefined;
declare const __VERSION__: string;
const VERSION = typeof __VERSION__ === 'string' ? __VERSION__ : 'dev';

// Tampermonkey storage keys (this script only)
const LOGIN_KEY = 'fidelity-accounts.login'; // { user, pass }: never leaves Tampermonkey storage
const AUTO_KEY = 'fidelity-accounts.autoLogin'; // log in whenever the login page opens (default on, owner 2026-11-23)
const PRINTS_KEY = 'fidelity-accounts.sheetsPrints'; // { id, prints, chunks }: each set's last write to that sheet (skip same content), the parts of fidelity_transactions
const ASKED_KEY = 'fidelity-accounts.sheetsAskedFor'; // the spreadsheet the last "waits for Allow" notice was about (one notice, not one per page)
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

// what the pin says about a handed-over spreadsheet (pin.ts), read only: the Fidelity tab acts on it, the viewer tab reports it
function pinFor(id: string): PinStep {
  const pin = readPin(gmGet<unknown>(PIN_KEY, null));
  return pinStep({ pin: pin.id, declined: pin.declined, printsId: gmGet<{ id?: string } | null>(PRINTS_KEY, null)?.id ?? '', handoffId: id });
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
  let readDone = false; // a copy of the grid was taken on this page (the round trip goes back after it)
  const watching = () => gmGet<boolean>(WATCH_KEY, false) === true;
  // the stored copies, parsed once per stored string (memo.ts): read only for everyone below
  const datasetMemo = memoByRaw(parseDataset);
  const txnsMemo = memoByRaw(parseTxnStore);
  const storedDataset = () => datasetMemo.get(gmGet<string>(DATASET_KEY, ''));
  const storedTxns = () => txnsMemo.get(gmGet<string>(TXNS_KEY, ''));
  // when the transactions were last read: the store's time or a later read that changed nothing (transactions-sync.ts)
  const txnsAt = () => lastTxnsRead(storedTxns(), gmGet<unknown>(TXNS_CHECKED_KEY, null));
  const notifying = () => gmGet<boolean>(NOTIFY_KEY, false) === true;
  // a finished job or an error, only while 🔔 is on: ONE notification (owner 2026-11-25: "why I have 2?", then "yes,
  // fix the double notifications"): the notice is always left for the viewer (it shows only fresh ones, as a popup), the
  // Tampermonkey notification goes out only when no viewer tab is on screen (its heartbeat, shared/notice.ts)
  // The words are plain sentences with their values (shared/notice-words.ts; owner 2026-11-25: the glued panel lines
  // were "very low quality", and the popups "should support i18n"): the viewer says them in its language, the browser
  // notification in English
  const announce = (level: NoticeLevel, words: Word[]) => {
    if (!notifying()) return;
    gmSet(NOTICE_KEY, makeNotice(level, words, Date.now()));
    if (viewerOnScreen(gmGet<unknown>(VIEWER_KEY, null), Date.now())) return;
    notify(level === 'error' ? 'fidelity-accounts: error' : 'fidelity-accounts', say(words), level === 'error' ? 0 : NOTICE_OK_MS);
  };
  // the page to come back to after this visit of Positions (trip.ts)
  const trip = onPositions() ? freshTrip(gmGet<unknown>(TRIP_KEY, null), Date.now()) : null;
  if (!trip) gmDelete(TRIP_KEY);
  const back = trip ? ` · back to ${pageName(trip.from)}` : '';

  // after a press of Refresh Positions the copy is asked for anyway: the page reader posts only a changed copy
  const refreshAndRead = () => {
    asked = true;
    const b = findRefreshButton(document);
    if (b) b.click(); else askGrid();
    setTimeout(() => { if (asked) askGrid(); }, FORCE_READ_MS);
  };
  // elsewhere: keep this page for the way back, open Positions (a fresh page reads by itself)
  const goPositions = () => {
    if (onPositions()) { asked = true; askGrid(); return; }
    const from = tripFrom(location.href);
    if (from) gmSet(TRIP_KEY, { from, at: Date.now() }); else gmDelete(TRIP_KEY);
    location.href = POSITIONS_URL;
  };
  // a sync (the viewer, 👀 every 10 minutes): on Positions its own refresh and a read, elsewhere the round trip
  const syncNow = () => { if (onPositions()) refreshAndRead(); else goPositions(); };

  const badge: Badge = mountBadge(VERSION, (a) => {
    if (a === 'read') { badge.status('reading the positions…'); goPositions(); }
    if (a === 'watch') gmSet(WATCH_KEY, !watching());
    if (a === 'notify') gmSet(NOTIFY_KEY, !notifying());
    if (a === 'json') { const saved = gmGet<string | null>(DATASET_KEY, null); if (saved) download(`fidelity-accounts-${new Date().toISOString().slice(0, 10)}.json`, saved); }
    // Allow pins the spreadsheet that was shown, and only while the viewer still hands it over (a swap in between asks
    // again); every stored set is then written to it, so a new sheet fills without waiting for the next reads
    if (a === 'sheet-allow') {
      if (askedId && askedId === handoffSheet(gmGet<string | null>(GOOGLE_KEY, null))) {
        gmSet(PIN_KEY, allowPin(askedId));
        sheetsNote = `sheets: spreadsheet ${idTail(askedId)} allowed`;
        badge.sheets(sheetsNote);
        checkPin();
        void sheetsQueue.add(DATA_SETS);
      } else checkPin();
    }
    if (a === 'sheet-keep' && askedId) { gmSet(PIN_KEY, declinePin(readPin(gmGet<unknown>(PIN_KEY, null)), askedId)); checkPin(); }
  }, loginHooks());
  badge.notifying(notifying());
  gmWatch(NOTIFY_KEY, () => badge.notifying(notifying()));
  const how = injectPageReader();
  if (how === 'failed') announce('error', NO_READER);
  badge.status(how === 'failed' ? '!could not start the page reader (Tampermonkey: allow GM_addElement)' : onPositions() ? `waiting for the positions table…${back}` : 'open Positions (or press ⬇): the script reads it by itself');

  // the fidelity_* tabs are written only from here (one way data flow, shared/sheets/sync.ts), by data set: summary and
  // positions after a read of the grid, summary after the daily values, transactions after their read. Each write
  // marks fidelity_updates and leaves a signal for the viewer, which then reads those sets back from the sheet. Without
  // a Google token the sets wait until the viewer hands one over
  let sheetsNote = '';
  // the last run of the queue put something new into the sheet: a notice then says so (notice-text.ts)
  let sheetsSaved = false;
  // the spreadsheet of the handoff against the pinned one (pin.ts): writes go only to the pinned id. The first handoff
  // after the update to the pin pins the sheet this script has been writing to (its prints) with no click; any other id
  // waits for Allow on this panel, and while it waits nothing is written at all: the token belongs to that handoff, and
  // writing on to the old sheet with it is not what the viewer asked for
  const sheetStep = (id: string): PinStep => {
    const step = pinFor(id);
    if (step !== 'adopt') return step;
    gmSet(PIN_KEY, allowPin(id));
    return 'write';
  };
  let askedId = ''; // the spreadsheet the panel asks about now
  const checkPin = (): PinStep => {
    const id = handoffSheet(gmGet<string | null>(GOOGLE_KEY, null));
    const step = id ? sheetStep(id) : 'idle';
    if (step !== 'ask' && step !== 'declined') {
      if (askedId) { askedId = ''; badge.askSheet(null); }
      return step;
    }
    askedId = id;
    const current = readPin(gmGet<unknown>(PIN_KEY, null)).id;
    badge.askSheet({ tail: idTail(id), current: current ? idTail(current) : '', declined: step === 'declined' });
    sheetsNote = step === 'ask'
      ? `sheets: the viewer hands over spreadsheet ${idTail(id)}: nothing is written until Allow on this panel`
      : `sheets: spreadsheet ${idTail(id)} was declined here: nothing is written`;
    badge.sheets(sheetsNote);
    // one notice per asked spreadsheet, kept in storage: the pages of a round trip and the other Fidelity tabs ask again
    // on the panel but do not ring again
    if (step === 'ask' && gmGet<string>(ASKED_KEY, '') !== id) {
      gmSet(ASKED_KEY, id);
      announce('error', sheetWaitsAllow(idTail(id)));
    }
    return step;
  };
  const sheetsQueue = createSheetsQueue({
    ready: () => {
      const g = usableHandoff(gmGet<string | null>(GOOGLE_KEY, null), Date.now());
      return !!g && typeof GM_xmlhttpRequest === 'function' && sheetStep(g.spreadsheetId) === 'write';
    },
    waiting: () => {
      const step = checkPin();
      if (step === 'ask' || step === 'declined') return;
      sheetsNote = 'sheets: waiting for ☁️ in the viewer (it hands over the Google sign-in)'; badge.sheets(sheetsNote); announce('error', SHEETS_WAITING);
    },
    failed: (err) => { sheetsNote = `sheets: ${err instanceof Error ? err.message : String(err)}`.slice(0, 200); badge.sheets(sheetsNote); announce('error', sheetsFailed(err)); },
    write: async (sets) => {
      const g = usableHandoff(gmGet<string | null>(GOOGLE_KEY, null), Date.now());
      if (!g || typeof GM_xmlhttpRequest !== 'function') throw new Error('no Google sign-in');
      if (sheetStep(g.spreadsheetId) !== 'write') throw new Error(`spreadsheet ${idTail(g.spreadsheetId)} waits for Allow on this panel`);
      // the store goes out with the time of the last read, as it did when every read stored the whole store again
      const store = storedTxns();
      const at = txnsAt();
      const data = { ds: storedDataset(), store: store && at !== store.at ? { ...store, at } : store };
      // prints belong to one spreadsheet: a new one gets every set (writeKept)
      const done = await writeKept(sets, data, g, gmFetch(GM_xmlhttpRequest), { get: () => gmGet<KeptPrints | null>(PRINTS_KEY, null), set: (k) => { gmSet(PRINTS_KEY, k); } });
      // the viewer is told only when something new is in the sheet
      if (done.length) gmSet(SHEETS_KEY, JSON.stringify({ at: Date.now(), sets: done }));
      sheetsSaved = done.length > 0;
      sheetsNote = done.length ? `sheets: ${done.join(', ')} written` : 'sheets: nothing new';
      badge.sheets(`${sheetsNote} ${time()}`);
    },
  });
  // queue these sets and tell whether this run saved something new to the sheet (a notice is then titled "Google Sheets updated")
  const saveSets = async (sets: DataSet[]): Promise<boolean> => { sheetsSaved = false; await sheetsQueue.add(sets); return sheetsSaved; };
  checkPin();
  gmWatch(GOOGLE_KEY, () => { checkPin(); void sheetsQueue.retry(); });
  // Allow or decline in another Fidelity tab
  gmWatch(PIN_KEY, () => { checkPin(); void sheetsQueue.retry(); });

  // the accounts of the login that is signed in on this page (here.ts): the API reads ask only for these
  const here = () => accountsHere(storedDataset()?.accounts ?? [], readSidebar(document));
  const readAt = (kind: ReadKind) => oldestRead(readsOf(gmGet<unknown>(READS_KEY, null)), here(), kind);
  const wasRead = (accounts: Account[], kind: ReadKind) => gmSet(READS_KEY, markRead(readsOf(gmGet<unknown>(READS_KEY, null)), accounts, kind, new Date().toISOString()));

  // the daily values for the chart (BalanceHistory): 3Y the first time, then 1M
  const syncHistory = async () => {
    try {
      const stored = storedDataset();
      const mine = here();
      if (!stored || !mine.length) return;
      const seen: Finding[] = [];
      const fresh = await readHistory(mine, stored.history, async (url, body) => { const json = await pagePost(url, body); seen.push(...checkBalanceHistory(json)); return json; });
      report(['balanceHistory'], seen.slice(0, 1));
      const latest = storedDataset() ?? stored;
      gmSet(DATASET_KEY, JSON.stringify({ ...latest, history: mergeHistory(latest.history, fresh), historyAt: new Date().toISOString() }));
      wasRead(mine, 'history');
      const line = `daily values: ${Object.keys(fresh).length} of ${mine.length} accounts`;
      badge.status(`${line} · ${time()}`);
      const saved = await saveSets(['summary']);
      announce(seen.length ? 'error' : 'ok', seen.length ? fidelityChanged([seen[0]!.problem]) : balancesRead(Object.keys(fresh).length, mine.length, saved));
    } catch (err) {
      const line = `daily values: ${err instanceof Error ? err.message : String(err)}`;
      badge.status(`!${line}`);
      announce('error', jobFailed('balances', err));
    }
  };

  // the transactions history: `full` (10 days again) or `recent` (yesterday and today, 👀 in the session)
  const syncTransactions = async (plan: 'full' | 'recent') => {
    try {
      const stored = storedDataset();
      const mine = here();
      if (!stored || !mine.length) return;
      badge.status(`transactions: reading${plan === 'recent' ? ' the last days' : ''}…`);
      const now = new Date();
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const kept = storedTxns();
      const before = kept ?? EMPTY_STORE;
      const { store, failed } = await readTransactions(mine, before, stored.history, today, pagePost, plan === 'recent' ? RECENT_DAYS : OVERLAP_DAYS);
      // nothing new (the usual 👀 read): only its time is kept, not the whole store again (sameTxns). A changed store is
      // stored, and its object stands for the stored string (it is plain JSON data, a parse of the string equals it)
      if (kept && sameTxns(kept, store)) gmSet(TXNS_CHECKED_KEY, store.at);
      else {
        const raw = JSON.stringify(store);
        gmSet(TXNS_KEY, raw);
        txnsMemo.prime(raw, store);
      }
      wasRead(mine, 'txns');
      const added = store.rows.length - before.rows.length;
      const line = `transactions: ${store.rows.length} rows${added > 0 ? `, ${added} new` : ''}${failed.length ? `, ${failed.length} accounts failed` : ''}`;
      badge.status(`${failed.length ? '!' : ''}${line} · ${time()}`);
      // the sheet gets a copy only when its content changed (the prints in writeSets)
      const saved = await saveSets(['transactions']);
      // a recent read speaks only when something came or failed, so 👀 does not ring every 10 minutes for nothing
      if (failed.length) announce('error', transactionsFailed(failed.length));
      else if (plan === 'full' || added > 0) announce('ok', transactionsRead(store.rows.length, added, saved));
    } catch (err) {
      const line = `transactions: ${err instanceof Error ? err.message : String(err)}`;
      badge.status(`!${line}`);
      announce('error', jobFailed('transactions', err));
    }
  };

  // the beta of every held symbol once a day (beta-sync.ts: Fidelity's screeners and price history, reads only). A run
  // that found nothing is tried again at most once an hour in this tab
  let betasTried = 0;
  const syncBetas = async () => {
    if (Date.now() - betasTried < 60 * 60 * 1000 || typeof GM_xmlhttpRequest !== 'function') return;
    betasTried = Date.now();
    try {
      const stored = storedDataset();
      if (!stored || !stored.positions.length) return;
      badge.status('beta: reading…');
      const run = await readBetas(stored, stored.betas, betaRequest(gmFetch(GM_xmlhttpRequest)), new Date());
      report(['betas.stock', 'betas.etf', 'betas.chart'], run.problems);
      // saved when today brought something (or there is nothing to ask): a run that found nothing tries again later
      let saved = false;
      if (run.today || !run.asked) {
        const latest = storedDataset() ?? stored;
        gmSet(DATASET_KEY, JSON.stringify({ ...latest, betas: run.betas, betasAt: new Date().toISOString() }));
        saved = await saveSets(['betas']);
      }
      const line = `beta: ${run.found} of ${run.held}${run.problems.length ? ` (${run.problems.map((p) => p.id).join(', ')} failed)` : ''}`;
      badge.status(`${run.problems.length ? '!' : ''}${line} · ${time()}`);
      announce(run.problems.length ? 'error' : 'ok', run.problems.length ? betasFailed(run.found, run.held, run.problems.map((p) => p.id)) : betasRead(run.found, run.held, saved));
    } catch (err) {
      const line = `beta: ${err instanceof Error ? err.message : String(err)}`;
      badge.status(`!${line}`);
      announce('error', jobFailed('betas', err));
    }
  };

  // the API reads, one after the other when schedule.ts says they are due: on any portfolio page (they need no grid),
  // a few seconds after it opens, after each read of the grid and every 5 minutes while the page stays open
  let dueBusy = false;
  const runDue = async () => {
    if (dueBusy) return;
    // nothing to ask while the page shows no account of the stored copy (another login before its first Positions read)
    if (!here().length) return;
    dueBusy = true;
    try {
      if (historyDue(readAt('history'), new Date())) await syncHistory();
      const plan = txnsPlan(readAt('txns'), new Date(), watching());
      if (plan) await syncTransactions(plan);
      if (betasDue(storedDataset(), new Date())) await syncBetas();
    } finally {
      dueBusy = false;
    }
  };
  setTimeout(() => void runDue(), 3000);
  setInterval(() => void runDue(), DUE_TICK_MS);

  window.addEventListener('message', (e) => {
    if (e.origin !== location.origin || !e.data || e.data.source !== PAGE_TAG) return;
    if (e.data.type === 'error') {
      badge.status(`!page reader: ${String(e.data.message)}`);
      report(['grid.api'], [{ id: 'grid.api', level: 'error', problem: String(e.data.message).slice(0, 200) }]);
      announce('error', jobFailed('page', String(e.data.message)));
      return;
    }
    if (e.data.type !== 'grid' || typeof e.data.json !== 'string') return;
    const now = Date.now();
    const wasAsked = asked || e.data.forced === true;
    const first = lastRead === 0;
    if (!acceptRead({ asked: wasAsked, watching: watching(), now, lastRead })) return;
    lastRead = now;
    asked = false;
    try {
      const rows = JSON.parse(e.data.json) as GridRow[];
      const r = report(['grid.api', 'grid.rowTypes', 'grid.fields', 'grid.dates', 'grid.percents', 'sidebar', 'asOf', 'refresh'], checkGridRows(rows).concat(checkPage(document, onPositions())));
      const broken = r.findings.filter((f) => f.level === 'error');
      if (broken.length) badge.sheets(`!Fidelity changed: ${broken.map((f) => f.id).join(', ')} (details in ⚙️ of the viewer)`);
      const ds = buildDataset({ rows, sidebar: readSidebar(document), asOf: readAsOf(document), builtAt: new Date().toISOString() });
      const merged = mergeDatasets(storedDataset(), ds);
      gmSet(DATASET_KEY, JSON.stringify(merged));
      gmSet(RUN_KEY, JSON.stringify({ status: 'done', at: Date.now(), accounts: merged.accounts.length, positions: merged.positions.length, message: ds.asOf }));
      const line = `read: ${ds.accounts.length} accounts, ${ds.positions.length} positions`;
      badge.status(`${line} · ${time()}${watching() ? ' · watching' : ''}${back}${ds.asOf ? `\n${ds.asOf}` : ''}`);
      const write = sheetsDue({ asked: wasAsked, watching: watching(), now, lastWrite });
      if (write) lastWrite = now;
      // a sync, ⬇ or the first read of a page is a job worth a notice; the reads of 👀 between them (every 30 s) are not
      const told = wasAsked || first;
      void (async () => {
        // a sync that was asked for (the viewer, ⬇) offers every set: the ones with nothing new are skipped by their print,
        // and a tab deleted in the sheet is written again from the script's own copy
        const saved = write ? await saveSets(wasAsked ? ['summary', 'positions', 'transactions', 'betas'] : ['summary', 'positions']) : false;
        if (broken.length) announce('error', fidelityChanged(brokenProblems(r.findings)));
        else if (told) announce('ok', positionsRead(ds.accounts.length, ds.positions.length, saved));
        readDone = true;
      })();
      void runDue();
    } catch (err) {
      const line = `read failed: ${err instanceof Error ? err.message : String(err)}`;
      badge.status(`!${line}`);
      announce('error', jobFailed('positions', err));
      readDone = true;
    }
  });

  // the way back (trip.ts): after the read, once the sheet write and the due reads are done, or after 3 minutes anyway
  if (trip) {
    const timer = setInterval(() => {
      if (!backNow({ trip, now: Date.now(), read: readDone, busy: dueBusy || sheetsQueue.busy() })) return;
      clearInterval(timer);
      gmDelete(TRIP_KEY);
      if (!readDone) announce('error', NO_POSITIONS);
      location.href = trip.from;
    }, 1000);
  }

  // 👀 Watch: every 10 minutes of the session a sync, the same as the viewer's (owner 2026-11-25: "each 10 minutes
  // switch, do and go back"): on Positions the page's own Refresh Positions and a read, elsewhere the round trip
  let refreshTimer: ReturnType<typeof setInterval> | null = null;
  const applyWatch = () => {
    const on = watching();
    badge.watching(on);
    // no jump to Positions and no refresh when a page opens or reloads (owner 2026-11-24); the first sync comes 10
    // minutes after the page opened, only while the market is open (positions do not change otherwise)
    if (on && !refreshTimer) refreshTimer = setInterval(() => { if (marketOpen(new Date())) syncNow(); }, WATCH_REFRESH_MS);
    if (!on && refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
  };
  applyWatch();
  gmWatch(WATCH_KEY, applyWatch);

  // ⬇ Sync in the viewer (and each viewer reload): this tab was opened (or is reused) for it
  const takeCommand = (raw: unknown) => {
    const now = Date.now();
    if (!freshCommand(raw, now)) return;
    gmDelete(COMMAND_KEY);
    // sync commands at least 10 seconds apart (command.ts: a page of the viewer's origin could post them in a loop)
    if (!syncAllowed(gmGet<unknown>(SYNC_AT_KEY, null), now)) { badge.status('sync asked again within 10 seconds: skipped, reload the viewer once more'); return; }
    gmSet(SYNC_AT_KEY, now);
    badge.status('sync asked from the viewer: reading the positions…');
    syncNow();
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
    const step = signinStep(document, login, { ...planSignin(marks, now), flow: inFlow(marks, now) });
    if (step === 'filled-user') gmSet(FLOW_KEY, now);
    if (step === 'filled-pass') {
      if (now - marks.flowAt >= 2 * 60 * 1000) gmSet(FLOW_KEY, now); // one-page form: the password step starts the flow
      gmSet(PASS_KEY, now);
      badge.status('logging in with the saved login…');
    }
    if (step === 'mfa') { notify('fidelity-accounts: enter the code', 'Fidelity asks for a one-time code: type it, reading starts after the login'); badge.status('!type the one-time code: reading starts after the login'); }
    if (step === 'too-soon') badge.status('!an automatic login was tried less than 30 minutes ago: log in yourself (no lockout)');
    // not one password field with a user name (a change-password or reset form?): nothing typed; looked at again each
    // second while the page renders, until the 2 minutes are over
    if (step === 'not-login') badge.status('!this page is not a plain login form (one password field and a username): the saved login is not typed here');
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
  // 🔔 on or off (shared/notice.ts), and each new notice of the Fidelity tab for the popup
  const postNotify = () => post('fidelity-accounts:notify', JSON.stringify({ on: gmGet<boolean>(NOTIFY_KEY, false) === true }));
  // a handed-over spreadsheet that waits for Allow (or was declined) on the Fidelity panel (pin.ts): status only, the tail
  // of the id, so the viewer can say where to confirm. A sheet the Fidelity tab will pin by itself (adopt) does not wait
  const postPin = () => {
    const id = handoffSheet(gmGet<string | null>(GOOGLE_KEY, null));
    const step = pinFor(id);
    post('fidelity-accounts:sheet-pin', JSON.stringify(step === 'ask' || step === 'declined' ? { waiting: step, tail: idTail(id) } : { waiting: null }));
  };
  window.addEventListener('message', (e) => {
    if (e.origin !== location.origin || !e.data) return;
    // the Google token after ☁️ and each silent renew: the Fidelity tab writes the fidelity_* tabs with it, to the pinned
    // spreadsheet only (a page of this origin may post another id: it waits for Allow on Fidelity, pin.ts)
    if (e.data.type === 'fidelity-accounts:google' && typeof e.data.json === 'string') { gmSet(GOOGLE_KEY, e.data.json); postPin(); }
    if (e.data.type === 'fidelity-accounts:command' && e.data.mode === 'sync') gmSet(COMMAND_KEY, JSON.stringify({ mode: 'sync', at: Date.now() }));
    if (e.data.type === 'fidelity-accounts:watch-set' && typeof e.data.on === 'boolean') gmSet(WATCH_KEY, e.data.on);
    if (e.data.type === 'fidelity-accounts:notify-set' && typeof e.data.on === 'boolean') gmSet(NOTIFY_KEY, e.data.on);
    if (e.data.type === 'fidelity-accounts:request') { post('fidelity-accounts:run', gmGet(RUN_KEY, null)); post('fidelity-accounts:contract', gmGet(CONTRACT_KEY, null)); }
    // Full reset in the viewer: the script forgets its copy of the data, the last read and the Google token (the
    // Fidelity login stays: 🔑 on Fidelity manages it). The spreadsheet pin (PIN_KEY) and the time of the last sync command
    // stay too: any page of this origin can post this message, so a reset must not open the way to another sheet. With
    // the prints gone the next handoff cannot be adopted either: the same sheet as the pin writes on, another one asks
    if (e.data.type === 'fidelity-accounts:forget') [DATASET_KEY, RUN_KEY, GOOGLE_KEY, COMMAND_KEY, RESUME_KEY, WATCH_KEY, CONTRACT_KEY, TXNS_KEY, TXNS_CHECKED_KEY, SHEETS_KEY, PRINTS_KEY, TRIP_KEY, NOTIFY_KEY, NOTICE_KEY, READS_KEY].forEach(gmDelete);
    if (e.data.type === 'fidelity-accounts:hello') { post('fidelity-accounts:login', JSON.stringify({ saved: !!gmGet<Login | null>(LOGIN_KEY, null) })); postWatch(); postNotify(); postPin(); }
  });
  // the heartbeat of a viewer on screen (shared/notice.ts): while this tab is visible the Fidelity tab leaves its notices
  // to the popup here and sends no browser notification. Written on load, on each change of visibility and every
  // VIEWER_BEAT_MS; cleared when hidden or left, unless another visible viewer tab wrote it since. Whether a write in
  // pagehide still lands is not checked: if it does not, the heartbeat goes stale in two beats and notifications go out again
  let beat = 0;
  const clearBeat = () => { if (beat && gmGet<unknown>(VIEWER_KEY, null) === beat) gmDelete(VIEWER_KEY); beat = 0; };
  const onScreen = () => {
    if (document.visibilityState !== 'visible') { clearBeat(); return; }
    beat = Date.now();
    gmSet(VIEWER_KEY, beat);
  };
  onScreen();
  document.addEventListener('visibilitychange', onScreen);
  setInterval(() => { if (document.visibilityState === 'visible') onScreen(); }, VIEWER_BEAT_MS);
  window.addEventListener('pagehide', clearBeat);
  // no data crosses this bridge (one way data flow): only the signal that the sheet has new sets, the viewer reads them
  // from the sheet; the run state, the login yes or no, 👀 and the contract report are status, not data
  gmWatch(SHEETS_KEY, (v) => post('fidelity-accounts:sheets', v));
  post('fidelity-accounts:run', gmGet(RUN_KEY, null));
  post('fidelity-accounts:login', JSON.stringify({ saved: !!gmGet<Login | null>(LOGIN_KEY, null) }));
  gmWatch(RUN_KEY, (v) => post('fidelity-accounts:run', v));
  gmWatch(LOGIN_KEY, (v) => post('fidelity-accounts:login', JSON.stringify({ saved: !!v })));
  postWatch();
  gmWatch(WATCH_KEY, postWatch);
  postNotify();
  gmWatch(NOTIFY_KEY, postNotify);
  gmWatch(NOTICE_KEY, (v) => post('fidelity-accounts:notice', v));
  post('fidelity-accounts:contract', gmGet(CONTRACT_KEY, null));
  gmWatch(CONTRACT_KEY, (v) => post('fidelity-accounts:contract', v));
  postPin();
  gmWatch(PIN_KEY, postPin);
  gmWatch(GOOGLE_KEY, postPin);
}

if (location.hostname === 'digital.fidelity.com' && isLoginPage(location.pathname)) onLogin();
else if (location.hostname === 'digital.fidelity.com') onPortfolio();
else onViewer();
