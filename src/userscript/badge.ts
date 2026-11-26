/// <reference lib="esnext" />
// Corner panel on Fidelity in a shadow root (the site's CSS never touches it), the mykplan-adp panel made smaller:
// one fact per line, ⬇ read now, {} JSON, 🔑 optional login, minimize to a round icon (remembered)
export const MIN_KEY = 'fidelity-accounts-badge-minimized';

// the saved user name shown on the panel: its first 3 characters and stars; short names show less
export const maskUser = (u: string): string => `${u.slice(0, Math.min(3, Math.max(1, u.length - 2)))}****`;

export type Action = 'read' | 'json' | 'watch' | 'notify';

export interface Badge {
  status(line: string): void;
  sheets(note: string): void;
  watching(on: boolean): void;
  notifying(on: boolean): void;
  host: HTMLElement;
}

export interface LoginHooks {
  saved: () => string | null;
  save: (user: string, pass: string) => void;
  forget: () => void;
  auto: () => boolean;
  setAuto: (on: boolean) => void;
}

export function mountBadge(version: string, onAction: (a: Action) => void, login: LoginHooks): Badge {
  const host = document.createElement('div');
  host.id = 'fidelity-accounts-badge';
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `
    <style>
      .b { position: fixed; right: 12px; bottom: 12px; z-index: 2147483647; display: flex; flex-direction: column; gap: 6px;
           font: 12px/1.3 system-ui, sans-serif; color: #e2e8f0; background: #0f172a; border-radius: 10px; padding: 8px 10px;
           box-shadow: 0 4px 14px rgba(0,0,0,.25); width: 380px; box-sizing: border-box; }
      .row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
      .dot { width: 8px; height: 8px; border-radius: 50%; flex: none; background: #64748b; transition: background-color .2s; }
      .dot.on { background: #22c55e; }
      .st { color: #94a3b8; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
      .st > div, .line { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #94a3b8; }
      .st > div.imp { white-space: normal; overflow-wrap: anywhere; color: #fca5a5; }
      button { all: unset; cursor: pointer; padding: 3px 7px; border-radius: 6px; background: #1e293b; }
      button:hover { background: #334155; }
      [hidden] { display: none !important; }
      .min { margin-left: auto; padding: 0 7px; background: transparent; font-size: 14px; line-height: 1; }
      .mini { position: fixed; right: 12px; bottom: 12px; z-index: 2147483647; display: flex; align-items: center; gap: 6px;
              height: 36px; min-width: 36px; padding: 0 10px; border-radius: 18px; background: #0f172a; color: #e2e8f0;
              font: 12px/1 system-ui, sans-serif; box-shadow: 0 4px 14px rgba(0,0,0,.25); cursor: pointer; }
      .lg { display: flex; flex-direction: column; gap: 6px; border-top: 1px solid #1e293b; padding-top: 6px; }
      .lg input[type=text], .lg input[type=password] { all: unset; background: #1e293b; border-radius: 6px; padding: 4px 8px; color: #e2e8f0; }
      .hint { color: #94a3b8; }
      /* icons only, the tooltip says what they do (owner 2026-11-24): a green ⬇ reads now, an amber {} downloads JSON */
      .ic { font-weight: 700; min-width: 14px; text-align: center; }
      .read { color: #22c55e; }
      .json { color: #f59e0b; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
    </style>
    <button class="mini" data-m="restore" title="fidelity-accounts: show the panel" hidden><span class="dot"></span><span class="ml"></span></button>
    <div class="b" role="status">
      <div class="row"><span class="dot"></span><b>fidelity-accounts ${version}</b><span class="hint">read only</span>
        <button data-m="login" title="Optional: your Fidelity login, so the script logs in by itself">🔑</button>
        <button class="min" data-m="minimize" title="Minimize to a small icon">–</button></div>
      <div class="row">
        <button data-a="watch" title="Watch: refresh Positions every 10 minutes and hand the changes to the viewer">👀</button>
        <button data-a="read" class="ic read" title="Read the positions now (opens the Positions page when you are elsewhere)">⬇</button>
        <button data-a="json" class="ic json" title="Download the last read as JSON">{}</button>
        <button data-a="notify" title="Notifications: off. Click to get one when a job is done or fails">🔕</button>
      </div>
      <div class="st"></div>
      <div class="line" data-sheets-line></div>
      <div class="line" data-login-line></div>
      <div class="lg" hidden>
        <div class="hint">Optional. Kept in this script's Tampermonkey storage on this computer (never in the repo, the viewer or Sheets); Tampermonkey itself can read it, like anything this script keeps. Want no copy anywhere? Do not save it: log in yourself (Chrome's password manager or a passkey) and the script goes on after the login. One try per 30 minutes; a refused password stops it; a one-time code you type yourself.</div>
        <input class="lu" type="text" placeholder="Fidelity username" autocomplete="off" spellcheck="false">
        <input class="lp" type="password" placeholder="password" autocomplete="new-password">
        <label class="row hint"><input class="la" type="checkbox"> log in by itself whenever the login page opens</label>
        <div class="row"><button data-m="login-save">Save</button><button data-m="login-forget">Forget</button><span class="ls hint"></span></div>
      </div>
    </div>`;
  root.querySelectorAll<HTMLButtonElement>('button[data-a]').forEach((b) => b.addEventListener('click', () => onAction(b.dataset.a as Action)));
  document.body.appendChild(host);
  const q = <T extends HTMLElement = HTMLElement>(s: string) => root.querySelector(s) as T;
  const setMin = (on: boolean) => {
    q('.b').hidden = on;
    q('.mini').hidden = !on;
    host.dataset.minimized = on ? 'yes' : 'no';
    try { localStorage.setItem(MIN_KEY, on ? '1' : '0'); } catch { /* not remembered */ }
  };
  q('[data-m="minimize"]').addEventListener('click', () => setMin(true));
  q('[data-m="restore"]').addEventListener('click', () => setMin(false));
  const showSaved = () => {
    const u = login.saved();
    q('[data-login-line]').textContent = u ? `🔑 login saved: ${maskUser(u)} / *****${login.auto() ? ', logs in by itself' : ''}` : '🔑 login not saved: you log in yourself';
    q('.ls').textContent = u ? 'saved' : 'not saved';
    q<HTMLInputElement>('.lu').placeholder = u ? maskUser(u) : 'Fidelity username';
    q<HTMLInputElement>('.la').checked = login.auto();
  };
  q('[data-m="login"]').addEventListener('click', () => { q('.lg').hidden = !q('.lg').hidden; showSaved(); });
  q('[data-m="login-save"]').addEventListener('click', () => {
    const u = q<HTMLInputElement>('.lu').value.trim();
    const p = q<HTMLInputElement>('.lp').value;
    if (!u || !p) { q('.ls').textContent = 'both fields, please'; return; }
    login.save(u, p);
    q<HTMLInputElement>('.lu').value = '';
    q<HTMLInputElement>('.lp').value = '';
    showSaved();
  });
  q('[data-m="login-forget"]').addEventListener('click', () => { login.forget(); showSaved(); });
  q<HTMLInputElement>('.la').addEventListener('change', (e) => { login.setAuto((e.target as HTMLInputElement).checked); showSaved(); });
  showSaved();
  let remembered = false;
  try { remembered = localStorage.getItem(MIN_KEY) === '1'; } catch { /* open */ }
  setMin(remembered);
  return {
    host,
    status(line) {
      const box = q('.st');
      box.textContent = '';
      line.split('\n').filter(Boolean).forEach((l) => {
        const div = document.createElement('div');
        const imp = l.startsWith('!');
        div.textContent = imp ? l.slice(1) : l;
        div.title = div.textContent;
        if (imp) div.className = 'imp';
        box.appendChild(div);
      });
      q('.ml').textContent = /^read:/.test(line) ? '✓' : '';
    },
    sheets(note) { q('[data-sheets-line]').textContent = note; q('[data-sheets-line]').title = note; },
    watching(on) {
      const b = q('[data-a="watch"]');
      // one 👀 like in the viewer's navbar (owner 2026-11-24): green while watching, the title says what a click does
      b.title = on ? 'Watching: Positions refresh every 10 minutes. Click to stop' : 'Watch: refresh Positions every 10 minutes and hand the changes to the viewer';
      b.style.background = on ? '#368727' : '';
      host.dataset.watching = on ? 'yes' : 'no';
      // the dot is green while 👀 watches, grey when it does not (owner 2026-11-24)
      root.querySelectorAll('.dot').forEach((d) => d.classList.toggle('on', on));
      q('.mini').title = on ? 'fidelity-accounts: watching · show the panel' : 'fidelity-accounts: not watching · show the panel';
    },
    notifying(on) {
      // 🔔 on, 🔕 off: the same switch as Notifications in the viewer's ⚙️ (shared/notice.ts)
      const b = q('[data-a="notify"]');
      b.textContent = on ? '🔔' : '🔕';
      b.title = on ? 'Notifications: on, one per finished job or error. Click to stop' : 'Notifications: off. Click to get one when a job is done or fails';
      host.dataset.notifying = on ? 'yes' : 'no';
    },
  };
}
