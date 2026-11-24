import { useEffect, useState } from 'react';
import { loadConfig, mask, maskSpreadsheetUrl, parseSpreadsheetId, saveConfig, spreadsheetUrl } from '../../shared/sheets/gis';
import { askSync, dataset, loginSaved, openFidelity, showDemo } from '../app/data';
import { connectGoogle, createSpreadsheet, handOff, sheets } from '../app/google';
import { t } from '../app/i18n';
import { MaskedField } from './MaskedField';
import { useStore } from './useStore';

// Setup panel (owner 2026-11-23: no modal windows, a panel that slides down from the navbar showing only what still
// needs setup): each step disappears by itself once done. It opens on load while a required step is missing, closes
// by itself when they are all done, and 🚀 in the navbar opens it any time
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

// ✕ holds for this browser session only: the next visit opens the panel again while a step is missing
const LATER_KEY = 'fidelity-accounts-setup-later';
export const laterThisSession = (): void => { try { sessionStorage.setItem(LATER_KEY, '1'); } catch { /* blocked storage */ } };
export const saidLater = (): boolean => { try { return sessionStorage.getItem(LATER_KEY) === '1'; } catch { return false; } };

/** the required steps (the Fidelity login is optional) */
export const setupDone = (s: SetupState): boolean => s.clientId && s.spreadsheet && s.script && s.data;

const CODE = (text: string) => <code className="rounded bg-slate-100 px-1 text-[0.8em] dark:bg-slate-800">{text}</code>;

function Step({ n, title, optional, children }: { n: number; title: string; optional?: boolean; children: React.ReactNode }) {
  return (
    <li className="flex gap-3" data-step={n}>
      <span className="flex size-7 flex-none items-center justify-center rounded-full bg-slate-200 text-sm font-semibold text-slate-700 dark:bg-slate-700 dark:text-slate-200">{n}</span>
      <div className="min-w-0 flex-1">
        <div className="font-semibold">{title}{optional && <span className="ml-2 text-xs font-normal text-slate-500">{t('optional')}</span>}</div>
        <div className="mt-1 flex flex-col gap-2 text-sm text-slate-600 dark:text-slate-300">{children}</div>
      </div>
    </li>
  );
}

/** the content of the 🚀 slide-down panel: only the steps that still need doing */
export function GetStarted({ userscript, onDemo }: { userscript: string | null; onDemo: () => void }) {
  const g = useStore(sheets);
  const d = useStore(dataset);
  const login = useStore(loginSaved);
  const [cfg, setCfg] = useState(loadConfig);
  // which steps show is taken from a snapshot, refreshed when something happens (connect, data, script, login) and when
  // a field is left or confirmed: a step must not vanish under the cursor at the first typed character
  const [s, setS] = useState(() => setupState(userscript));
  useEffect(() => { setS(setupState(userscript)); }, [g.connected, d.ds, d.source, login, userscript]);
  const settle = () => setS(setupState(userscript));
  const change = (p: Partial<typeof cfg>) => { const next = { ...cfg, ...p }; setCfg(next); saveConfig(next); handOff(); };
  const origin = typeof location === 'undefined' ? '' : location.origin;
  const sheetId = parseSpreadsheetId(cfg.spreadsheetId);

  const steps: Array<{ key: string; title: string; optional?: boolean; body: React.ReactNode }> = [];
  if (!s.clientId) steps.push({ key: 'client', title: t('Google OAuth Client ID'), body: <>
    <span>{t('In console.cloud.google.com: enable the Google Sheets API, set the OAuth consent screen to External with your email under Test users, then create an OAuth client ID of type Web application with this authorized JavaScript origin:')} {CODE(origin)}</span>
    <span className="text-xs text-slate-500">{t('Already have one from youtube, twitter or mykplan-adp? The same client works: add this origin if it is not there.')}</span>
    <MaskedField label="Google OAuth Client ID" value={cfg.clientId} mask={mask} placeholder="1234567890-abc.apps.googleusercontent.com" onChange={(v) => change({ clientId: v.trim() })} hint={t('Public, no secret. Stored in this browser only.')} />
  </> });
  if (!s.connected) steps.push({ key: 'connect', title: t('Connect Google'), body: <>
    <span>{t('Google asks you to pick your account once; later the page connects by itself.')}</span>
    <div><button type="button" className="btn sm primary" disabled={!cfg.clientId} onClick={() => void connectGoogle()}>{t('Connect Google')}</button></div>
  </> });
  if (!s.spreadsheet) steps.push({ key: 'sheet', title: t('Google Sheet for your Fidelity data'), body: <>
    <span>{t('Create a new spreadsheet in your Google Drive, or paste the link of one you made (the youtube and twitter one is fine: this app writes only its fidelity_* tabs).')}</span>
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" className="btn sm primary" disabled={!s.connected} onClick={() => void createSpreadsheet().then((id) => { if (id) setCfg(loadConfig()); })}>{t('Create a spreadsheet')}</button>
      {sheetId && <a className="masked text-xs underline" href={spreadsheetUrl(sheetId)} target="_blank" rel="noreferrer">{maskSpreadsheetUrl(spreadsheetUrl(sheetId))}</a>}
    </div>
    <MaskedField label={t('Spreadsheet link or ID')} value={cfg.spreadsheetId} mask={(v) => (v.includes('/d/') ? maskSpreadsheetUrl(v) : mask(v))} placeholder="https://docs.google.com/spreadsheets/d/1abc…/edit" onChange={(v) => change({ spreadsheetId: v.trim() })} />
  </> });
  if (!s.script) steps.push({ key: 'script', title: t('Tampermonkey and the sync script'), body: <>
    <span>{t('Install Tampermonkey from tampermonkey.net. In Chrome open its extension details: turn on Allow User Scripts and give it site access to digital.fidelity.com and {host}. Then open the script and press Install, and reload this page.', { host: typeof location === 'undefined' ? '' : location.hostname })}</span>
    <div className="flex flex-wrap gap-2">
      <a className="btn sm" href="https://www.tampermonkey.net/" target="_blank" rel="noreferrer">Tampermonkey</a>
      <a className="btn sm primary" href="./fidelity-accounts-sync.user.js" data-install-script>{t('Install the script')}</a>
    </div>
  </> });
  if (s.script && !s.login) steps.push({ key: 'login', optional: true, title: t('Fidelity login in the script'), body: <>
    <span>{t('Open Fidelity: the script shows a small panel in the corner. Press 🔑 there and save your username and password: they stay in Tampermonkey storage only, and the script logs in by itself when Fidelity asks (a one-time code you type yourself). Skip it to log in yourself.')}</span>
    <div><button type="button" className="btn sm" onClick={openFidelity}>{t('Open Fidelity')}</button></div>
  </> });
  if (!s.data) steps.push({ key: 'sync', title: t('First sync'), body: <>
    <span>{t('Press ⬇ Sync (here or in the navbar): Fidelity opens on Positions, the script reads it and the data appears here and in your sheet.')}</span>
    <div className="flex flex-wrap gap-2">
      <button type="button" className="btn sm primary" disabled={!s.script} onClick={askSync}>⬇ {t('Sync')}</button>
      <button type="button" className="btn sm" onClick={() => { showDemo(); onDemo(); }}>{t('Look around with demo data')}</button>
    </div>
  </> });

  return (
    <div className="flex flex-col gap-4" data-get-started onBlur={settle} onKeyDown={(e) => { if (e.key === 'Enter') settle(); }}>
      {steps.length ? (
        <>
          <p className="text-sm text-slate-600 dark:text-slate-300">{t('Your Fidelity data stays yours: a Tampermonkey script reads the Positions page in your own logged-in browser (read only) and puts it into your own Google Sheet. Nothing goes anywhere else. What still needs setup:')}</p>
          <ol className="grid gap-5 lg:grid-cols-2">
            {steps.map((st, i) => <Step key={st.key} n={i + 1} title={st.title} optional={st.optional}>{st.body}</Step>)}
          </ol>
        </>
      ) : <p className="text-sm text-slate-600 dark:text-slate-300">{t('All set: Sync whenever you want fresh numbers.')}</p>}
    </div>
  );
}
