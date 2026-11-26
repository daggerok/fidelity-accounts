/// <reference lib="esnext" />
import { t } from '../app/i18n';
import { NotifyButton } from './IconButtons';
import { SettingRow } from './SettingRow';

// 🔔 Notifications in ⚙️ (owner 2026-11-25: off by default, "user can change"): the same switch as 🔔 on the Fidelity
// panel, kept in the script's storage; needs the script, which sends them. One button whose icon is the state
// (ui/IconButtons.tsx NotifyButton)
export function NotifySetting({ userscript }: { userscript: string | null }) {
  return (
    <SettingRow control={<NotifyButton userscript={userscript} />}>
      {userscript ? t('Enable Tampermonkey script notifications') : t('Needs the script: install it under Get started.')}
    </SettingRow>
  );
}
