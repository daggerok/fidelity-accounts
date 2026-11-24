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
  let saved: { user: string; pass: string } | null = null;
  let auto = true;
  const badge = mountBadge('9.9.9', (a) => actions.push(a), {
    saved: () => saved?.user ?? null, save: (user, pass) => { saved = { user, pass }; }, forget: () => { saved = null; },
    auto: () => auto, setAuto: (on) => { auto = on; },
  });
  const root = badge.host.shadowRoot!;
  const q = <T extends HTMLElement = HTMLElement>(s: string) => root.querySelector(s) as T;
  q('[data-a="read"]').click();
  q('[data-a="json"]').click();
  expect(actions).toEqual(['read', 'json']);
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
  expect(saved).toEqual({ user: 'someone', pass: 'secret' });
  expect(q('[data-login-line]').textContent).toContain(maskUser('someone'));
  expect(root.innerHTML).not.toContain('secret');
  q<HTMLInputElement>('.la').checked = false;
  q<HTMLInputElement>('.la').dispatchEvent(new Event('change'));
  expect(auto).toBe(false);
  q('[data-m="login-forget"]').click();
  expect(saved).toBeNull();
});
