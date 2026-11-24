/// <reference types="bun" />
/// <reference types="node" />
/// <reference lib="esnext" />
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, beforeAll, expect, test } from 'bun:test';

beforeAll(() => GlobalRegistrator.register({ url: 'https://daggerok.github.io/fidelity-accounts/' }));
afterAll(() => GlobalRegistrator.unregister());

const seed = () => {
  localStorage.clear();
  ['fidelity-accounts.prefs', 'fidelity-accounts-theme', 'fidelity-accounts.lang', 'fidelity-accounts-panel-settings', 'fidelity-accounts-gs-config', 'twitter-gs-config'].forEach((k) => localStorage.setItem(k, '1'));
};

test('Reset view clears the look and the choices, never the Google setup or other apps', async () => {
  const { resetView } = await import('./prefs');
  seed();
  let reloaded = false;
  resetView(localStorage, () => { reloaded = true; });
  expect(reloaded).toBe(true);
  expect(localStorage.getItem('fidelity-accounts-gs-config')).toBe('1');
  expect(localStorage.getItem('twitter-gs-config')).toBe('1');
  expect(localStorage.getItem('fidelity-accounts.prefs')).toBeNull();
  expect(localStorage.getItem('fidelity-accounts-theme')).toBeNull();
  expect(localStorage.getItem('fidelity-accounts.lang')).toBeNull();
});

test('Full reset clears every key of this app (Google setup too), asks the script to forget, keeps other apps', async () => {
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
  expect(localStorage.getItem('twitter-gs-config')).toBe('1');
  expect(sessionStorage.getItem('fidelity-accounts-setup-later')).toBeNull();
  expect(posted.some((d) => (d as { type?: string }).type === 'fidelity-accounts:forget')).toBe(true);
});
