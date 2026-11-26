import { useEffect, useState } from 'react';
import { t } from '../app/i18n';
import { resetView } from '../app/prefs';
import { fullReset } from '../app/reset';
import type { ThemeMode } from '../../shared/theme';
import { GetStarted } from './GetStarted';
import { LanguageSetting, ThemeSetting, WatchSetting } from './LookSettings';
import { NotifySetting } from './NotifySetting';
import { PalettePicker } from './PalettePicker';
import { Section } from './Section';

// ⚙️ Settings (slide down under the navbar): Get started on top, the core setup with Google Sheets and the data in it
// (owner 2026-11-23), its header slides it open and shut; the two resets live in the panel's header (SettingsResets)
export function SettingsPanel({ userscript, done, expand, theme }: { userscript: string | null; done: boolean; expand: number; theme: { mode: ThemeMode; set: (m: ThemeMode) => void } }) {
  // Get started on top: expanded while something needs setup, squashed once done; its header toggles it (owner 2026-11-23)
  const [setupOpen, setSetupOpen] = useState(!done);
  useEffect(() => { setSetupOpen(!done); }, [done]);
  useEffect(() => { if (expand) setSetupOpen(true); }, [expand]);
  const [lookOpen, setLookOpen] = useState(true);
  const [notifyOpen, setNotifyOpen] = useState(true);
  const [themeOpen, setThemeOpen] = useState(true);
  const [watchOpen, setWatchOpen] = useState(true);

  return (
    <div className="flex flex-col gap-6 text-sm">
    <Section id="get-started" title={`🚀 ${t('Get started')}`} note={done ? t('all set') : t('needs setup')} open={setupOpen} onToggle={() => setSetupOpen((v) => !v)}>
      <GetStarted userscript={userscript} all={done} />
    </Section>
    {/* the navbar's theme, language and 👀 switches once more (owner 2026-11-25), ui/LookSettings.tsx */}
    <Section id="look" title={`🌗 ${t('Theme and language')}`} open={themeOpen} onToggle={() => setThemeOpen((v) => !v)}>
      <div className="flex flex-col gap-3">
        <ThemeSetting mode={theme.mode} set={theme.set} />
        <LanguageSetting />
      </div>
    </Section>
    {/* the color palette of the whole app (owner 2026-11-24, like gex's Settings -> Color palette) */}
    <Section id="palette" title={`🎨 ${t('Color palette')}`} open={lookOpen} onToggle={() => setLookOpen((v) => !v)}>
      <PalettePicker />
    </Section>
    <Section id="watch" title={`👀 ${t('Watch')}`} open={watchOpen} onToggle={() => setWatchOpen((v) => !v)}>
      <WatchSetting userscript={userscript} />
    </Section>
    <Section id="notifications" title={`🔔 ${t('Notifications')}`} open={notifyOpen} onToggle={() => setNotifyOpen((v) => !v)}>
      <NotifySetting userscript={userscript} />
    </Section>
    </div>
  );
}

// Reset view and Full reset, right after "⚙️ Settings" in the panel's header (owner 2026-11-24; they were at the very
// bottom). Full reset is off by default and needs its own switch first (owner 2026-11-23); Reset view always works
export function SettingsResets() {
  const [fullOn, setFullOn] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-2" data-resets>
      <button type="button" className="btn sm" onClick={() => resetView()} title={t('Selected account, tab, sort, columns, theme, palette and language back to their defaults; the setup stays')}>{t('Reset view')}</button>
      <label className="ml-2 flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
        <input type="checkbox" checked={fullOn} onChange={(e) => setFullOn(e.target.checked)} data-full-reset-switch />{t('Enable full reset')}
      </label>
      <button type="button" className="btn sm danger" disabled={!fullOn} data-full-reset onClick={() => void fullReset()}
        title={t('Everything this app keeps in this browser: the Google setup, the cached data and the view; the script forgets its data and Google token')}>
        {t('Full reset')}
      </button>
    </div>
  );
}
