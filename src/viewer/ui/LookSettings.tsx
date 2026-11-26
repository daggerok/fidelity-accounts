/// <reference lib="esnext" />
import type { ThemeMode } from '../../shared/theme';
import { t } from '../app/i18n';
import { LangButton, ThemeButton, WatchButton } from './IconButtons';
import { SettingRow } from './SettingRow';

// The navbar's switches once more in ⚙️ Settings (owner 2026-11-25: "light/dark theme, i18n, eye also must be located
// in settings"): the very buttons of the navbar (ui/IconButtons.tsx), each with a line that says what it does. The
// navbar buttons stay where they are

/**
 * The theme and the language on one line: the theme button says its mode by its icon (the system mode carries an "A"),
 * so it has no words beside it (owner 2026-11-25: the text "Light, dark, or the same as your system" "is not needed");
 * `theme` comes from App's useTheme, the one owner of the theme
 */
export function ThemeLanguageSetting({ theme }: { theme: { mode: ThemeMode; systemDark: boolean; cycle: () => void } }) {
  return <SettingRow control={<><ThemeButton theme={theme} /><LangButton /></>}>{t('The language of the app')}</SettingRow>;
}

export function WatchSetting({ userscript }: { userscript: string | null }) {
  return (
    <SettingRow control={<WatchButton userscript={userscript} />}>
      {userscript ? t('Watch: opens Fidelity on Positions and keeps the numbers here live while markets are open (read only)') : t('Needs the script: install it under Get started.')}
    </SettingRow>
  );
}
