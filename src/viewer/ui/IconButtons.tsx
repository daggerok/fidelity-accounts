/// <reference lib="esnext" />
import { themeIcon, themeTitle, type ThemeMode } from '../../shared/theme';
import { notifyOn, runState, setNotify, setWatch, watching } from '../app/data';
import { LANG_FLAGS, lang, setLang, t } from '../app/i18n';
import { mergeOn, toggleMerge } from '../app/merge';
import { prefs, setPrefs } from '../app/prefs';
import { clockTime } from './format';
import { MergeIcon } from './icons';
import { useStore } from './useStore';

// The icon switches: one round button whose icon is its state, a click moves to the next one (owner 2026-11-25, about
// the two-sided 🔕 🔔 slider in ⚙️: "I want to have a toggle which changing icon, like light/dark/auto theme"). The
// navbar and ⚙️ Settings draw the same components, so both always show the same state (rules/reusable-components.md).
// The words of each button are its title and its accessible name: an emoji alone says nothing to a reader

/** the theme: light -> dark -> system, the icon of shared/theme themeIcon (system carries an "A") */
export function ThemeButton({ theme }: { theme: { mode: ThemeMode; systemDark: boolean; cycle: () => void } }) {
  const icon = themeIcon(theme.mode, theme.systemDark);
  // shared/theme stays free of the app's words: its English title is the key of the Russian line
  const text = t(themeTitle(theme.mode, theme.systemDark));
  return (
    <button type="button" onClick={theme.cycle} title={text} aria-label={text} data-theme-button={theme.mode} className="tb sun">
      <span className="relative inline-flex">{icon.icon}{icon.auto && <span className="absolute -right-2 -top-1.5 text-[8px] font-bold leading-none">A</span>}</span>
    </button>
  );
}

/** the language: the flag of the one in use, a click takes the other */
export function LangButton() {
  const language = useStore(lang);
  const text = t('Language: English (click for Russian)');
  return (
    <button type="button" className="tb" aria-label={text} title={text} data-lang-button={language} onClick={() => setLang(language === 'en' ? 'ru' : 'en')}>
      <span aria-hidden="true" className="text-base leading-none">{LANG_FLAGS[language]}</span>
    </button>
  );
}

/**
 * 👀 watch the data (owner 2026-11-23), instead of a one-off ⬇; watching shows only as the green dot, the button itself
 * looks the same on and off (owner 2026-11-24). It needs the script, which reads Fidelity
 */
export function WatchButton({ userscript }: { userscript: string | null }) {
  const watch = useStore(watching);
  const run = useStore(runState);
  const language = useStore(lang);
  const text = !userscript ? t('Install the script first (🚀 Get started)') : watch
    ? t('Watching Fidelity: Positions refresh every 10 minutes while the market is open and the numbers here follow (last read {at}). Click to stop', { at: run?.at ? clockTime(run.at, language) : '—' })
    : t('Watch: opens Fidelity on Positions and keeps the numbers here live while markets are open (read only)');
  return (
    <button type="button" className="tb" data-watch={watch ? 'on' : 'off'} disabled={!userscript} title={text} aria-label={text} aria-pressed={watch} onClick={() => setWatch(!watch)}>
      <span className="relative inline-flex">👀{watch && <span className="absolute -right-1 -top-1 size-2 animate-pulse rounded-full bg-[var(--brand-ring)]" />}</span>
    </button>
  );
}

/** 🔔 notifications of the script: the bell while on, the crossed bell while off, like 🔔 on the Fidelity panel */
export function NotifyButton({ userscript }: { userscript: string | null }) {
  const on = useStore(notifyOn);
  const text = !userscript ? t('Install the script first (🚀 Get started)') : on ? t('Notifications on. Click to switch them off') : t('Notifications off. Click to switch them on');
  return (
    <button type="button" className="tb" data-notify={on ? 'on' : 'off'} disabled={!userscript} title={text} aria-label={text} aria-pressed={on} onClick={() => setNotify(!on)}>
      <span aria-hidden="true">{on ? '🔔' : '🔕'}</span>
    </button>
  );
}

/**
 * Merge next to the Positions tab (owner 2026-11-25: "near [Positions tab] we need to add a logo/ icon for merge"): the
 * Positions of several accounts as one line per ticker (app/merge.ts). Always there, so the tabs panel never moves; off
 * and dimmed while one account is shown. A click on Summary also opens Positions, where the result shows
 */
export function MergeButton({ accounts }: { accounts: number }) {
  const pr = useStore(prefs);
  useStore(lang);
  const several = accounts > 1;
  const on = mergeOn(pr.merge, accounts);
  const text = !several ? t('Merge positions: choose more than one account first') : on
    ? t('Merged: one line per ticker over the shown accounts. Click to show each account apart')
    : t('Merge positions: one line per ticker over the shown accounts');
  return (
    <button type="button" className={`tb ${on ? 'accent' : ''}`} data-merge={on ? 'on' : 'off'} disabled={!several} title={text} aria-label={text} aria-pressed={on} onClick={() => setPrefs(toggleMerge(prefs.get()))}>
      <MergeIcon />
    </button>
  );
}
