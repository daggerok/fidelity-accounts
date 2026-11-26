/// <reference lib="esnext" />
import { useEffect, useMemo, useRef, useState } from 'react';
import { themeIcon, themeTitle } from '../../shared/theme';
import type { Account } from '../../shared/model';
import { accountsIn, groupsOf, localToday, moveAccount, moveGroup, orderAccounts, scopeTitle, toggleFold, validScope } from '../app/derive';
import { autoWatch, dataset, loginSaved, runState, setWatch, sheetPin, watchChosen, watching } from '../app/data';
import { connectGoogle, sheets } from '../app/google';
import { LANG_FLAGS, lang, setLang, t } from '../app/i18n';
import { MAIN_TABS, prefs, setPrefs, type MainTab } from '../app/prefs';
import { USERSCRIPT_ATTR, userscriptVersion } from '../app/status';
import { rovingIndex } from '../app/focus';
import { APP_VERSION, isOlder } from '../app/version';
import { loadConfig } from '../../shared/sheets/gis';
import { AccountTabs } from './AccountTabs';
import { Banner } from './Banner';
import { ErrorBoundary } from './ErrorBoundary';
import { laterThisSession, saidLater, setupDone, setupState } from './GetStarted';
import { Logo } from './Logo';
import { Notices } from './Notices';
import { Positions } from './Positions';
import { SettingsPanel, SettingsResets } from './SettingsPanel';
import { SlidePanel } from './SlidePanel';
import { Summary } from './Summary';
import { animate } from './animate';
import { clockTime, readTime } from './format';
import { useStore } from './useStore';
import { useTheme } from './useTheme';

const tabName = (tab: MainTab): string => ({ summary: t('Summary'), positions: t('Positions') })[tab];
const TAB_PANEL = 'main-tabpanel';

// open or closed panels are remembered per browser (twitter: `${PREFIX}-panel-setup`)
const PANEL_KEY = 'fidelity-accounts-panel-settings';
const panelOpen = (): boolean => { try { return localStorage.getItem(PANEL_KEY) === 'open'; } catch { return false; } };
// one empty list for no data, so the screens below see the same accounts from draw to draw
const NO_ACCOUNTS: Account[] = [];

export function App() {
  const theme = useTheme();
  const language = useStore(lang);
  const pr = useStore(prefs);
  const { ds: rawDs, error } = useStore(dataset);
  // the owner's own order of accounts applies everywhere: the bar, Positions, the Accounts card
  const ds = useMemo(() => (rawDs ? orderAccounts(rawDs, pr.accountOrder, pr.groupOrder) : null), [rawDs, pr.accountOrder, pr.groupOrder]);
  const g = useStore(sheets);
  useStore(loginSaved);
  const watch = useStore(watching);
  const chosen = useStore(watchChosen);
  const run = useStore(runState);
  const pin = useStore(sheetPin);
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
  // data comes with no other click (owner 2026-11-23); once per page, and never after the owner switched 👀 on or off
  // (owner 2026-11-24: "do not want if it was disabled previously"). No click here: a blocked window changes nothing
  // and a popup asks for 👀 (autoWatch)
  const autoWatched = useRef(false);
  useEffect(() => {
    if (!g.connected || g.busy || ds || !userscript || watch || chosen || autoWatched.current) return;
    autoWatched.current = true;
    autoWatch();
  }, [g.connected, g.busy, ds, userscript, watch, chosen]);
  // ☁️ and 🚀 wait for the same 1.5 s (owner 2026-11-24: on a reload 🚀 flashed and went away): the script mark, the saved
  // data and the saved Google sign-in come a moment after the first paint
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => {
      setSettled(true);
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
  // nothing ticked shows the same as everything ticked (owner 2026-11-24): the boxes stay clear, the numbers are all.
  // Kept from draw to draw: App draws again on every status message of the script and every Sheets log line, and a new
  // list made Summary and Positions work every number out again
  const accounts = useMemo(() => (ds ? (scope === 'none' ? ds.accounts : accountsIn(ds, scope)) : NO_ACCOUNTS), [ds, scope]);
  const icon = themeIcon(theme.mode, theme.systemDark);
  const one = accounts.length === 1 ? accounts[0] : null;
  // the name of what is shown titles the Balance card (owner 2026-11-24), the right of the tabs keeps only the time
  const title = !ds ? '' : scopeTitle(scope, accounts, { all: t('All accounts'), count: (n) => t('{n} accounts', { n }) });
  const year = new Date().getFullYear();
  // the words of the icon buttons are their title and their accessible name (an emoji alone says nothing to a reader)
  const watchTitle = !userscript ? t('Install the script first (🚀 Get started)') : watch
    ? t('Watching Fidelity: Positions refresh every 10 minutes while the market is open and the numbers here follow (last read {at}). Click to stop', { at: run?.at ? clockTime(run.at, language) : '—' })
    : t('Watch: opens Fidelity on Positions and keeps the numbers here live while markets are open (read only)');
  const googleTitle = loadConfig().clientId ? t('Connect Google Sheets') : t('Google Sheets: set the Client ID first (🚀 Get started)');
  // shared/theme stays free of the app's words: its English title is the key of the Russian line
  const themeText = t(themeTitle(theme.mode, theme.systemDark));
  const onTabKey = (e: React.KeyboardEvent) => {
    const to = rovingIndex(MAIN_TABS.length, MAIN_TABS.indexOf(pr.tab), e.key);
    if (to === null) return;
    e.preventDefault();
    const tab = MAIN_TABS[to]!;
    setPrefs({ tab });
    document.getElementById(`tab-${tab}`)?.focus();
  };
  const today = localToday();

  return (
    // the page is exactly one screen tall (owner 2026-11-23: the footer must always be visible): the navbar on top, the
    // footer in the bottom gutter, and only the part between them scrolls
    <div className="flex h-dvh flex-col font-sans">
      <div className="shrink-0 px-4 pt-4 lg:px-6 lg:pt-6">
          {/* mobile first: on a phone the logo takes its own row, centered, and the buttons spread over the full width
              below it (the mykplan-adp rule: wrapped rows are spread and centered, never hugging the left) */}
          {/* the navbar, the tabs panel and the cards share one inset (24 px, the card padding) and one corner (1rem), so the logo,
              the tabs and the card titles start on one line and the buttons, As of and ⤢ end on one (owner 2026-11-25) */}
          <div className="relative">
          <header className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-2xl border border-slate-200 bg-white px-6 py-2 dark:border-slate-700 dark:bg-slate-900">
            <h1 className="m-0 flex w-full justify-center leading-none sm:w-auto">
              <button type="button" className="block rounded-lg py-1" title={t('Back to the summary of all accounts')} onClick={() => setPrefs({ scope: 'all', tab: 'summary' })} data-home><Logo /></button>
            </h1>
            {/* the accounts strip lives in the navbar between the logo and the buttons (owner 2026-11-24); below lg it takes
                its own full row under them */}
            {ds && <AccountTabs ds={ds} scope={scope} collapsed={pr.collapsed} className="order-last w-full lg:order-none lg:w-auto lg:flex-1 lg:basis-0"
              onScope={(s) => animate(() => setPrefs({ scope: s }))} onFold={(name) => setPrefs({ collapsed: toggleFold(prefs.get().collapsed, name) })}
              onMove={(moved, target) => animate(() => setPrefs({ accountOrder: moveAccount(ds.accounts, moved, target) }))}
              onMoveGroup={(moved, target) => animate(() => setPrefs({ groupOrder: moveGroup(groupsOf(ds).map((g) => g.name), moved, target) }))} />}
            <div className={`hidden flex-1 sm:block ${ds ? 'lg:hidden' : ''}`} />
            {/* one gap everywhere (owner 2026-11-24: consistent): 20 px of air between the logo, the accounts strip, the script
                update pill and each icon. A .tb box is 36 px around an 18 px icon (9 px each side), so icons sit 2 px apart
                and the group starts 9 px early when its first item is an icon */}
            <div className={`flex w-full items-center justify-evenly gap-0.5 sm:w-auto sm:justify-end ${isOlder(userscript, APP_VERSION) ? '' : 'sm:-ml-[9px]'}`}>
              {isOlder(userscript, APP_VERSION) && (
                <a href="./fidelity-accounts-sync.user.js" data-update-hint className="mr-[9px] rounded-full border border-blue-300 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 dark:border-blue-500/40 dark:bg-blue-500/10 dark:text-blue-300"
                  title={t('The installed script is {installed}; this page serves {served}', { installed: userscript ?? '', served: APP_VERSION })}>{t('Script update {version} →', { version: APP_VERSION })}</a>
              )}
              {/* 👀 watch the data (owner 2026-11-23), instead of a one-off ⬇; watching shows only as the green dot, the button
                  itself looks the same on and off (owner 2026-11-24) */}
              <button type="button" className="tb" data-watch={watch ? 'on' : 'off'} disabled={!userscript} title={watchTitle} aria-label={watchTitle}
                onClick={() => setWatch(!watch)}>
                <span className="relative inline-flex">👀{watch && <span className="absolute -right-1 -top-1 size-2 animate-pulse rounded-full bg-[var(--brand-ring)]" />}</span>
              </button>
              {/* ☁️ only until Google is connected, like 🚀; disconnecting lives in ⚙️ Settings (owner 2026-11-23) */}
              {settled && !g.connected && <button type="button" className="tb" data-google disabled={g.busy || !loadConfig().clientId}
                title={googleTitle} aria-label={googleTitle}
                onClick={() => void connectGoogle()}>{g.busy ? '⏳' : '☁️'}</button>}
              {/* 🚀 only while something needs setup; afterwards Get started lives in ⚙️ Settings (owner 2026-11-23) */}
              {settled && !done && <button type="button" className="tb" title={t('Get started: the setup steps')} aria-label={t('Get started: the setup steps')} onClick={openSetup} data-get-started-button>🚀</button>}
              {/* order (owner 2026-11-23): settings, language, then the theme last on the right */}
              <button type="button" className={`tb ${showSettings ? 'on' : ''}`} title={t('Settings')} aria-label={t('Settings')} aria-expanded={showSettings} aria-controls="settings-wrap" data-panel-button="settings" onClick={toggleSettings}>⚙️</button>
              <button type="button" className="tb" aria-label={t('Language: English (click for Russian)')} data-lang-button={language} onClick={() => setLang(language === 'en' ? 'ru' : 'en')} title={t('Language: English (click for Russian)')}>
                <span aria-hidden="true" className="text-base leading-none">{LANG_FLAGS[language]}</span>
              </button>
              <button type="button" onClick={theme.cycle} title={themeText} aria-label={themeText} data-theme-button={theme.mode} className="tb sun">
                <span className="relative inline-flex">{icon.icon}{icon.auto && <span className="absolute -right-2 -top-1.5 text-[8px] font-bold leading-none">A</span>}</span>
              </button>
            </div>
          </header>
          {/* the 🔔 popups hang from the right end of the navbar (ui/Notices.tsx) */}
          <Notices />
          </div>
          {/* the page tabs get a panel of their own under the navbar, in its look (owner 2026-11-24: "lets add same panel as
              our navbar, but it will contains only tabs"): the tabs on the left, our read time on the right ("As of": Fidelity's
              own keeps the page load time after Refresh Positions); the gap above is the gutter, like between the cards, and it is
              as tall as the navbar (owner 2026-11-25): the tabs are as tall as the navbar buttons (.tb, 2.25rem) */}
          {ds && (
            <nav className="mt-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-1 rounded-2xl border border-slate-200 bg-white px-6 py-2 dark:border-slate-700 dark:bg-slate-900 lg:mt-6" data-tabs-panel>
              {/* WAI-ARIA tabs: only the chosen tab is in the Tab order, Left and Right (Home, End) choose the next one */}
              <div className="flex items-center gap-x-6 text-sm leading-none lg:text-base" role="tablist" aria-label={t('Pages')} onKeyDown={onTabKey}>
                {MAIN_TABS.map((tab) => (
                  <button key={tab} id={`tab-${tab}`} type="button" role="tab" aria-selected={pr.tab === tab} aria-controls={TAB_PANEL} tabIndex={pr.tab === tab ? 0 : -1}
                    className={`main-tab flex h-9 items-center ${pr.tab === tab ? 'on' : ''}`} onClick={() => setPrefs({ tab })} data-main-tab={tab}>{tabName(tab)}</button>
                ))}
              </div>
              <span className="text-xs leading-none text-slate-500 dark:text-slate-400" data-scope-title>{t('As of {at}', { at: readTime(ds.builtAt, language) })}</span>
            </nav>
          )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 lg:px-6" data-scroll>
          <SlidePanel id="settings-wrap" open={showSettings} title={`⚙️ ${t('Settings')}`} onClose={closeSettings} tools={<SettingsResets />}>
            <div onKeyDown={onSettingsKey}>
              <SettingsPanel userscript={userscript} done={done} expand={expandSetup} theme={theme} />
            </div>
          </SlidePanel>

        {/* what is wrong with the data and with Google (a lost sign-in says "press ☁️", and ☁️ is back in the navbar) */}
        {[error, g.error].filter((m): m is string => !!m).map((m, i) => <Banner key={i}>{m}</Banner>)}
        {/* the spreadsheet handed over waits for Allow on the Fidelity panel (userscript/pin.ts): says where to confirm, until it is done */}
        {pin && <Banner>{pin.waiting === 'ask'
          ? t('The script writes nothing to spreadsheet {tail} until you press Allow on its panel in a Fidelity tab (bottom right).', { tail: pin.tail })
          : t('Spreadsheet {tail} was declined on the script panel in a Fidelity tab: nothing is written to it. Press Allow there, or put your sheet back in ⚙️ Settings.', { tail: pin.tail })}</Banner>}

        {/* no data: nothing here (owner 2026-11-23: a "no data yet" card is useless), 🚀 in the navbar leads to the setup */}
        {ds ? (
          <div className="flex flex-col">
            {/* the cards start one gutter below the tabs panel (or below the open settings) */}
            <main id={TAB_PANEL} role="tabpanel" aria-labelledby={`tab-${pr.tab}`} className="flex flex-col pt-4 lg:pt-6" data-tab={pr.tab}>
              <ErrorBoundary resetKey={`${ds.builtAt}|${pr.tab}`}>
                {accounts.length === 0 ? null : pr.tab === 'summary' ? <Summary ds={ds} accounts={accounts} title={title} titleHint={one ? [one.type, one.number].filter(Boolean).join(': ') : undefined} today={today} /> : <Positions ds={ds} accounts={accounts} />}
              </ErrorBoundary>
            </main>
          </div>
        ) : null}
      </div>
      <footer className="flex min-h-4 shrink-0 items-center justify-center px-4 text-center text-[0.625rem] leading-tight text-slate-600 dark:text-slate-400 lg:min-h-6 lg:px-6">
        <a href="https://github.com/daggerok/fidelity-accounts" target="_blank" rel="noreferrer" className="underline decoration-dotted hover:text-slate-900 dark:hover:text-slate-200">daggerok &copy; {year}</a>
      </footer>
    </div>
  );
}
