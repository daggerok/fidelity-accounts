/// <reference types="bun" />
/// <reference types="node" />
/// <reference lib="esnext" />
import { afterAll, beforeAll, expect, test } from 'bun:test';
import { GlobalRegistrator } from '@happy-dom/global-registrator';

beforeAll(() => {
  GlobalRegistrator.register({ url: 'https://daggerok.github.io/fidelity-accounts/' });
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterAll(() => GlobalRegistrator.unregister());

test('a menu button opens its items, a pick closes it and tells which, Esc and a click elsewhere close it', async () => {
  const { act } = await import('react');
  const { createRoot } = await import('react-dom/client');
  const { MenuButton } = await import('./MenuButton');
  const picks: string[] = [];
  document.body.innerHTML = '<div id="root"></div><p id="away">away</p>';
  const root = createRoot(document.getElementById('root')!);
  await act(async () => { root.render(<MenuButton name="m" label="Export" items={[{ key: 'clipboard', label: 'Copy' }, { key: 'file', label: 'File', hint: 'a file' }]} onPick={(k) => picks.push(k)} />); });
  const button = document.querySelector<HTMLButtonElement>('[aria-haspopup="menu"]')!;
  const items = () => Array.from(document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
  expect(items().length).toBe(0);
  await act(async () => { button.click(); });
  expect(button.getAttribute('aria-expanded')).toBe('true');
  expect(items().map((i) => i.getAttribute('data-menu-item'))).toEqual(['clipboard', 'file']);
  await act(async () => { button.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })); });
  expect(document.activeElement).toBe(items()[0]);
  await act(async () => { items()[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true })); });
  expect(document.activeElement).toBe(items()[1]);
  await act(async () => { items()[1].click(); });
  expect(picks).toEqual(['file']);
  expect(items().length).toBe(0);
  await act(async () => { button.click(); });
  await act(async () => { button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
  expect(items().length).toBe(0);
  await act(async () => { button.click(); });
  await act(async () => { document.getElementById('away')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
  expect(items().length).toBe(0);
  await act(async () => { root.unmount(); });
});
