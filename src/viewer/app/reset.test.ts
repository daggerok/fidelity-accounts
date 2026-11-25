/// <reference types="bun" />
/// <reference types="node" />
/// <reference lib="esnext" />
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, beforeAll, expect, test } from 'bun:test';

beforeAll(() => GlobalRegistrator.register({ url: 'https://daggerok.github.io/fidelity-accounts/' }));
afterAll(() => GlobalRegistrator.unregister());

// every app on daggerok.github.io shares one localStorage (one origin): 'other-app.setting' stands for a neighbour's
// key that a reset of this app must never touch
const seed = () => {
  localStorage.clear();
  ['fidelity-accounts.prefs', 'fidelity-accounts-theme', 'fidelity-accounts-palette', 'fidelity-accounts.lang', 'fidelity-accounts-panel-settings', 'fidelity-accounts-gs-config', 'other-app.setting'].forEach((k) => localStorage.setItem(k, '1'));
};

test('Reset view clears the look and the choices, never the Google setup or a neighbour app key', async () => {
  const { resetView } = await import('./prefs');
  seed();
  let reloaded = false;
  resetView(localStorage, () => { reloaded = true; });
  expect(reloaded).toBe(true);
  expect(localStorage.getItem('fidelity-accounts-gs-config')).toBe('1');
  expect(localStorage.getItem('other-app.setting')).toBe('1');
  expect(localStorage.getItem('fidelity-accounts.prefs')).toBeNull();
  expect(localStorage.getItem('fidelity-accounts-theme')).toBeNull();
  expect(localStorage.getItem('fidelity-accounts-palette')).toBeNull();
  expect(localStorage.getItem('fidelity-accounts.lang')).toBeNull();
});

test('Full reset clears every key of this app (Google setup too), asks the script to forget, keeps a neighbour app key', async () => {
  const { fullReset } = await import('./reset');
  seed();
  sessionStorage.setItem('fidelity-accounts-setup-later', '1');
  const posted: unknown[] = [];
  window.addEventListener('message', (e) => posted.push(e.data));
  let reloaded = false;
  await fullReset(() => { reloaded = true; });
  await new Promise((r) => setTimeout(r, 0));
  expect(reloaded).toBe(true);
  expect(Object.keys(localStorage).filter((k) => k.startsWith('fidelity-accounts'))).toEqual([]);
  expect(localStorage.getItem('other-app.setting')).toBe('1');
  expect(sessionStorage.getItem('fidelity-accounts-setup-later')).toBeNull();
  expect(posted.some((d) => (d as { type?: string }).type === 'fidelity-accounts:forget')).toBe(true);
});
