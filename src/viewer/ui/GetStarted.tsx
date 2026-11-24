import { useEffect, useState } from 'react';
import { loadConfig, mask, maskSpreadsheetUrl, parseSpreadsheetId, saveConfig, spreadsheetUrl } from '../../shared/sheets/gis';
import { askSync, dataset, loginSaved, openFidelity, showDemo } from '../app/data';
import { connectGoogle, createSpreadsheet, disconnectGoogle, handOff, loadFromSheets, sheets, writeNow } from '../app/google';
import { TAB_NAMES } from '../../shared/sheets/tabs';
import { t } from '../app/i18n';
import { MaskedField, RevealCopy } from './MaskedField';
import { useStore } from './useStore';

// Get started, the first section of ⚙️ Settings (owner 2026-11-23: no modal windows; settings slide down by themselves
// while something needs setup and show only those steps; once set up the section is squashed and lists every step)
export interface SetupState { clientId: boolean; connected: boolean; spreadsheet: boolean; script: boolean; login: boolean; data: boolean }

export function setupState(userscript: string | null): SetupState {
  const cfg = loadConfig();
  const g = sheets.get();
  const d = dataset.get();
  return {
    clientId: !!cfg.clientId,
    connected: g.connected,
    spreadsheet: !!cfg.spreadsheetId,
    script: !!userscript,
    login: loginSaved.get() === true,
    data: !!d.ds && d.source !== 'demo',
  };
}

// ✕ on settings that opened by themselves holds for this browser session: the next visit opens them again while a step is missing
const LATER_KEY = 'fidelity-accounts-setup-later';
export const laterThisSession = (): void => { try { sessionStorage.setItem(LATER_KEY, '1'); } catch { /* blocked storage */ } };
export const saidLater = (): boolean => { try { return sessionStorage.getItem(LATER_KEY) === '1'; } catch { return false; } };

/** the required steps (the Fidelity login is optional) */
export const setupDone = (s: SetupState): boolean => s.clientId && s.spreadsheet && s.script && s.data;

const CODE = (text: string) => <code className="rounded bg-slate-100 px-1 text-[0.8em] dark:bg-slate-800">{text}</code>;

function Step({ n, title, optional, done, children }: { n: number; title: string; optional?: boolean; done?: boolean; children: React.ReactNode }) {
  return (
    <li className="flex gap-3" data-step={n} data-done={done ? 'yes' : 'no'}>
      <span className={`flex size-7 flex-none items-center justify-center rounded-full text-sm font-semibold ${done ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200'}`}>{done ? '✓' : n}</span>
      <div className="min-w-0 flex-1">
        <div className="font-semibold">{title}{optional && <span className="ml-2 text-xs font-normal text-slate-500">{t('optional')}</span>}</div>
        <div className="mt-1 flex flex-col gap-2 text-sm text-slate-600 dark:text-slate-300">{children}</div>
      </div>
    </li>
  );
}

/** only the steps that still need doing; `all` (once set up): every step, the done ones ticked, to change or redo one */
export function GetStarted({ userscript, onDemo, all = false }: { userscript: string | null; onDemo: () => void; all?: boolean }) {
  const g = useStore(sheets);
  const d = useStore(dataset);
  const login = useStore(loginSaved);
  const [cfg, setCfg] = useState(loadConfig);
  // which steps show is taken from a snapshot, refreshed when something happens (connect, data, script, login) and when
  // a field is left or confirmed: a step must not vanish under the cursor at the first typed character
  const [s, setS] = useState(() => setupState(userscript));
  useEffect(() => { setS(setupState(userscript)); }, [g.connected, d.ds, d.source, login, userscript]);
  const settle = () => setS(setupState(userscript));
  const [showUrl, setShowUrl] = useState(false);
  const change = (p: Partial<typeof cfg>) => { const next = { ...cfg, ...p }; setCfg(next); saveConfig(next); handOff(); };
  const origin = typeof location === 'undefined' ? '' : location.origin;
  const sheetId = parseSpreadsheetId(cfg.spreadsheetId);

  const steps: Array<{ key: string; title: string; optional?: boolean; done?: boolean; body: React.ReactNode }> = [];
  if (all || !s.clientId) steps.push({ key: 'client', done: s.clientId, title: t('Google OAuth Client ID'), body: <>
    <span>{t('In console.cloud.google.com: enable the Google Sheets API, set the OAuth consent screen to External with your email under Test users, then create an OAuth client ID of type Web application with this authorized JavaScript origin:')} {CODE(origin)}</span>
    <span className="text-xs text-slate-500">{t('Already have one from youtube, twitter or mykplan-adp? The same client works: add this origin if it is not there.')}</span>
    <MaskedField label="Google OAuth Client ID" value={cfg.clientId} mask={mask} placeholder="1234567890-abc.apps.googleusercontent.com" onChange={(v) => change({ clientId: v.trim() })} hint={t('Public, no secret. Stored in this browser only.')} />
  </> });
  if (all || !s.connected) steps.push({ key: 'connect', done: s.connected, title: t('Connect Google'), body: <>
    <span>{t('Google asks you to pick your account once; later the page connects by itself.')}</span>
    <div><button type="button" className="btn sm primary" disabled={!cfg.clientId || s.connected} onClick={() => void connectGoogle()}>{t('Connect Google')}</button></div>
  </> });
  if (all || !s.spreadsheet) steps.push({ key: 'sheet', done: s.spreadsheet, title: t('Google Sheet for your Fidelity data'), body: <>
    <span>{t('Create a new spreadsheet in your Google Drive, or paste the link of one you made (the youtube and twitter one is fine: this app writes only its fidelity_* tabs).')}</span>
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" className="btn sm primary" disabled={!s.connected} onClick={() => void createSpreadsheet().then((id) => { if (id) setCfg(loadConfig()); })}>{t('Create a spreadsheet')}</button>
      {sheetId && <a className="masked text-xs underline" href={spreadsheetUrl(sheetId)} target="_blank" rel="noreferrer">{maskSpreadsheetUrl(spreadsheetUrl(sheetId))}</a>}
    </div>
    <MaskedField label={t('Spreadsheet link or ID')} value={cfg.spreadsheetId} mask={(v) => (v.includes('/d/') ? maskSpreadsheetUrl(v) : mask(v))} placeholder="https://docs.google.com/spreadsheets/d/1abc…/edit" onChange={(v) => change({ spreadsheetId: v.trim() })} />
  </> });
  if (all || !s.script) steps.push({ key: 'script', done: s.script, title: t('Tampermonkey and the sync script'), body: <>
    <span>{t('Install Tampermonkey from tampermonkey.net. In Chrome open its extension details: turn on Allow User Scripts and give it site access to digital.fidelity.com and {host}. Then open the script and press Install, and reload this page.', { host: typeof location === 'undefined' ? '' : location.hostname })}</span>
    <div className="flex flex-wrap gap-2">
      <a className="btn sm" href="https://www.tampermonkey.net/" target="_blank" rel="noreferrer">Tampermonkey</a>
      <a className={`btn sm ${s.script ? '' : 'primary'}`} href="./fidelity-accounts-sync.user.js" data-install-script>{s.script ? t('Reinstall') : t('Install the script')}</a>
    </div>
  </> });
  if (all || (s.script && !s.login)) steps.push({ key: 'login', optional: true, done: s.login, title: t('Fidelity login in the script'), body: <>
    <span>{t('Open Fidelity: the script shows a small panel in the corner. Press 🔑 there and save your username and password: they stay in Tampermonkey storage only, and the script logs in by itself when Fidelity asks (a one-time code you type yourself). Skip it to log in yourself.')}</span>
    <div><button type="button" className="btn sm" onClick={openFidelity}>{t('Open Fidelity')}</button></div>
  </> });
  if (all || !s.data) steps.push({ key: 'sync', done: s.data, title: t('First sync'), body: <>
    <span>{t('Press ⬇ Sync (here or in the navbar): Fidelity opens on Positions, the script reads it and the data appears here and in your sheet.')}</span>
    <div className="flex flex-wrap gap-2">
      <button type="button" className="btn sm primary" disabled={!s.script} onClick={askSync}>⬇ {t('Sync')}</button>
      <button type="button" className="btn sm" onClick={() => { showDemo(); onDemo(); }}>{t('Look around with demo data')}</button>
    </div>
  </> });

  const sheetUrl = sheetId ? spreadsheetUrl(sheetId) : '';
  // Google Sheets is part of Get started (owner 2026-11-23): the connection, the sheet link and its actions
  const sheetsBox = (cfg.clientId || s.connected) && (
    <div className={`rounded-xl border p-3 ${g.connected ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-900/20' : 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/40'}`} data-sheets-box>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="font-medium">{g.connected ? t('Connected to Google Sheets') : t('Not connected to Google Sheets')}</div>
          <div className="text-xs text-slate-500">{TAB_NAMES.join(', ')}</div>
          {sheetUrl && (
            <div className="mt-1 flex min-w-0 items-center gap-2">
              <a className="masked min-w-0 break-all text-xs underline" href={sheetUrl} target="_blank" rel="noreferrer">{showUrl ? sheetUrl : maskSpreadsheetUrl(sheetUrl)}</a>
              <RevealCopy label={t('spreadsheet link')} value={sheetUrl} shown={showUrl} onToggle={() => setShowUrl((v) => !v)} />
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {g.connected
            ? <button type="button" className="btn sm danger" disabled={g.busy} onClick={disconnectGoogle}>{t('Disconnect')}</button>
            : <button type="button" className="btn sm primary" disabled={g.busy || !cfg.clientId} onClick={() => void connectGoogle()}>{t('Connect Google')}</button>}
          <button type="button" className="btn sm" disabled={!d.ds || d.source === 'demo' || !g.connected || g.busy || !cfg.spreadsheetId} onClick={() => d.ds && void writeNow(d.ds)}>{t('Write now')}</button>
          <button type="button" className="btn sm" disabled={!g.connected || g.busy || !cfg.spreadsheetId} onClick={() => void loadFromSheets()}>↻ {t('Load from the sheet')}</button>
        </div>
      </div>
      {g.error && <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">{t('Last error: {error}', { error: g.error })}</p>}
      {g.log.length > 0 && <pre className="mt-2 max-h-28 overflow-auto whitespace-pre-wrap text-xs text-slate-500">{g.log.slice(-6).join('\n')}</pre>}
    </div>
  );

  return (
    <div className="flex flex-col gap-4" data-get-started onBlur={settle} onKeyDown={(e) => { if (e.key === 'Enter') settle(); }}>
      {steps.length ? (
        <>
          <p className="text-sm text-slate-600 dark:text-slate-300">{all ? t('The setup steps; the ticked ones are done.') : t('Your Fidelity data stays yours: a Tampermonkey script reads the Positions page in your own logged-in browser (read only) and puts it into your own Google Sheet. Nothing goes anywhere else. What still needs setup:')}</p>
          {all && sheetsBox}
          <ol className="grid gap-5 lg:grid-cols-2">
            {steps.map((st, i) => <Step key={st.key} n={i + 1} title={st.title} optional={st.optional} done={all && st.done}>{st.body}</Step>)}
          </ol>
          {!all && sheetsBox}
        </>
      ) : <p className="text-sm text-slate-600 dark:text-slate-300">{t('All set: Sync whenever you want fresh numbers.')}</p>}
    </div>
  );
}
