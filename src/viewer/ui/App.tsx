/// <reference lib="esnext" />
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Account } from '../../shared/model';
import { accountsIn, groupsOf, localToday, moveAccount, moveGroup, orderAccounts, scopeTitle, toggleFold, validScope } from '../app/derive';
import { autoWatch, dataset, loginSaved, sheetPin, watchChosen, watching } from '../app/data';
import { connectGoogle, sheets } from '../app/google';
import { lang, t } from '../app/i18n';
import { MAIN_TABS, prefs, setPrefs, type MainTab } from '../app/prefs';
import { USERSCRIPT_ATTR, userscriptVersion } from '../app/status';
import { rovingIndex } from '../app/focus';
import { APP_VERSION, isOlder } from '../app/version';
import { loadConfig } from '../../shared/sheets/gis';
import { AccountTabs } from './AccountTabs';
import { LangButton, MergeButton, ThemeButton, WatchButton } from './IconButtons';
import { Banner } from './Banner';
import { ErrorBoundary } from './ErrorBoundary';
import { laterThisSession, saidLater, setupDone, setupState } from './GetStarted';
import { Logo } from './Logo';
import { MenuToggle, Slot, Traveler } from './MobileMenu';
import { Notices } from './Notices';
import { Positions } from './Positions';
import { SettingsPanel, SettingsTools } from './SettingsPanel';
import { SlidePanel } from './SlidePanel';
import { Summary } from './Summary';
import { animate } from './animate';
import { readTime } from './format';
import { useStore } from './useStore';
import { useTheme } from './useTheme';
import { PHONE_QUERY, useMedia } from './useMedia';

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
  // the phone navbar: its icon buttons are folded until ☰ (ui/MobileMenu.tsx); the theme button travels between two slots
  const phone = useMedia(PHONE_QUERY);
  const [menuOpen, setMenuOpen] = useState(false);
  const themeHome = useRef<HTMLSpanElement>(null);
  const themeAway = useRef<HTMLSpanElement>(null);
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
  const one = accounts.length === 1 ? accounts[0] : null;
  // the name of what is shown titles the Balance card (owner 2026-11-24), the right of the tabs keeps only the time
  const title = !ds ? '' : scopeTitle(scope, accounts, { all: t('All accounts'), count: (n) => t('{n} accounts', { n }) });
  const year = new Date().getFullYear();
  const googleTitle = loadConfig().clientId ? t('Connect Google Sheets') : t('Google Sheets: set the Client ID first (🚀 Get started)');
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
          {/* a phone: ☰, the logo and the theme button must share one row at 375 px, so the side padding and the gap are
              smaller there; its rows bring their own gap above (a folded row would still take the navbar's row gap) */}
          <header className="flex flex-wrap items-center gap-x-1 gap-y-0 rounded-2xl border border-slate-200 bg-white px-4 py-2 dark:border-slate-700 dark:bg-slate-900 sm:gap-x-5 sm:gap-y-2 sm:px-6">
            {/* a phone (owner 2026-11-27): ☰, the logo, the theme button; the icon buttons wait folded under them */}
            <MenuToggle open={menuOpen} onToggle={() => setMenuOpen((v) => !v)} label={menuOpen ? t('Hide the buttons') : t('Show the buttons')} />
            <h1 className="m-0 flex flex-1 justify-center leading-none sm:flex-none">
              <button type="button" className="block rounded-lg py-1" title={t('Back to the summary of all accounts')} onClick={() => setPrefs({ scope: 'all', tab: 'summary' })} data-home><Logo /></button>
            </h1>
            {phone && <Slot slot={themeHome} />}
            {/* the accounts strip lives in the navbar between the logo and the buttons (owner 2026-11-24); below lg it takes
                its own full row under them */}
            {ds && <AccountTabs ds={ds} scope={scope} collapsed={pr.collapsed} className="order-last w-full max-sm:mt-2 lg:order-none lg:w-auto lg:flex-1 lg:basis-0"
              onScope={(s) => animate(() => setPrefs({ scope: s }))} onFold={(name) => setPrefs({ collapsed: toggleFold(prefs.get().collapsed, name) })}
              onMove={(moved, target) => animate(() => setPrefs({ accountOrder: moveAccount(ds.accounts, moved, target) }))}
              onMoveGroup={(moved, target) => animate(() => setPrefs({ groupOrder: moveGroup(groupsOf(ds).map((g) => g.name), moved, target) }))} />}
            <div className={`hidden flex-1 sm:block ${ds ? 'lg:hidden' : ''}`} />
            {/* one gap everywhere (owner 2026-11-24: consistent): 20 px of air between the logo, the accounts strip, the script
                update pill and each icon. A .tb box is 36 px around an 18 px icon (9 px each side), so icons sit 2 px apart
                and the group starts 9 px early when its first item is an icon */}
            <div id="nav-buttons" className={`slide-wrap nav-fold ${menuOpen ? 'open' : ''}`} inert={phone && !menuOpen}><div className="slide-inner">
            <div className={`flex w-full items-center justify-evenly gap-0.5 sm:w-auto sm:justify-end ${isOlder(userscript, APP_VERSION) ? '' : 'sm:-ml-[9px]'}`}>
              {isOlder(userscript, APP_VERSION) && (
                <a href="./fidelity-accounts-sync.user.js" data-update-hint className="mr-[9px] rounded-full border border-blue-300 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 dark:border-blue-500/40 dark:bg-blue-500/10 dark:text-blue-300"
                  title={t('The installed script is {installed}; this page serves {served}', { installed: userscript ?? '', served: APP_VERSION })}>{t('Script update {version} →', { version: APP_VERSION })}</a>
              )}
              {/* 👀, the language and the theme are the icon switches of ui/IconButtons.tsx, drawn in ⚙️ Settings too */}
              <WatchButton userscript={userscript} />
              {/* ☁️ only until Google is connected, like 🚀; disconnecting lives in ⚙️ Settings (owner 2026-11-23) */}
              {settled && !g.connected && <button type="button" className="tb" data-google disabled={g.busy || !loadConfig().clientId}
                title={googleTitle} aria-label={googleTitle}
                onClick={() => void connectGoogle()}>{g.busy ? '⏳' : '☁️'}</button>}
              {/* 🚀 only while something needs setup; afterwards Get started lives in ⚙️ Settings (owner 2026-11-23) */}
              {settled && !done && <button type="button" className="tb" title={t('Get started: the setup steps')} aria-label={t('Get started: the setup steps')} onClick={openSetup} data-get-started-button>🚀</button>}
              {/* order (owner 2026-11-23): settings, language, then the theme last on the right */}
              <button type="button" className={`tb ${showSettings ? 'on' : ''}`} title={t('Settings')} aria-label={t('Settings')} aria-expanded={showSettings} aria-controls="settings-wrap" data-panel-button="settings" onClick={toggleSettings}>⚙️</button>
              <LangButton />
              {phone ? <Slot slot={themeAway} /> : <ThemeButton theme={theme} />}
            </div>
            </div></div>
          </header>
          {phone && <Traveler away={menuOpen} home={themeHome} target={themeAway}><ThemeButton theme={theme} /></Traveler>}
          {/* the 🔔 popups lie over the right end of the navbar (ui/Notices.tsx) */}
          <Notices />
          </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 lg:px-6" data-scroll>
          <SlidePanel id="settings-wrap" open={showSettings} title={`⚙️ ${t('Settings')}`} onClose={closeSettings} tools={<SettingsTools />}>
            <div onKeyDown={onSettingsKey}>
              <SettingsPanel userscript={userscript} done={done} expand={expandSetup} theme={theme} />
            </div>
          </SlidePanel>
          {/* the page tabs get a panel of their own under the navbar, in its look (owner 2026-11-24: "lets add same panel as
              our navbar, but it will contains only tabs"): the tabs on the left, our read time on the right ("As of": Fidelity's
              own keeps the page load time after Refresh Positions); the gap above is the gutter, like between the cards, and it is
              as tall as the navbar (owner 2026-11-25): the tabs are as tall as the navbar buttons (.tb, 2.25rem) */}
          {/* it lives in the scrolling part, under the open ⚙️ Settings (owner 2026-11-27: "settings menu should appeared above
              tabs panel, not below"), and sticks to its top with the gutter above it, so the tabs never scroll away */}
          {ds && (
            <div className="sticky top-0 z-20 bg-slate-100 pt-4 dark:bg-slate-950 lg:pt-6" data-tabs-wrap>
            <nav className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 rounded-2xl border border-slate-200 bg-white px-6 py-2 dark:border-slate-700 dark:bg-slate-900" data-tabs-panel>
              {/* the merge switch follows the Positions tab (owner 2026-11-25), outside the tablist: a tablist holds only tabs and
                  its arrow keys move between them; it is always drawn (dimmed with one account), so the panel never moves */}
              <div className="flex items-center gap-x-1.5">
                {/* WAI-ARIA tabs: only the chosen tab is in the Tab order, Left and Right (Home, End) choose the next one */}
                <div className="flex items-center gap-x-6 text-sm leading-none lg:text-base" role="tablist" aria-label={t('Pages')} onKeyDown={onTabKey}>
                  {MAIN_TABS.map((tab) => (
                    <button key={tab} id={`tab-${tab}`} type="button" role="tab" aria-selected={pr.tab === tab} aria-controls={TAB_PANEL} tabIndex={pr.tab === tab ? 0 : -1}
                      className={`main-tab flex h-9 items-center ${pr.tab === tab ? 'on' : ''}`} onClick={() => setPrefs({ tab })} data-main-tab={tab}>{tabName(tab)}</button>
                  ))}
                </div>
                <MergeButton accounts={accounts.length} />
              </div>
              <span className="text-xs leading-none text-slate-500 dark:text-slate-400" data-scope-title>{t('As of {at}', { at: readTime(ds.builtAt, language) })}</span>
            </nav>
            </div>
          )}

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
