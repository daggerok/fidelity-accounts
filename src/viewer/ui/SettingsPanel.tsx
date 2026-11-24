import { useEffect, useRef, useState } from 'react';
import { clearDemo, dataset, importFile, loginSaved, openFidelity, showDemo } from '../app/data';
import { t } from '../app/i18n';
import { resetView } from '../app/prefs';
import { fullReset } from '../app/reset';
import { APP_VERSION, isOlder } from '../app/version';
import { GetStarted } from './GetStarted';
import { Section } from './Section';
import { useStore } from './useStore';

// ⚙️ Settings (slide down under the navbar): Get started on top (with Google Sheets, owner 2026-11-23), then Data; each
// a section whose header slides it open and shut
export function SettingsPanel({ userscript, done, expand, onDemo }: { userscript: string | null; done: boolean; expand: number; onDemo: () => void }) {
  // Get started on top: expanded while something needs setup, squashed once done; its header toggles it (owner 2026-11-23)
  const [setupOpen, setSetupOpen] = useState(!done);
  useEffect(() => { setSetupOpen(!done); }, [done]);
  useEffect(() => { if (expand) setSetupOpen(true); }, [expand]);
  const [dataOpen, setDataOpen] = useState(true);
  const file = useRef<HTMLInputElement>(null);
  const { ds, source } = useStore(dataset);
  const login = useStore(loginSaved);
  // Full reset is off by default and needs its own switch first (owner 2026-11-23); Reset view always works
  const [fullOn, setFullOn] = useState(false);
  const sourceName: Record<string, string> = { userscript: t('the script'), sheets: t('Google Sheets'), import: t('a JSON file'), cache: t('this browser'), demo: t('demo data') };

  return (
    <div className="flex flex-col gap-6 text-sm">
    <Section id="get-started" title={`🚀 ${t('Get started')}`} note={done ? t('all set') : t('needs setup')} open={setupOpen} onToggle={() => setSetupOpen((v) => !v)}>
      <GetStarted userscript={userscript} onDemo={onDemo} all={done} />
    </Section>
    <Section id="data" title={t('Data')} open={dataOpen} onToggle={() => setDataOpen((v) => !v)}>
      <div className="flex min-w-0 flex-col gap-3">
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
          <input ref={file} type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void importFile(f); }} />
        </div>
        <p className="text-xs text-amber-700 dark:text-amber-300">{t('Read only: the script never trades, transfers or changes anything on Fidelity; it reads the Positions page you can see yourself.')}</p>
      </div>
      </Section>
    {/* always the very bottom of settings (owner 2026-11-23) */}
    <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 pt-4 dark:border-slate-700" data-resets>
      <button type="button" className="btn sm" onClick={() => resetView()} title={t('Selected account, tab, sort, columns, theme and language back to their defaults; the setup stays')}>{t('Reset view')}</button>
      <label className="ml-2 flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
        <input type="checkbox" checked={fullOn} onChange={(e) => setFullOn(e.target.checked)} data-full-reset-switch />{t('Enable full reset')}
      </label>
      <button type="button" className="btn sm danger" disabled={!fullOn} data-full-reset onClick={() => void fullReset()}
        title={t('Everything this app keeps in this browser: the Google setup, the cached data and the view; the script forgets its data and Google token')}>
        {t('Full reset')}
      </button>
    </div>
    </div>
  );
}
