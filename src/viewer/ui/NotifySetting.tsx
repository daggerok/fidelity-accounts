/// <reference lib="esnext" />
import { notifyOn, setNotify } from '../app/data';
import { t } from '../app/i18n';
import { Toggle } from './Toggle';
import { useStore } from './useStore';

// 🔔 Notifications in ⚙️ (owner 2026-11-25: off by default, "user can change"): the same switch as 🔔 on the Fidelity
// panel, kept in the script's storage; needs the script, which sends them
export function NotifySetting({ userscript }: { userscript: string | null }) {
  const on = useStore(notifyOn);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Toggle value={on ? 'on' : 'off'} label={t('Notifications')} onChange={(v) => setNotify(v === 'on')}
        a={{ value: 'off', text: '🔕', title: t('Notifications off') }} b={{ value: 'on', text: '🔔', title: t('Notifications on') }} />
      <span className="min-w-0 flex-1 text-xs text-slate-600 dark:text-slate-300">
        {userscript ? t('One notification when the script finishes a job (a sync, the daily reads) or fails: a popup here while this page is on screen, a Tampermonkey notification otherwise.') : t('Needs the script: install it under Get started.')}
      </span>
    </div>
  );
}
