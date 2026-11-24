import { useRef, useState } from 'react';
import { loadConfig, mask, maskSpreadsheetUrl, parseSpreadsheetId, saveConfig, spreadsheetUrl } from '../../shared/sheets/gis';
import { TAB_NAMES } from '../../shared/sheets/tabs';
import { clearDemo, dataset, importFile, loginSaved, openFidelity, showDemo } from '../app/data';
import { connectGoogle, disconnectGoogle, handOff, loadFromSheets, sheets, writeNow } from '../app/google';
import { t } from '../app/i18n';
import { resetPrefs } from '../app/prefs';
import { APP_VERSION, isOlder } from '../app/version';
import { GetStarted } from './GetStarted';
import { MaskedField, RevealCopy } from './MaskedField';
import { useStore } from './useStore';

const H = ({ children }: { children: React.ReactNode }) => <h3 className="text-sm font-semibold">{children}</h3>;

// ⚙️ Settings (slides down under the navbar): data source, Google Sheets, the script, the view reset
export function SettingsPanel({ userscript, onDemo }: { userscript: string | null; onDemo: () => void }) {
  const file = useRef<HTMLInputElement>(null);
  const [cfg, setCfg] = useState(loadConfig);
  const [showUrl, setShowUrl] = useState(false);
  const g = useStore(sheets);
  const { ds, source } = useStore(dataset);
  const login = useStore(loginSaved);
  const change = (p: Partial<typeof cfg>) => { const next = { ...cfg, ...p }; setCfg(next); saveConfig(next); handOff(); };
  const sheetId = parseSpreadsheetId(cfg.spreadsheetId);
  const sheetUrl = sheetId ? spreadsheetUrl(sheetId) : '';
  const sourceName: Record<string, string> = { userscript: t('the script'), sheets: t('Google Sheets'), import: t('a JSON file'), cache: t('this browser'), demo: t('demo data') };

  return (
    <div className="grid gap-6 text-sm lg:grid-cols-2">
      <div className="flex min-w-0 flex-col gap-3">
        <H>{t('Data')}</H>
        <p>{t('Source: {source}', { source: source ? sourceName[source] ?? source : t('none yet') })}{ds ? ` · ${t('read {at}', { at: ds.builtAt.slice(0, 16).replace('T', ' ') })}` : ''}{ds?.asOf && source !== 'demo' ? ` · ${ds.asOf}` : ''}</p>
        <div className="flex flex-wrap items-center gap-2">
          <span>{t('Script')}: {userscript ? <b>{userscript}</b> : t('not seen on this page')}</span>
          <a className={`btn sm ${!userscript || isOlder(userscript, APP_VERSION) ? 'primary' : ''}`} href="./fidelity-accounts-sync.user.js" data-install-script>
            {!userscript ? t('Install the script') : isOlder(userscript, APP_VERSION) ? t('Update to {version}', { version: APP_VERSION }) : t('Reinstall')}
          </a>
          <span>{t('Fidelity login in the script')}: <b>{login === null ? '—' : login ? t('saved') : t('not saved')}</b></span>
          <button type="button" className="btn sm" onClick={openFidelity}>{t('Open Fidelity')}</button>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn sm" onClick={() => file.current?.click()}>{t('Import JSON')}</button>
          {source === 'demo' ? <button type="button" className="btn sm" onClick={clearDemo}>{t('Hide demo')}</button> : <button type="button" className="btn sm" onClick={showDemo}>{t('Show demo data')}</button>}
          <button type="button" className="btn sm danger" onClick={resetPrefs} title={t('Selected account, tab, sort, columns, theme and language back to their defaults')}>{t('Reset view')}</button>
          <input ref={file} type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void importFile(f); }} />
        </div>
        <p className="text-xs text-amber-700 dark:text-amber-300">{t('Read only: the script never trades, transfers or changes anything on Fidelity; it reads the Positions page you can see yourself.')}</p>
      </div>

      <div className="flex min-w-0 flex-col gap-3">
        <H>{t('Google Sheets (tabs {tabs})', { tabs: TAB_NAMES.join(', ') })}</H>
        <div className={`rounded-xl border p-3 ${g.connected ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-900/20' : 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/40'}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="font-medium">{g.connected ? t('Connected to Google Sheets') : t('Not connected to Google Sheets')}</div>
              {sheetUrl && (
                <div className="mt-1 flex items-center gap-2">
                  <a className="masked break-all text-xs underline" href={sheetUrl} target="_blank" rel="noreferrer">{showUrl ? sheetUrl : maskSpreadsheetUrl(sheetUrl)}</a>
                  <RevealCopy label={t('spreadsheet link')} value={sheetUrl} shown={showUrl} onToggle={() => setShowUrl((v) => !v)} />
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {g.connected
                ? <button type="button" className="btn sm danger" disabled={g.busy} onClick={disconnectGoogle}>{t('Disconnect')}</button>
                : <button type="button" className="btn sm primary" disabled={g.busy || !cfg.clientId} onClick={() => void connectGoogle()}>{t('Connect Google')}</button>}
              <button type="button" className="btn sm" disabled={!ds || source === 'demo' || !g.connected || g.busy} onClick={() => ds && void writeNow(ds)}>{t('Write now')}</button>
              <button type="button" className="btn sm" disabled={!g.connected || g.busy} onClick={() => void loadFromSheets()}>↻ {t('Load from the sheet')}</button>
            </div>
          </div>
        </div>
        <MaskedField label="Google OAuth Client ID" value={cfg.clientId} mask={mask} placeholder="1234567890-abc.apps.googleusercontent.com" onChange={(v) => change({ clientId: v.trim() })} hint={t('Public, no secret. Stored in this browser only.')} />
        <MaskedField label={t('Spreadsheet link or ID')} value={cfg.spreadsheetId} mask={(v) => (v.includes('/d/') ? maskSpreadsheetUrl(v) : mask(v))} placeholder="https://docs.google.com/spreadsheets/d/1abc…/edit" onChange={(v) => change({ spreadsheetId: v.trim() })} />
        {g.error && <p className="text-xs text-rose-600 dark:text-rose-400">{t('Last error: {error}', { error: g.error })}</p>}
        <pre className="max-h-32 overflow-auto whitespace-pre-wrap text-xs text-slate-500">{g.log.slice(-8).join('\n')}</pre>
      </div>
      {/* once set up, Get started lives here and slides open on a click (owner 2026-11-23) */}
      <details className="setup rounded-xl border border-slate-200 dark:border-slate-700 lg:col-span-2" data-settings-get-started>
        <summary className="px-4 py-3 text-sm font-semibold"><span className="chev">▸</span> 🚀 {t('Get started')}</summary>
        <div className="px-4 pb-4"><GetStarted userscript={userscript} onDemo={onDemo} all /></div>
      </details>
    </div>
  );
}
