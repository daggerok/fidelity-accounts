/// <reference lib="esnext" />
import { notifyOn, setNotify } from '../app/data';
import { t } from '../app/i18n';
import { SettingRow } from './SettingRow';
import { Toggle } from './Toggle';
import { useStore } from './useStore';

// 🔔 Notifications in ⚙️ (owner 2026-11-25: off by default, "user can change"): the same switch as 🔔 on the Fidelity
// panel, kept in the script's storage; needs the script, which sends them
export function NotifySetting({ userscript }: { userscript: string | null }) {
  const on = useStore(notifyOn);
  return (
    <SettingRow control={<Toggle value={on ? 'on' : 'off'} label={t('Notifications')} onChange={(v) => setNotify(v === 'on')}
      a={{ value: 'off', text: '🔕', title: t('Notifications off') }} b={{ value: 'on', text: '🔔', title: t('Notifications on') }} />}>
      {userscript ? t('Enable Tampermonkey script notifications') : t('Needs the script: install it under Get started.')}
    </SettingRow>
  );
}
