import { useEffect, useRef, useState } from 'react';
import { t } from '../app/i18n';
import { MIN_PASSWORD, applySettings, collectSettings, decryptSettings, encryptSettings, fileName, saveFile } from '../app/transfer';
import { iconButton } from './MaskedField';
import { MenuButton } from './MenuButton';

// Export and Import in the header of ⚙️ Settings (owner 2026-11-27), before the resets: two menus, each with the
// clipboard first and the file second ("copy and paste and next we would have file"), and under the header one form
// that asks for the password. The same encrypted text goes both ways: copied here it is pasted on a phone.
// Export: password -> Copy or Save file. Import: the text is pasted or the file chosen first, then its password ->
// Import, the page reloads with these settings. No window over the page: a modal is only for ⤢ (repo rule)
type Via = 'clipboard' | 'file';
type Mode = { kind: 'export'; via: Via } | { kind: 'import'; via: Via; name: string; text: string };

/** the text to the clipboard: the promise form first, the only one Safari takes after waiting for the encryption */
async function copyLater(text: Promise<string>): Promise<boolean> {
  try {
    if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
      await navigator.clipboard.write([new ClipboardItem({ 'text/plain': text.then((s) => new Blob([s], { type: 'text/plain' })) })]);
      return true;
    }
  } catch { /* the plain way below */ }
  try { await navigator.clipboard.writeText(await text); return true; } catch { return false; }
}

export function SettingsTransfer() {
  const [mode, setMode] = useState<Mode | null>(null);
  const [password, setPassword] = useState('');
  const [shown, setShown] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  // the encrypted text when the browser refused the clipboard: shown to be copied by hand
  const [manual, setManual] = useState('');
  const picker = useRef<HTMLInputElement>(null);
  const form = useRef<HTMLFormElement>(null);

  const open = (m: Mode | null) => { setMode(m); setPassword(''); setShown(false); setMessage(null); setManual(''); };
  // the first thing to fill gets the focus: the pasted text when it is still empty, else the password
  useEffect(() => { if (mode) form.current?.querySelector<HTMLElement>(mode.kind === 'import' && mode.via === 'clipboard' && !mode.text ? 'textarea' : 'input')?.focus(); }, [mode?.kind, mode?.via]);

  const picked = async (file: File | undefined) => {
    if (file) open({ kind: 'import', via: 'file', name: file.name, text: await file.text() });
  };
  const paste = async () => {
    // the browser may ask or refuse: the box then waits for a paste by hand
    let text = '';
    try { text = (await navigator.clipboard.readText()).trim(); } catch { /* by hand */ }
    open({ kind: 'import', via: 'clipboard', name: '', text });
  };
  const pick = (kind: Mode['kind'], via: string) => {
    if (kind === 'export') open({ kind, via: via as Via });
    else if (via === 'file') picker.current?.click();
    else void paste();
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mode || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      if (mode.kind === 'export') {
        const file = encryptSettings(collectSettings(localStorage), password);
        if (mode.via === 'file') {
          saveFile(fileName(new Date().toISOString().slice(0, 10)), JSON.stringify(await file, null, 2));
          open(null);
          setMessage({ ok: true, text: t('The file is saved. Keep its password: without it the file cannot be opened') });
        } else {
          const text = file.then((f) => JSON.stringify(f));
          const ok = await copyLater(text);
          open(null);
          if (ok) setMessage({ ok: true, text: t('Copied. Paste it on the other device: ⚙️ Settings, Import, Paste from the clipboard') });
          else { setManual(await text); setMessage({ ok: true, text: t('The browser did not let us copy. Copy this text yourself:') }); }
        }
      } else {
        const read = await decryptSettings(mode.text.trim(), password);
        if (read === 'not-ours') setMessage({ ok: false, text: mode.via === 'file' ? t('This is not a settings file of this app') : t('This is not the text made by Export') });
        else if (read === 'wrong-password') setMessage({ ok: false, text: t('Wrong password, or the file was changed') });
        else if (!applySettings(read, localStorage)) setMessage({ ok: false, text: t('The file holds no settings') });
        else location.reload();
      }
    } catch {
      setMessage({ ok: false, text: t('This browser could not do it') });
    } finally { setBusy(false); }
  };

  const short = mode?.kind === 'export' && password.length < MIN_PASSWORD;
  const empty = mode?.kind === 'import' && !mode.text.trim();
  const go = !mode ? '' : mode.kind === 'import' ? t('Import') : mode.via === 'file' ? t('Save file') : t('Copy');
  return (
    <>
      <div className="flex items-center gap-2" data-transfer>
        <MenuButton name="export" label={`⬇ ${t('Export')}`} active={mode?.kind === 'export'} onPick={(k) => pick('export', k)}
          title={t('Take the Google setup and the view to another browser, locked by a password')}
          items={[
            { key: 'clipboard', label: `📋 ${t('Copy to the clipboard')}`, hint: t('Encrypted text, to paste on another device') },
            { key: 'file', label: `📄 ${t('Save as a file')}`, hint: t('Encrypted file, to send or keep') },
          ]} />
        <MenuButton name="import" label={`⬆ ${t('Import')}`} active={mode?.kind === 'import'} onPick={(k) => pick('import', k)}
          title={t('Take the settings made by Export')}
          items={[
            { key: 'clipboard', label: `📋 ${t('Paste from the clipboard')}`, hint: t('The text copied by Export') },
            { key: 'file', label: `📄 ${t('Choose a file')}`, hint: t('The file saved by Export') },
          ]} />
        <input ref={picker} type="file" accept=".json,application/json" className="hidden" data-import-file onChange={(e) => { void picked(e.target.files?.[0]); e.target.value = ''; }} />
      </div>
      {mode && (
        <form ref={form} className="order-last flex basis-full flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/40" onSubmit={(e) => { void submit(e); }} data-transfer-form={`${mode.kind}-${mode.via}`}>
          <div className="text-xs font-medium text-slate-700 dark:text-slate-200">
            {mode.kind === 'export' ? t('Export settings: choose a password') : t('Import settings: enter the password they were exported with')}
            {mode.kind === 'import' && mode.via === 'file' && <span className="ml-2 font-normal text-slate-500 dark:text-slate-400" data-file-name>📄 {mode.name}</span>}
          </div>
          {mode.kind === 'import' && mode.via === 'clipboard' && (
            <textarea className="inp mono h-16 max-w-xl resize-none text-[11px] leading-tight" value={mode.text} onChange={(e) => setMode({ ...mode, text: e.target.value })} placeholder={t('Paste the text copied by Export here')} aria-label={t('Paste the text copied by Export here')}
              spellCheck={false} autoComplete="off" data-transfer-text />
          )}
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-64 max-w-full">
              <input className="inp mono text-xs" type={shown ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t('Password')} aria-label={t('Password')}
                autoComplete={mode.kind === 'export' ? 'new-password' : 'off'} spellCheck={false} data-transfer-password />
            </div>
            <button type="button" className={iconButton} title={shown ? t('Hide {label}', { label: t('Password') }) : t('Show {label}', { label: t('Password') })} onClick={() => setShown((s) => !s)}>{shown ? '🙈' : '👁'}</button>
            <button type="submit" className="btn primary" disabled={busy || !password || short || empty} data-transfer-go>{busy ? '…' : go}</button>
            <button type="button" className="btn" onClick={() => open(null)}>{t('Cancel')}</button>
          </div>
          <div className="text-xs text-slate-600 dark:text-slate-300">
            {mode.kind === 'export'
              ? t('At least {n} characters. The password is kept nowhere. Exported: the Google setup and the view. Not exported: the Google sign-in and what the script keeps on Fidelity', { n: MIN_PASSWORD })
              : t('The settings of this browser are replaced and the page reloads. Then press ☁️ once to sign in to Google')}
          </div>
          {message && !message.ok && <div className="text-xs font-medium text-rose-700 dark:text-rose-300" role="alert" data-transfer-error>{message.text}</div>}
        </form>
      )}
      {!mode && message?.ok && (
        <div className="order-last flex basis-full flex-col gap-2" role="status" data-transfer-done>
          <div className="text-xs text-emerald-700 dark:text-emerald-300">{message.text}</div>
          {manual && <textarea className="inp mono h-16 max-w-xl resize-none text-[11px] leading-tight" readOnly value={manual} onFocus={(e) => e.target.select()} data-transfer-manual />}
        </div>
      )}
    </>
  );
}
