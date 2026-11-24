import { useState } from 'react';
import { loadConfig, mask, maskSpreadsheetUrl, parseSpreadsheetId, saveConfig, spreadsheetUrl } from '../../shared/sheets/gis';
import { askSync, dataset, loginSaved, openFidelity, showDemo } from '../app/data';
import { connectGoogle, createSpreadsheet, handOff, sheets } from '../app/google';
import { t } from '../app/i18n';
import { MaskedField } from './MaskedField';
import { useStore } from './useStore';

// The first-run window (owner 2026-11-23): the steps that make everything work, each ticked by itself as soon as it
// is done. It opens on load while a required step is missing and can be opened again from 🚀 in the navbar
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

// "Later" holds for this browser session only: the next visit opens the window again while a step is missing
const LATER_KEY = 'fidelity-accounts-setup-later';
export const laterThisSession = (): void => { try { sessionStorage.setItem(LATER_KEY, '1'); } catch { /* blocked storage */ } };
export const saidLater = (): boolean => { try { return sessionStorage.getItem(LATER_KEY) === '1'; } catch { return false; } };

/** the required steps (the Fidelity login is optional) */
export const setupDone = (s: SetupState): boolean => s.clientId && s.spreadsheet && s.script && s.data;

const CODE = (text: string) => <code className="rounded bg-slate-100 px-1 text-[0.8em] dark:bg-slate-800">{text}</code>;

function Step({ n, done, title, optional, children }: { n: number; done: boolean; title: string; optional?: boolean; children: React.ReactNode }) {
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

export function GetStarted({ userscript, onClose }: { userscript: string | null; onClose: () => void }) {
  useStore(sheets);
  useStore(dataset);
  useStore(loginSaved);
  const [cfg, setCfg] = useState(loadConfig);
  const s = setupState(userscript);
  const change = (p: Partial<typeof cfg>) => { const next = { ...cfg, ...p }; setCfg(next); saveConfig(next); handOff(); };
  const origin = typeof location === 'undefined' ? '' : location.origin;
  const sheetId = parseSpreadsheetId(cfg.spreadsheetId);
  const close = () => { laterThisSession(); onClose(); };

  return (
    <div className="modal-back" role="dialog" aria-modal="true" aria-label={t('Get started')} onClick={(e) => { if (e.target === e.currentTarget) close(); }} data-get-started>
      <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        <div className="panel-head rounded-t-2xl">
          <h2 className="text-base font-semibold">🚀 {t('Get started')}</h2>
          <button type="button" className="tb" title={t('Close')} onClick={close}>✕</button>
        </div>
        <div className="flex flex-col gap-4 p-5">
          <p className="text-sm text-slate-600 dark:text-slate-300">{t('Your Fidelity data stays yours: a Tampermonkey script reads the Positions page in your own logged-in browser (read only) and puts it into your own Google Sheet. Nothing goes anywhere else. A few steps, once:')}</p>
          <ol className="flex flex-col gap-5">
            <Step n={1} done={s.clientId} title={t('Google OAuth Client ID')}>
              <span>{t('In console.cloud.google.com: enable the Google Sheets API, set the OAuth consent screen to External with your email under Test users, then create an OAuth client ID of type Web application with this authorized JavaScript origin:')} {CODE(origin)}</span>
              <span className="text-xs text-slate-500">{t('Already have one from youtube, twitter or mykplan-adp? The same client works: add this origin if it is not there.')}</span>
              <MaskedField label="Google OAuth Client ID" value={cfg.clientId} mask={mask} placeholder="1234567890-abc.apps.googleusercontent.com" onChange={(v) => change({ clientId: v.trim() })} hint={t('Public, no secret. Stored in this browser only.')} />
            </Step>
            <Step n={2} done={s.connected} title={t('Connect Google')}>
              <span>{t('Google asks you to pick your account once; later the page connects by itself.')}</span>
              <div><button type="button" className="btn sm primary" disabled={!cfg.clientId || s.connected} onClick={() => void connectGoogle()}>{s.connected ? t('Connected') : t('Connect Google')}</button></div>
            </Step>
            <Step n={3} done={s.spreadsheet} title={t('Google Sheet for your Fidelity data')}>
              <span>{t('Create a new spreadsheet in your Google Drive, or paste the link of one you made (the youtube and twitter one is fine: this app writes only its fidelity_* tabs).')}</span>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" className="btn sm primary" disabled={!s.connected || s.spreadsheet} onClick={() => void createSpreadsheet().then((id) => { if (id) setCfg(loadConfig()); })}>{t('Create a spreadsheet')}</button>
                {sheetId && <a className="masked text-xs underline" href={spreadsheetUrl(sheetId)} target="_blank" rel="noreferrer">{maskSpreadsheetUrl(spreadsheetUrl(sheetId))}</a>}
              </div>
              <MaskedField label={t('Spreadsheet link or ID')} value={cfg.spreadsheetId} mask={(v) => (v.includes('/d/') ? maskSpreadsheetUrl(v) : mask(v))} placeholder="https://docs.google.com/spreadsheets/d/1abc…/edit" onChange={(v) => change({ spreadsheetId: v.trim() })} />
            </Step>
            <Step n={4} done={s.script} title={t('Tampermonkey and the sync script')}>
              <span>{t('Install Tampermonkey from tampermonkey.net. In Chrome open its extension details: turn on Allow User Scripts and give it site access to digital.fidelity.com and {host}. Then open the script and press Install, and reload this page.', { host: typeof location === 'undefined' ? '' : location.hostname })}</span>
              <div className="flex flex-wrap gap-2">
                <a className="btn sm" href="https://www.tampermonkey.net/" target="_blank" rel="noreferrer">Tampermonkey</a>
                <a className={`btn sm ${s.script ? '' : 'primary'}`} href="./fidelity-accounts-sync.user.js" data-install-script>{s.script ? t('Installed {version}: reinstall', { version: userscript ?? '' }) : t('Install the script')}</a>
              </div>
            </Step>
            <Step n={5} done={s.login} optional title={t('Fidelity login in the script')}>
              <span>{t('Open Fidelity: the script shows a small panel in the corner. Press 🔑 there and save your username and password: they stay in Tampermonkey storage only, and the script logs in by itself when Fidelity asks (a one-time code you type yourself). Skip it to log in yourself.')}</span>
              <div><button type="button" className="btn sm" onClick={openFidelity}>{t('Open Fidelity')}</button></div>
            </Step>
            <Step n={6} done={s.data} title={t('First sync')}>
              <span>{t('Press ⬇ Sync (here or in the navbar): Fidelity opens on Positions, the script reads it and the data appears here and in your sheet.')}</span>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn sm primary" disabled={!s.script} onClick={askSync}>⬇ {t('Sync')}</button>
                <button type="button" className="btn sm" onClick={() => { showDemo(); close(); }}>{t('Look around with demo data')}</button>
              </div>
            </Step>
          </ol>
          <div className="flex items-center justify-between gap-3 border-t border-slate-200 pt-4 dark:border-slate-700">
            <span className="text-xs text-slate-500">{setupDone(s) ? t('All set: Sync whenever you want fresh numbers.') : t('This window opens by itself until the steps are done; 🚀 in the navbar opens it any time.')}</span>
            <button type="button" className="btn sm" onClick={close}>{setupDone(s) ? t('Done') : t('Later')}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
