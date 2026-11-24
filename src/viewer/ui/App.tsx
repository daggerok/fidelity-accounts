/// <reference lib="esnext" />
import { useEffect, useRef, useState } from 'react';
import { themeIcon, themeTitle } from '../../shared/theme';
import { accountsIn, validScope } from '../app/derive';
import { askSync, dataset, loginSaved } from '../app/data';
import { connectGoogle, sheets } from '../app/google';
import { LANG_FLAGS, lang, setLang, t } from '../app/i18n';
import { MAIN_TABS, prefs, setPrefs, type MainTab } from '../app/prefs';
import { USERSCRIPT_ATTR, userscriptVersion } from '../app/status';
import { APP_VERSION, isOlder } from '../app/version';
import { loadConfig } from '../../shared/sheets/gis';
import { AccountTabs } from './AccountTabs';
import { GetStarted, laterThisSession, saidLater, setupDone, setupState } from './GetStarted';
import { Logo } from './Logo';
import { Positions } from './Positions';
import { SettingsPanel } from './SettingsPanel';
import { SlidePanel } from './SlidePanel';
import { Summary } from './Summary';
import { useStore } from './useStore';
import { useTheme } from './useTheme';

const tabName = (tab: MainTab): string => ({ summary: t('Summary'), positions: t('Positions') })[tab];

// open or closed panels are remembered per browser (twitter: `${PREFIX}-panel-setup`)
const PANEL_KEY = 'fidelity-accounts-panel-settings';
const panelOpen = (): boolean => { try { return localStorage.getItem(PANEL_KEY) === 'open'; } catch { return false; } };

export function App() {
  const theme = useTheme();
  const language = useStore(lang);
  const pr = useStore(prefs);
  const { ds, source, error } = useStore(dataset);
  const g = useStore(sheets);
  useStore(loginSaved);
  useEffect(() => { document.documentElement.lang = language; }, [language]);

  const [userscript, setUserscript] = useState<string | null>(() => userscriptVersion(document.documentElement));
  useEffect(() => {
    const root = document.documentElement;
    const obs = new MutationObserver(() => setUserscript(userscriptVersion(root)));
    obs.observe(root, { attributes: true, attributeFilter: [USERSCRIPT_ATTR] });
    return () => obs.disconnect();
  }, []);

  const [showSettings, setShowSettings] = useState(panelOpen);
  const toggleSettings = () => setShowSettings((v) => { try { localStorage.setItem(PANEL_KEY, v ? 'closed' : 'open'); } catch { /* private window */ } return !v; });
  // the 🚀 setup panel slides down by itself while a required step is missing (not after ✕ in this session) and goes
  // away by itself once they are done; the script mark may arrive a moment after load, so the first look waits 1.5 s
  const [showSetup, setShowSetup] = useState(false);
  const autoSetup = useRef(false);
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!setupDone(setupState(userscriptVersion(document.documentElement))) && !saidLater() && dataset.get().source !== 'demo') { autoSetup.current = true; setShowSetup(true); }
    }, 1500);
    return () => clearTimeout(timer);
  }, []);
  const done = setupDone(setupState(userscript));
  // done (or Enter in one of its fields, owner 2026-11-23): the panel slides up and the app shows
  useEffect(() => { if (done) { autoSetup.current = false; setShowSetup(false); } }, [done]);
  const hideSetup = () => { autoSetup.current = false; setShowSetup(false); };
  const closeSetup = () => { laterThisSession(); autoSetup.current = false; setShowSetup(false); };
  const toggleSetup = () => (showSetup ? closeSetup() : setShowSetup(true));

  const scope = validScope(ds, pr.scope);
  const accounts = ds ? accountsIn(ds, scope) : [];
  const icon = themeIcon(theme.mode, theme.systemDark);
  const one = accounts.length === 1 ? accounts[0] : null;
  const title = !ds ? '' : scope === 'all' ? t('All accounts') : scope.startsWith('group:') ? scope.slice(6) : one?.name ?? '';
  const year = new Date().getFullYear();

  return (
    <div className="flex min-h-dvh flex-col font-sans">
      <div className="flex flex-1 flex-col gap-4 px-4 pt-4 lg:px-6 lg:pt-6">
        <div className="flex flex-col">
          <header className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-2 dark:border-slate-700 dark:bg-slate-900">
            <h1 className="m-0 leading-none">
              <button type="button" className="block rounded-lg py-1" title={t('Back to the summary of all accounts')} onClick={() => setPrefs({ scope: 'all', tab: 'summary' })} data-home><Logo /></button>
            </h1>
            <div className="flex-1" />
            <div className="flex flex-wrap items-center gap-1">
              {isOlder(userscript, APP_VERSION) && (
                <a href="./fidelity-accounts-sync.user.js" data-update-hint className="mr-1 rounded-full border border-blue-300 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 dark:border-blue-500/40 dark:bg-blue-500/10 dark:text-blue-300"
                  title={t('The installed script is {installed}; this page serves {served}', { installed: userscript ?? '', served: APP_VERSION })}>{t('Script update {version} →', { version: APP_VERSION })}</a>
              )}
              <button type="button" className="tb font-bold" style={{ color: 'var(--brand)' }} data-sync disabled={!userscript}
                title={userscript ? t('Sync: opens Fidelity on Positions, the script reads it (read only)') : t('Install the script first (🚀 Get started)')} onClick={askSync}>⬇</button>
              <button type="button" className={`tb ${g.connected ? 'on' : ''}`} data-google disabled={g.connected || g.busy || !loadConfig().clientId}
                title={g.connected ? t('Google Sheets connected: new data is written by itself') : loadConfig().clientId ? t('Connect Google Sheets') : t('Google Sheets: set the Client ID first (🚀 Get started)')}
                onClick={() => void connectGoogle()}>{g.busy ? '⏳' : '☁️'}</button>
              {/* 🚀 only while something needs setup; afterwards Get started lives in ⚙️ Settings (owner 2026-11-23) */}
              {!done && <button type="button" className={`tb ${showSetup ? 'on' : ''}`} title={t('Get started: the setup steps')} onClick={toggleSetup} aria-expanded={showSetup} data-get-started-button>🚀</button>}
              <button type="button" className="tb" style={{ width: 'auto', padding: '0 .4rem' }} data-lang-button={language} onClick={() => setLang(language === 'en' ? 'ru' : 'en')} title={t('Language: English (click for Russian)')}>
                <span className="flex items-center gap-1"><span aria-hidden="true">{LANG_FLAGS[language]}</span><span className="text-[10px] font-semibold uppercase">{language}</span></span>
              </button>
              {/* settings sit right before the theme, the theme is the last one on the right (owner 2026-11-23) */}
              <button type="button" className={`tb ${showSettings ? 'on' : ''}`} title={t('Settings')} aria-expanded={showSettings} data-panel-button="settings" onClick={toggleSettings}>⚙️</button>
              <button type="button" onClick={theme.cycle} title={themeTitle(theme.mode, theme.systemDark)} data-theme-button={theme.mode} className="tb sun">
                <span className="relative inline-flex">{icon.icon}{icon.auto && <span className="absolute -right-2 -top-1.5 text-[8px] font-bold leading-none">A</span>}</span>
              </button>
            </div>
          </header>
          <SlidePanel id="setup-wrap" open={showSetup} title={`🚀 ${t('Get started')}`} onClose={closeSetup}>
            <div onKeyDown={(e) => { if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') hideSetup(); }}>
              <GetStarted userscript={userscript} onDemo={hideSetup} />
            </div>
          </SlidePanel>
          <SlidePanel id="settings-wrap" open={showSettings} title={`⚙️ ${t('Settings')}`} onClose={toggleSettings}>
            <SettingsPanel userscript={userscript} onGetStarted={() => { setShowSetup(true); window.scrollTo({ top: 0 }); }} />
          </SlidePanel>
        </div>

        {error && <div className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-2 text-sm text-rose-800 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200">{error}</div>}

        {/* no data: nothing here (owner 2026-11-23: a "no data yet" card is useless), 🚀 in the navbar leads to the setup */}
        {ds ? (
          <>
            <AccountTabs ds={ds} scope={scope} onScope={(s) => setPrefs({ scope: s })} />
            <main className="flex flex-col gap-4" data-tab={pr.tab}>
              <div>
                <h2 className="text-3xl font-semibold tracking-tight">{title}</h2>
                {one && <p className="text-sm text-slate-500 dark:text-slate-400">{[one.type, one.number].filter(Boolean).join(': ')}</p>}
              </div>
              <div className="flex items-end gap-6 border-b border-slate-200 dark:border-slate-700" role="tablist">
                {MAIN_TABS.map((tab) => (
                  <button key={tab} type="button" role="tab" aria-selected={pr.tab === tab} className={`main-tab ${pr.tab === tab ? 'on' : ''}`} onClick={() => setPrefs({ tab })}>{tabName(tab)}</button>
                ))}
                <div className="flex-1" />
                <span className="pb-2 text-xs text-slate-500 dark:text-slate-400">{source === 'demo' ? t('demo data') : ds.asOf ?? t('read {at}', { at: ds.builtAt.slice(0, 16).replace('T', ' ') })}</span>
              </div>
              {pr.tab === 'summary' ? <Summary ds={ds} accounts={accounts} /> : <Positions ds={ds} accounts={accounts} />}
            </main>
          </>
        ) : null}
      </div>
      <footer className="flex min-h-4 items-center justify-center px-4 text-center text-[0.625rem] leading-tight text-slate-400 lg:min-h-6 lg:px-6">
        <a href="https://github.com/daggerok/fidelity-accounts" target="_blank" rel="noreferrer" className="underline decoration-dotted hover:text-slate-600 dark:hover:text-slate-200">daggerok &copy; {year} · {t('not affiliated with Fidelity')}</a>
      </footer>
    </div>
  );
}
