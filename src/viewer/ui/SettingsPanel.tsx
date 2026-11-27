import { useEffect, useState } from 'react';
import { t } from '../app/i18n';
import { resetView } from '../app/prefs';
import { fullReset } from '../app/reset';
import type { ThemeMode } from '../../shared/theme';
import { GetStarted } from './GetStarted';
import { ThemeLanguageSetting, WatchSetting } from './LookSettings';
import { NotifySetting } from './NotifySetting';
import { PalettePicker } from './PalettePicker';
import { Section } from './Section';
import { SettingsTransfer } from './SettingsTransfer';

// ⚙️ Settings (slide down under the navbar): Get started on top, the core setup with Google Sheets and the data in it
// (owner 2026-11-23), its header slides it open and shut; the two resets live in the panel's header (SettingsResets)
export function SettingsPanel({ userscript, done, expand, theme }: { userscript: string | null; done: boolean; expand: number; theme: { mode: ThemeMode; systemDark: boolean; cycle: () => void } }) {
  // Get started on top: expanded while something needs setup, squashed once done; its header toggles it (owner 2026-11-23)
  const [setupOpen, setSetupOpen] = useState(!done);
  useEffect(() => { setSetupOpen(!done); }, [done]);
  useEffect(() => { if (expand) setSetupOpen(true); }, [expand]);
  const [prefsOpen, setPrefsOpen] = useState(true);

  return (
    <div className="flex flex-col gap-6 text-sm">
    <Section id="get-started" title={`🚀 ${t('Get started')}`} note={done ? t('all set') : t('needs setup')} open={setupOpen} onToggle={() => setSetupOpen((v) => !v)}>
      <GetStarted userscript={userscript} all={done} />
    </Section>
    {/* one section for everything a person sets to taste (owner 2026-11-25: "all these must be merged in 1 section called
        User preferences"): the theme and the language, the color palette of the whole app (owner 2026-11-24, like gex's
        Settings -> Color palette), 👀 and 🔔; the switches are the navbar's own buttons (ui/IconButtons.tsx) */}
    <Section id="preferences" title={`🎛️ ${t('User preferences')}`} open={prefsOpen} onToggle={() => setPrefsOpen((v) => !v)}>
      <div className="flex flex-col gap-4">
        <ThemeLanguageSetting theme={theme} />
        <PalettePicker />
        <WatchSetting userscript={userscript} />
        <NotifySetting userscript={userscript} />
      </div>
    </Section>
    </div>
  );
}

// everything in the header of ⚙️ Settings after its title: Export and Import, then the resets
export function SettingsTools() {
  return <><SettingsTransfer /><SettingsResets /></>;
}

// One reset button right after Export and Import in the panel's header (owner 2026-11-27: "single button with word
// checkbox and word inside: Reset (checkbox) Full", "initial border is Orange as Reset text, if checkbox for Full
// selected - use red border"). It is drawn as one button of the header's size; inside, the word Reset does the reset
// and the box with the word Full says how far it goes (a real checkbox cannot live inside a real button, so the frame
// is a group). Not ticked: the view only, the setup stays (resetView). Ticked: everything this app keeps in this
// browser (fullReset), so the full one still takes two clicks
export function SettingsResets() {
  const [full, setFull] = useState(false);
  return (
    <div role="group" aria-label={t('Reset')} data-resets data-reset-kind={full ? 'full' : 'view'}
      className={`flex min-h-[1.875rem] items-stretch overflow-hidden rounded-lg border text-xs font-medium transition-colors ${full ? 'border-rose-400 dark:border-rose-500/70' : 'border-amber-400 dark:border-amber-500/70'}`}>
      <button type="button" data-reset={full ? 'full' : 'view'} onClick={() => (full ? void fullReset() : resetView())}
        className={`pl-2.5 pr-1.5 transition-colors ${full ? 'text-rose-700 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-400/10' : 'text-amber-700 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-400/10'}`}
        title={full
          ? t('Everything this app keeps in this browser: the Google setup, the cached data and the view; the script forgets its data and Google token')
          : t('Selected account, tab, sort, columns, theme, palette and language back to their defaults; the setup stays')}>{t('Reset')}</button>
      <label className="flex cursor-pointer items-center gap-1.5 pl-1.5 pr-2.5 text-rose-700 transition-colors hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-400/10"
        title={t('Ticked: Reset also forgets the Google setup and the cached data')}>
        {/* the box is red as the word (owner: "checkbox with Full can be both in red color"): the real checkbox is kept
            for the keyboard and the reader, the drawn box follows it */}
        <input type="checkbox" className="peer sr-only" checked={full} onChange={(e) => setFull(e.target.checked)} data-full-reset-switch />
        <span aria-hidden="true" className="grid h-3.5 w-3.5 place-items-center rounded-[3px] border border-rose-500 text-[10px] leading-none text-transparent peer-checked:bg-rose-600 peer-checked:text-white peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-1 peer-focus-visible:outline-rose-400 dark:border-rose-400 dark:peer-checked:bg-rose-500">✓</span>
        {t('Full')}
      </label>
    </div>
  );
}
