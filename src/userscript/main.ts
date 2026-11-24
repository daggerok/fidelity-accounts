/// <reference lib="esnext" />
// One bundle, three roles picked by the address: the Fidelity portfolio pages (read the positions), the Fidelity
// login page (optional automatic login) and the viewer (bridge to the page). READ ONLY on Fidelity: the script never
// clicks or submits anything there except the login form with the owner's saved login
import { buildDataset, type GridRow } from '../shared/parse';
import { mergeDatasets, parseDataset, type Dataset } from '../shared/model';
import { mountBadge, type Badge } from './badge';
import { COMMAND_KEY, freshCommand } from './command';
import { DATASET_KEY, RUN_KEY, gmDelete, gmGet, gmSet, gmWatch, notify } from './gm';
import { POSITIONS_URL } from './header';
import { PAGE_TAG, askGrid, injectPageReader } from './inject';
import { readAsOf, readSidebar } from './read';
import { GOOGLE_KEY, gmFetch, usableHandoff, writeFromUserscript } from './sheets-gm';
import { isLoginPage, passwordRefused, planSignin, signinStep, type Login } from './signin';

declare const GM_xmlhttpRequest: Parameters<typeof gmFetch>[0] | undefined;
declare const __VERSION__: string;
const VERSION = typeof __VERSION__ === 'string' ? __VERSION__ : 'dev';

// Tampermonkey storage keys (this script only)
const LOGIN_KEY = 'fidelity-accounts.login'; // { user, pass }: never leaves Tampermonkey storage
const AUTO_KEY = 'fidelity-accounts.autoLogin'; // log in whenever the login page opens (default on, owner 2026-11-23)
const RESUME_KEY = 'fidelity-accounts.resume'; // { at }: a sync asked while logged out, go to Positions after the login
const FLOW_KEY = 'fidelity-accounts.loginFlowAt';
const PASS_KEY = 'fidelity-accounts.loginPassAt';
const REFUSED_KEY = 'fidelity-accounts.loginRefusedAt'; // the saved password was refused: no auto login until 🔑 Save
const RESUME_MAX_AGE_MS = 30 * 60 * 1000;
// quotes on the page update by themselves: a read nobody asked for is taken at most once per 10 minutes
const AUTO_READ_GAP_MS = 10 * 60 * 1000;

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
  const goPositions = () => { if (onPositions()) askGrid(); else location.href = POSITIONS_URL; };
  const badge: Badge = mountBadge(VERSION, (a) => {
    if (a === 'read') { badge.status('reading the positions…'); goPositions(); }
    if (a === 'json') { const saved = gmGet<string | null>(DATASET_KEY, null); if (saved) download(`fidelity-accounts-${new Date().toISOString().slice(0, 10)}.json`, saved); }
  }, loginHooks());
  const how = injectPageReader();
  badge.status(how === 'failed' ? '!could not start the page reader (Tampermonkey: allow GM_addElement)' : onPositions() ? 'waiting for the positions table…' : 'open Positions (or press ⬇): the script reads it by itself');

  // the fidelity_* tabs are written from here after every read with the token the viewer handed over; without one
  // the data waits and the viewer writes it when it is open and connected. One write at a time, the newest wins
  let writing = false;
  let pending: Dataset | null = null;
  const writeSheets = async (first: Dataset) => {
    if (writing) { pending = first; return; }
    writing = true;
    let ds: Dataset | null = first;
    while (ds) {
      pending = null;
      const g = usableHandoff(gmGet<string | null>(GOOGLE_KEY, null), Date.now());
      if (!g || typeof GM_xmlhttpRequest !== 'function') badge.sheets('sheets: waiting for ☁️ in the viewer (it writes when open)');
      else {
        try {
          await writeFromUserscript(ds, g, gmFetch(GM_xmlhttpRequest), () => {});
          badge.sheets(`sheets: written ${time()}`);
        } catch (err) {
          badge.sheets(`sheets: ${err instanceof Error ? err.message : String(err)}`.slice(0, 200));
        }
      }
      ds = pending;
    }
    writing = false;
  };

  window.addEventListener('message', (e) => {
    if (e.origin !== location.origin || !e.data || e.data.source !== PAGE_TAG) return;
    if (e.data.type === 'error') { badge.status(`!page reader: ${String(e.data.message)}`); return; }
    if (e.data.type !== 'grid' || typeof e.data.json !== 'string') return;
    if (!e.data.forced && Date.now() - lastRead < AUTO_READ_GAP_MS) return;
    lastRead = Date.now();
    try {
      const rows = JSON.parse(e.data.json) as GridRow[];
      const ds = buildDataset({ rows, sidebar: readSidebar(document), asOf: readAsOf(document), builtAt: new Date().toISOString() });
      const merged = mergeDatasets(parseDataset(gmGet<string>(DATASET_KEY, '')), ds);
      gmSet(DATASET_KEY, JSON.stringify(merged));
      gmSet(RUN_KEY, JSON.stringify({ status: 'done', at: Date.now(), accounts: merged.accounts.length, positions: merged.positions.length, message: ds.asOf }));
      badge.status(`read: ${ds.accounts.length} accounts, ${ds.positions.length} positions · ${time()}${ds.asOf ? `\n${ds.asOf}` : ''}`);
      void writeSheets(merged);
    } catch (err) {
      badge.status(`!read failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  });

  // ⬇ Sync in the viewer: this tab was opened (or is reused) for it
  const takeCommand = (raw: unknown) => {
    if (!freshCommand(raw, Date.now())) return;
    gmDelete(COMMAND_KEY);
    badge.status('sync asked from the viewer: reading the positions…');
    goPositions();
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
  window.addEventListener('message', (e) => {
    if (e.origin !== location.origin || !e.data) return;
    // the Google token after ☁️ and each silent renew: the Fidelity tab writes the fidelity_* tabs with it
    if (e.data.type === 'fidelity-accounts:google' && typeof e.data.json === 'string') gmSet(GOOGLE_KEY, e.data.json);
    if (e.data.type === 'fidelity-accounts:command' && e.data.mode === 'sync') gmSet(COMMAND_KEY, JSON.stringify({ mode: 'sync', at: Date.now() }));
    if (e.data.type === 'fidelity-accounts:request') { post('fidelity-accounts:dataset', gmGet(DATASET_KEY, null)); post('fidelity-accounts:run', gmGet(RUN_KEY, null)); }
    if (e.data.type === 'fidelity-accounts:hello') post('fidelity-accounts:login', JSON.stringify({ saved: !!gmGet<Login | null>(LOGIN_KEY, null) }));
  });
  post('fidelity-accounts:dataset', gmGet(DATASET_KEY, null));
  post('fidelity-accounts:run', gmGet(RUN_KEY, null));
  post('fidelity-accounts:login', JSON.stringify({ saved: !!gmGet<Login | null>(LOGIN_KEY, null) }));
  gmWatch(DATASET_KEY, (v) => post('fidelity-accounts:dataset', v));
  gmWatch(RUN_KEY, (v) => post('fidelity-accounts:run', v));
  gmWatch(LOGIN_KEY, (v) => post('fidelity-accounts:login', JSON.stringify({ saved: !!v })));
}

if (location.hostname === 'digital.fidelity.com' && isLoginPage(location.pathname)) onLogin();
else if (location.hostname === 'digital.fidelity.com') onPortfolio();
else onViewer();
