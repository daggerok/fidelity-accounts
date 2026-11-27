import { useEffect, useRef, useState } from 'react';
import { t } from '../app/i18n';
import { MIN_PASSWORD, applySettings, collectSettings, decryptSettings, encryptSettings, fileName, saveFile } from '../app/transfer';
import { iconButton } from './MaskedField';

// Export and Import in the header of ⚙️ Settings (owner 2026-11-27), before the resets: the two buttons, and under the
// header one line that asks for the only thing needed, the password of the file. Export: password -> Save file.
// Import: the file is chosen first (the button opens the browser's own picker), then its password -> Import, the page
// reloads with the settings of the file. No window over the page: a modal is only for ⤢ (repo rule)
type Mode = { kind: 'export' } | { kind: 'import'; name: string; text: string };

export function SettingsTransfer() {
  const [mode, setMode] = useState<Mode | null>(null);
  const [password, setPassword] = useState('');
  const [shown, setShown] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const field = useRef<HTMLInputElement>(null);

  const open = (m: Mode | null) => { setMode(m); setPassword(''); setShown(false); setMessage(null); };
  useEffect(() => { if (mode) field.current?.focus(); }, [mode]);

  const picked = async (file: File | undefined) => {
    if (!file) return;
    open({ kind: 'import', name: file.name, text: await file.text() });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mode || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      if (mode.kind === 'export') {
        const file = await encryptSettings(collectSettings(localStorage), password);
        saveFile(fileName(new Date().toISOString().slice(0, 10)), JSON.stringify(file, null, 2));
        open(null);
        setMessage({ ok: true, text: t('The file is saved. Keep its password: without it the file cannot be opened') });
      } else {
        const read = await decryptSettings(mode.text, password);
        if (read === 'not-ours') setMessage({ ok: false, text: t('This is not a settings file of this app') });
        else if (read === 'wrong-password') setMessage({ ok: false, text: t('Wrong password, or the file was changed') });
        else if (!applySettings(read, localStorage)) setMessage({ ok: false, text: t('The file holds no settings') });
        else location.reload();
      }
    } catch {
      setMessage({ ok: false, text: t('This browser could not do it') });
    } finally { setBusy(false); }
  };

  const short = mode?.kind === 'export' && password.length < MIN_PASSWORD;
  return (
    <>
      <div className="flex items-center gap-2" data-transfer>
        <button type="button" className={`btn sm ${mode?.kind === 'export' ? 'active' : ''}`} aria-expanded={mode?.kind === 'export'} data-export onClick={() => open(mode?.kind === 'export' ? null : { kind: 'export' })}
          title={t('Save the Google setup and the view into a file locked by a password, to bring them to another browser')}>⬇ {t('Export')}</button>
        <button type="button" className={`btn sm ${mode?.kind === 'import' ? 'active' : ''}`} aria-expanded={mode?.kind === 'import'} data-import onClick={() => (mode?.kind === 'import' ? open(null) : picker.current?.click())}
          title={t('Take the settings from a file made by Export')}>⬆ {t('Import')}</button>
        <input ref={picker} type="file" accept=".json,application/json" className="hidden" data-import-file onChange={(e) => { void picked(e.target.files?.[0]); e.target.value = ''; }} />
        <span className="ml-1 h-5 w-px bg-slate-200 dark:bg-slate-600" aria-hidden="true" />
      </div>
      {mode && (
        <form className="order-last flex basis-full flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/40" onSubmit={(e) => { void submit(e); }} data-transfer-form={mode.kind}>
          <div className="text-xs font-medium text-slate-700 dark:text-slate-200">
            {mode.kind === 'export' ? t('Export settings: choose a password for the file') : t('Import settings: enter the password of the file')}
            {mode.kind === 'import' && <span className="ml-2 font-normal text-slate-500 dark:text-slate-400" data-file-name>📄 {mode.name}</span>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-64 max-w-full">
              <input ref={field} className="inp mono text-xs" type={shown ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t('Password')} aria-label={t('Password')}
                autoComplete={mode.kind === 'export' ? 'new-password' : 'off'} spellCheck={false} data-transfer-password />
            </div>
            <button type="button" className={iconButton} title={shown ? t('Hide {label}', { label: t('Password') }) : t('Show {label}', { label: t('Password') })} onClick={() => setShown((s) => !s)}>{shown ? '🙈' : '👁'}</button>
            <button type="submit" className="btn primary" disabled={busy || !password || short} data-transfer-go>{busy ? '…' : mode.kind === 'export' ? t('Save file') : t('Import')}</button>
            <button type="button" className="btn" onClick={() => open(null)}>{t('Cancel')}</button>
          </div>
          <div className="text-xs text-slate-600 dark:text-slate-300">
            {mode.kind === 'export'
              ? t('At least {n} characters. The password is kept nowhere. In the file: the Google setup and the view. Not in it: the Google sign-in and what the script keeps on Fidelity', { n: MIN_PASSWORD })
              : t('The settings of this browser are replaced by the ones of the file and the page reloads. Then press ☁️ once to sign in to Google')}
          </div>
          {message && !message.ok && <div className="text-xs font-medium text-rose-700 dark:text-rose-300" role="alert" data-transfer-error>{message.text}</div>}
        </form>
      )}
      {!mode && message?.ok && <div className="order-last basis-full text-xs text-emerald-700 dark:text-emerald-300" role="status" data-transfer-done>{message.text}</div>}
    </>
  );
}
