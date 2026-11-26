/// <reference lib="esnext" />
import { THEME_MODES, type ThemeMode } from '../../shared/theme';
import { setWatch, watching } from '../app/data';
import { lang, setLang, t, type Lang } from '../app/i18n';
import { Pills } from './Pills';
import { SettingRow } from './SettingRow';
import { Toggle } from './Toggle';
import { useStore } from './useStore';

// The navbar's switches once more in ⚙️ Settings (owner 2026-11-25: "light/dark theme, i18n, eye also must be located
// in settings"): the same state as the navbar buttons, which stay where they are. Two choices are a Toggle like the 🔔
// one, the three theme modes a row of pills

/** the theme: light, dark or the system's; `set` comes from App's useTheme, the one owner of the theme */
export function ThemeSetting({ mode, set }: { mode: ThemeMode; set: (m: ThemeMode) => void }) {
  const name: Record<ThemeMode, string> = { light: `☀ ${t('Light')}`, dark: `🌙 ${t('Dark')}`, system: `🖥 ${t('System')}` };
  return (
    <SettingRow control={<Pills items={THEME_MODES} value={mode} label={t('Theme')} labelOf={(m) => name[m]} onChange={set} />}>
      {t('Light, dark, or the same as your system')}
    </SettingRow>
  );
}

export function LanguageSetting() {
  const language = useStore(lang);
  return (
    <SettingRow control={<Toggle<Lang> value={language} label={t('Language')} onChange={setLang}
      a={{ value: 'en', text: '🇺🇸', title: 'English' }} b={{ value: 'ru', text: '🇷🇺', title: 'Русский' }} />}>
      {t('The language of the app')}
    </SettingRow>
  );
}

/** 👀: the same switch as the navbar's; it needs the script, which reads Fidelity */
export function WatchSetting({ userscript }: { userscript: string | null }) {
  const on = useStore(watching);
  return (
    <SettingRow control={<Toggle value={on ? 'on' : 'off'} label={t('Watch')} disabled={!userscript} onChange={(v) => setWatch(v === 'on')}
      a={{ value: 'off', text: '💤', title: t('Watching off') }} b={{ value: 'on', text: '👀', title: t('Watching on') }} />}>
      {userscript ? t('Watch: opens Fidelity on Positions and keeps the numbers here live while markets are open (read only)') : t('Needs the script: install it under Get started.')}
    </SettingRow>
  );
}
