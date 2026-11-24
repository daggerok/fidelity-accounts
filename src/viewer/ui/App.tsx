/// <reference lib="esnext" />
import { useEffect, useMemo, useRef, useState } from 'react';
import { themeIcon, themeTitle } from '../../shared/theme';
import { accountsIn, groupsOf, moveAccount, moveGroup, orderAccounts, toggleFold, validScope } from '../app/derive';
import { dataset, loginSaved, runState, setWatch, watching } from '../app/data';
import { connectGoogle, sheets } from '../app/google';
import { LANG_FLAGS, lang, setLang, t } from '../app/i18n';
import { MAIN_TABS, prefs, setPrefs, type MainTab } from '../app/prefs';
import { USERSCRIPT_ATTR, userscriptVersion } from '../app/status';
import { APP_VERSION, isOlder } from '../app/version';
import { loadConfig } from '../../shared/sheets/gis';
import { AccountTabs } from './AccountTabs';
import { laterThisSession, saidLater, setupDone, setupState } from './GetStarted';
import { Logo } from './Logo';
import { Positions } from './Positions';
import { SettingsPanel } from './SettingsPanel';
import { SlidePanel } from './SlidePanel';
import { Summary } from './Summary';
import { animate } from './animate';
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
  const { ds: rawDs, source, error } = useStore(dataset);
  // the owner's own order of accounts applies everywhere: the bar, Positions, the Accounts card
  const ds = useMemo(() => (rawDs ? orderAccounts(rawDs, pr.accountOrder, pr.groupOrder) : null), [rawDs, pr.accountOrder, pr.groupOrder]);
  const g = useStore(sheets);
  useStore(loginSaved);
  const watch = useStore(watching);
  const run = useStore(runState);
  useEffect(() => { document.documentElement.lang = language; }, [language]);

  const [userscript, setUserscript] = useState<string | null>(() => userscriptVersion(document.documentElement));
  useEffect(() => {
    const root = document.documentElement;
    const obs = new MutationObserver(() => setUserscript(userscriptVersion(root)));
    obs.observe(root, { attributes: true, attributeFilter: [USERSCRIPT_ATTR] });
    return () => obs.disconnect();
  }, []);

  // ⚙️ Settings hold Get started on top (owner 2026-11-23). They slide down by themselves while a required step is missing
  // (not after ✕ in this session) and slide up by themselves once all is done, or on Enter in a setup field; the script
  // mark may arrive a moment after load, so the first look waits 1.5 s
  const [showSettings, setShowSettings] = useState(panelOpen);
  const autoOpened = useRef(false);
  const [expandSetup, setExpandSetup] = useState(0); // 🚀: open settings with Get started expanded
  const rememberPanel = (open: boolean) => { try { localStorage.setItem(PANEL_KEY, open ? 'open' : 'closed'); } catch { /* private window */ } };
  const done = setupDone(setupState(userscript));
  // Google connected, the sheet read and still no data, the script installed: start watching by itself, so the first
  // data comes with no other click (owner 2026-11-23); once per page
  const autoWatched = useRef(false);
  useEffect(() => {
    if (!g.connected || g.busy || ds || !userscript || watch || autoWatched.current) return;
    autoWatched.current = true;
    setWatch(true);
  }, [g.connected, g.busy, ds, userscript, watch]);
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!setupDone(setupState(userscriptVersion(document.documentElement))) && !saidLater()) { autoOpened.current = true; setShowSettings(true); }
    }, 1500);
    return () => clearTimeout(timer);
  }, []);
  useEffect(() => { if (done && autoOpened.current) { autoOpened.current = false; setShowSettings(false); } }, [done]);
  const closeSettings = () => { if (autoOpened.current && !done) laterThisSession(); autoOpened.current = false; rememberPanel(false); setShowSettings(false); };
  const toggleSettings = () => (showSettings ? closeSettings() : (rememberPanel(true), setShowSettings(true)));
  const openSetup = () => { setShowSettings(true); setExpandSetup((n) => n + 1); };
  // Enter in a setup field (owner 2026-11-23): the panel slides up and the app shows
  const onSettingsKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT' && (e.target as HTMLElement).closest('[data-get-started]')) closeSettings();
  };

  const scope = validScope(ds, pr.scope);
  const accounts = ds ? accountsIn(ds, scope) : [];
  const icon = themeIcon(theme.mode, theme.systemDark);
  const one = accounts.length === 1 ? accounts[0] : null;
  // a chosen set of accounts is named by its accounts (up to three), else counted
  const title = !ds ? '' : scope === 'none' ? t('No accounts selected: tick some above') : scope === 'all' ? t('All accounts') : scope.startsWith('group:') ? scope.slice(6) : one ? one.name
    : accounts.length <= 3 ? accounts.map((a) => a.name).join(' + ') : t('{n} accounts', { n: accounts.length });
  const year = new Date().getFullYear();

  return (
    // the page is exactly one screen tall (owner 2026-11-23: the footer must always be visible): the navbar on top, the
    // footer in the bottom gutter, and only the part between them scrolls
    <div className="flex h-dvh flex-col font-sans">
      <div className="shrink-0 px-4 pt-4 lg:px-6 lg:pt-6">
          {/* mobile first: on a phone the logo takes its own row, centered, and the buttons spread over the full width
              below it (the mykplan-adp rule: wrapped rows are spread and centered, never hugging the left) */}
          <header className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-slate-200 bg-white px-4 py-2 dark:border-slate-700 dark:bg-slate-900">
            <h1 className="m-0 flex w-full justify-center leading-none sm:w-auto">
              <button type="button" className="block rounded-lg py-1" title={t('Back to the summary of all accounts')} onClick={() => setPrefs({ scope: 'all', tab: 'summary' })} data-home><Logo /></button>
            </h1>
            <div className="hidden flex-1 sm:block" />
            <div className="flex w-full items-center justify-evenly gap-1 sm:w-auto sm:justify-end">
              {isOlder(userscript, APP_VERSION) && (
                <a href="./fidelity-accounts-sync.user.js" data-update-hint className="mr-1 rounded-full border border-blue-300 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 dark:border-blue-500/40 dark:bg-blue-500/10 dark:text-blue-300"
                  title={t('The installed script is {installed}; this page serves {served}', { installed: userscript ?? '', served: APP_VERSION })}>{t('Script update {version} →', { version: APP_VERSION })}</a>
              )}
              {/* 👀 watch the data while markets are open (owner 2026-11-23), instead of a one-off ⬇ */}
              <button type="button" className={`tb ${watch ? 'on' : ''}`} data-watch={watch ? 'on' : 'off'} disabled={!userscript}
                title={!userscript ? t('Install the script first (🚀 Get started)') : watch
                  ? t('Watching Fidelity: Positions refresh every minute and the numbers here follow (last read {at}). Click to stop', { at: run?.at ? new Date(run.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—' })
                  : t('Watch: opens Fidelity on Positions and keeps the numbers here live while markets are open (read only)')}
                onClick={() => setWatch(!watch)}>
                <span className="relative inline-flex">👀{watch && <span className="absolute -right-1 -top-1 size-2 animate-pulse rounded-full bg-emerald-500" />}</span>
              </button>
              {/* ☁️ only until Google is connected, like 🚀; disconnecting lives in ⚙️ Settings (owner 2026-11-23) */}
              {!g.connected && <button type="button" className="tb" data-google disabled={g.busy || !loadConfig().clientId}
                title={loadConfig().clientId ? t('Connect Google Sheets') : t('Google Sheets: set the Client ID first (🚀 Get started)')}
                onClick={() => void connectGoogle()}>{g.busy ? '⏳' : '☁️'}</button>}
              {/* 🚀 only while something needs setup; afterwards Get started lives in ⚙️ Settings (owner 2026-11-23) */}
              {!done && <button type="button" className="tb" title={t('Get started: the setup steps')} onClick={openSetup} data-get-started-button>🚀</button>}
              {/* order (owner 2026-11-23): settings, language, then the theme last on the right */}
              <button type="button" className={`tb ${showSettings ? 'on' : ''}`} title={t('Settings')} aria-expanded={showSettings} data-panel-button="settings" onClick={toggleSettings}>⚙️</button>
              <button type="button" className="tb" aria-label={t('Language: English (click for Russian)')} data-lang-button={language} onClick={() => setLang(language === 'en' ? 'ru' : 'en')} title={t('Language: English (click for Russian)')}>
                <span aria-hidden="true" className="text-base leading-none">{LANG_FLAGS[language]}</span>
              </button>
              <button type="button" onClick={theme.cycle} title={themeTitle(theme.mode, theme.systemDark)} data-theme-button={theme.mode} className="tb sun">
                <span className="relative inline-flex">{icon.icon}{icon.auto && <span className="absolute -right-2 -top-1.5 text-[8px] font-bold leading-none">A</span>}</span>
              </button>
            </div>
          </header>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 lg:px-6" data-scroll>
          <SlidePanel id="settings-wrap" open={showSettings} title={`⚙️ ${t('Settings')}`} onClose={closeSettings}>
            <div onKeyDown={onSettingsKey}>
              <SettingsPanel userscript={userscript} done={done} expand={expandSetup} />
            </div>
          </SlidePanel>

        {error && <div className="mt-4 rounded-xl border border-rose-300 bg-rose-50 px-4 py-2 text-sm text-rose-800 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200">{error}</div>}

        {/* no data: nothing here (owner 2026-11-23: a "no data yet" card is useless), 🚀 in the navbar leads to the setup */}
        {ds ? (
          <div className="flex flex-col gap-4 pt-4 lg:pt-6">
            <AccountTabs ds={ds} scope={scope} collapsed={pr.collapsed} onScope={(s) => animate(() => setPrefs({ scope: s }))} onFold={(name) => animate(() => setPrefs({ collapsed: toggleFold(prefs.get().collapsed, name) }))} onMove={(moved, target) => animate(() => setPrefs({ accountOrder: moveAccount(ds.accounts, moved, target) }))}
              onMoveGroup={(moved, target) => animate(() => setPrefs({ groupOrder: moveGroup(groupsOf(ds).map((g) => g.name), moved, target) }))} />
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
                <span className="pb-2 text-xs text-slate-500 dark:text-slate-400">{ds.asOf ?? t('read {at}', { at: ds.builtAt.slice(0, 16).replace('T', ' ') })}</span>
              </div>
              {accounts.length === 0 ? null : pr.tab === 'summary' ? <Summary ds={ds} accounts={accounts} /> : <Positions ds={ds} accounts={accounts} />}
            </main>
          </div>
        ) : null}
      </div>
      <footer className="flex min-h-4 shrink-0 items-center justify-center px-4 text-center text-[0.625rem] leading-tight text-slate-400 lg:min-h-6 lg:px-6">
        <a href="https://github.com/daggerok/fidelity-accounts" target="_blank" rel="noreferrer" className="underline decoration-dotted hover:text-slate-600 dark:hover:text-slate-200">daggerok &copy; {year}</a>
      </footer>
    </div>
  );
}
