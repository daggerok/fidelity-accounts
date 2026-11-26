/// <reference types="bun" />
/// <reference types="node" />
/// <reference lib="esnext" />
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, beforeAll, expect, test } from 'bun:test';

beforeAll(() => GlobalRegistrator.register({ url: 'https://digital.fidelity.com/ftgw/digital/portfolio/positions' }));
afterAll(() => GlobalRegistrator.unregister());

test('panel: actions, minimize remembered, the login only masked, auto login switch', async () => {
  const { mountBadge, MIN_KEY, maskUser } = await import('./badge');
  localStorage.removeItem(MIN_KEY);
  document.body.innerHTML = '';
  const actions: string[] = [];
  const attach = Element.prototype.attachShadow;
  let caught: ShadowRoot | null = null;
  Element.prototype.attachShadow = function (this: Element, init: ShadowRootInit) { caught = attach.call(this, init); return caught; };
  let saved: { user: string; pass: string } | null = null;
  let auto = true;
  const badge = mountBadge('9.9.9', (a) => actions.push(a), {
    saved: () => saved?.user ?? null, save: (user, pass) => { saved = { user, pass }; }, forget: () => { saved = null; },
    auto: () => auto, setAuto: (on) => { auto = on; },
  });
  Element.prototype.attachShadow = attach;
  // the root is closed: the page cannot reach it through the host; the test catches it the only way left, by wrapping
  // attachShadow before the mount (what a hostile page script would have to do before the userscript runs)
  expect(badge.host.shadowRoot).toBeNull();
  const root = caught!;
  expect(root.mode).toBe('closed');
  const q = <T extends HTMLElement = HTMLElement>(s: string) => root.querySelector(s) as T;
  q('[data-a="read"]').click();
  q('[data-a="json"]').click();
  q('[data-a="notify"]').click();
  expect(actions).toEqual(['read', 'json', 'notify']);
  badge.notifying(true);
  expect(q('[data-a="notify"]').textContent).toBe('🔔');
  badge.notifying(false);
  expect(q('[data-a="notify"]').textContent).toBe('🔕');
  badge.status('read: 3 accounts, 10 positions\n!sheets: 403');
  expect(q('.st').children.length).toBe(2);
  expect(q('.st .imp').textContent).toBe('sheets: 403');
  q('[data-m="minimize"]').click();
  expect(localStorage.getItem(MIN_KEY)).toBe('1');
  expect(q('.ml').textContent).toBe('✓');
  q('[data-m="restore"]').click();
  q('[data-m="login"]').click();
  q<HTMLInputElement>('.lu').value = 'someone';
  q<HTMLInputElement>('.lp').value = 'secret';
  q('[data-m="login-save"]').click();
  expect<unknown>(saved).toEqual({ user: 'someone', pass: 'secret' });
  expect(q('[data-login-line]').textContent).toContain(maskUser('someone'));
  expect(root.innerHTML).not.toContain('secret');
  q<HTMLInputElement>('.la').checked = false;
  q<HTMLInputElement>('.la').dispatchEvent(new Event('change'));
  expect(auto).toBe(false);
  q('[data-m="login-forget"]').click();
  expect(saved).toBeNull();
  // the 🔑 hint says that a backup of the script storage carries the login
  expect(q('.lg .hint').textContent).toContain('backup or export of script storage includes it');

  // a spreadsheet that is not the pinned one: Allow or keep, only tails of ids; a minimized panel opens for the question
  expect(q('[data-sheet-ask]').hidden).toBe(true);
  q('[data-m="minimize"]').click();
  badge.askSheet({ tail: '…bbbbbb', current: '…aaaaaa', declined: false });
  expect(q('.b').hidden).toBe(false);
  expect(q('[data-sheet-ask]').hidden).toBe(false);
  expect(q('.ask-text').textContent).toBe('Write your data to spreadsheet …bbbbbb?');
  expect(q('[data-a="sheet-keep"]').textContent).toBe('Keep the current one');
  q('[data-a="sheet-allow"]').click();
  q('[data-a="sheet-keep"]').click();
  expect(actions.slice(-2)).toEqual(['sheet-allow', 'sheet-keep']);
  badge.askSheet({ tail: '…bbbbbb', current: '', declined: false });
  expect(q('[data-a="sheet-keep"]').textContent).toBe('Not now');
  badge.askSheet({ tail: '…bbbbbb', current: '…aaaaaa', declined: true });
  expect(q('[data-a="sheet-keep"]').hidden).toBe(true);
  expect(q('[data-a="sheet-allow"]').hidden).toBe(false);
  badge.askSheet(null);
  expect(q('[data-sheet-ask]').hidden).toBe(true);
});
