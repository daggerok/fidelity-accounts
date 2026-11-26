/// <reference types="bun" />
/// <reference types="node" />
/// <reference lib="esnext" />
// Keyboard paths of the viewer: a ⤢ window takes the focus and gives it back, a closed panel leaves the Tab order, the
// chips of the accounts strip answer Enter and Space while the keys and clicks of their checkboxes stay the checkbox's
import { afterAll, beforeAll, expect, test } from 'bun:test';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import type { Dataset } from '../../shared/model';

beforeAll(() => {
  GlobalRegistrator.register({ url: 'https://daggerok.github.io/fidelity-accounts/' });
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  // no grow animation here: the window simply appears, as with reduced motion
  (Element.prototype as unknown as { animate?: unknown }).animate = undefined;
});
afterAll(() => GlobalRegistrator.unregister());

const key = (k: string, shiftKey = false) => new KeyboardEvent('keydown', { key: k, shiftKey, bubbles: true, cancelable: true });

test('a ⤢ window moves the focus to ✕, keeps Tab inside and gives the focus back on Esc', async () => {
  const { act, useState } = await import('react');
  const { createRoot } = await import('react-dom/client');
  const { Zoom } = await import('./Zoom');
  function Page() {
    const [open, setOpen] = useState(false);
    return <div><button id="opener" onClick={() => setOpen(true)}>open</button><Zoom open={open} title="T" onClose={() => setOpen(false)}><button id="inner">x</button></Zoom></div>;
  }
  document.body.innerHTML = '<div id="root"></div>';
  const root = createRoot(document.getElementById('root')!);
  await act(async () => root.render(<Page />));
  const opener = document.getElementById('opener')!;
  opener.focus();
  await act(async () => opener.click());
  expect(document.activeElement?.getAttribute('aria-label')).toBe('Close');
  await act(async () => { window.dispatchEvent(key('Tab', true)); });
  expect(document.activeElement?.id).toBe('inner');
  await act(async () => { window.dispatchEvent(key('Tab')); });
  expect(document.activeElement?.getAttribute('aria-label')).toBe('Close');
  await act(async () => { window.dispatchEvent(key('Escape')); });
  expect(document.activeElement?.id).toBe('opener');
  await act(async () => root.unmount());
});

test('a closed slide panel is inert, an open one is not', async () => {
  const { act } = await import('react');
  const { createRoot } = await import('react-dom/client');
  const { SlidePanel } = await import('./SlidePanel');
  document.body.innerHTML = '<div id="root"></div>';
  const root = createRoot(document.getElementById('root')!);
  await act(async () => root.render(<SlidePanel id="panel" open={false} title="S" onClose={() => {}}><input /></SlidePanel>));
  expect(document.getElementById('panel')!.hasAttribute('inert')).toBe(true);
  await act(async () => root.render(<SlidePanel id="panel" open title="S" onClose={() => {}}><input /></SlidePanel>));
  expect(document.getElementById('panel')!.hasAttribute('inert')).toBe(false);
  await act(async () => root.unmount());
});

test('Enter and Space press a chip; Enter and a click on its checkbox do not', async () => {
  const { act } = await import('react');
  const { createRoot } = await import('react-dom/client');
  const { AccountTabs } = await import('./AccountTabs');
  // made-up accounts
  const ds = { version: 1, builtAt: '2026-01-01T00:00:00Z', asOf: null, warnings: [], positions: [], accounts: [{ number: 'X0001111', name: 'Alpha', group: 'Investment', asOf: '' }, { number: 'X0002222', name: 'Beta', group: 'Investment', asOf: '' }] } as unknown as Dataset;
  const folds: string[] = [];
  const scopes: string[] = [];
  document.body.innerHTML = '<div id="root"></div>';
  const root = createRoot(document.getElementById('root')!);
  await act(async () => root.render(<AccountTabs ds={ds} scope="all" collapsed={[]} onScope={(s) => scopes.push(s)} onFold={(n) => folds.push(n)} onMove={() => {}} onMoveGroup={() => {}} />));
  const all = document.querySelector('[data-scope="all"]')!;
  const box = all.querySelector('input')!;
  await act(async () => { box.dispatchEvent(key('Enter')); });
  expect(folds).toEqual([]);
  const space = key(' ');
  await act(async () => { all.dispatchEvent(space); });
  expect(folds).toEqual(['*']);
  expect(space.defaultPrevented).toBe(true);
  // the label around the checkbox is its touch hit area: it ticks, the chip does not fold
  await act(async () => { box.parentElement!.click(); });
  expect(scopes).toEqual(['none']);
  expect(folds).toEqual(['*']);
  await act(async () => { document.querySelector('[data-scope="account:X0001111"]')!.dispatchEvent(key('Enter')); });
  expect(scopes).toEqual(['none', 'account:X0001111']);
  await act(async () => root.unmount());
});
