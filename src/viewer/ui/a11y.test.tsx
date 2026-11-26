/// <reference types="bun" />
/// <reference types="node" />
/// <reference lib="esnext" />
// Keyboard paths of the viewer: a ⤢ window takes the focus and gives it back, a closed panel leaves the Tab order, the
// chips of the accounts strip answer Enter and Space while the keys and clicks of their checkboxes stay the checkbox's,
// and Alt+Left and Alt+Right move a chip with the focus staying on it
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

test('Alt+Left and Alt+Right move an account inside its group and a group among the groups, the focus stays on the chip', async () => {
  const { act, useState } = await import('react');
  const { createRoot } = await import('react-dom/client');
  const { AccountTabs } = await import('./AccountTabs');
  const { moveAccount, moveGroup, groupsOf, orderAccounts } = await import('../app/derive');
  // made-up accounts
  const raw = { version: 1, builtAt: '2026-01-01T00:00:00Z', asOf: null, warnings: [], positions: [], accounts: [
    { number: 'X0001111', name: 'Alpha', group: 'Investment', asOf: '' }, { number: 'X0002222', name: 'Beta', group: 'Investment', asOf: '' },
    { number: 'X0003333', name: 'Gamma', group: 'Retirement', asOf: '' },
  ] } as unknown as Dataset;
  const moves: string[] = [];
  function Strip() {
    const [order, setOrder] = useState<{ accounts: string[]; groups: string[] }>({ accounts: [], groups: [] });
    const ds = orderAccounts(raw, order.accounts, order.groups);
    return <AccountTabs ds={ds} scope="all" collapsed={[]} onScope={() => {}} onFold={() => {}}
      onMove={(m, to) => { moves.push(`${m}>${to}`); setOrder((o) => ({ ...o, accounts: moveAccount(ds.accounts, m, to) })); }}
      onMoveGroup={(m, to) => { moves.push(`${m}>${to}`); setOrder((o) => ({ ...o, groups: moveGroup(groupsOf(ds).map((g) => g.name), m, to) })); }} />;
  }
  const alt = (k: string, altKey = true) => new KeyboardEvent('keydown', { key: k, altKey, bubbles: true, cancelable: true });
  const names = () => Array.from(document.querySelectorAll('[data-scope]')).map((el) => el.getAttribute('data-scope'));
  document.body.innerHTML = '<div id="root"></div>';
  const root = createRoot(document.getElementById('root')!);
  await act(async () => root.render(<Strip />));
  const alpha = () => document.querySelector<HTMLElement>('[data-scope="account:X0001111"]')!;
  await act(async () => alpha().focus());
  // the first account cannot go further left, but the key is still taken (not the browser's back)
  const edge = alt('ArrowLeft');
  await act(async () => { alpha().dispatchEvent(edge); });
  expect(edge.defaultPrevented).toBe(true);
  expect(moves).toEqual([]);
  // a plain arrow and Alt+arrow on the checkbox inside are not the chip's
  await act(async () => { alpha().dispatchEvent(alt('ArrowRight', false)); });
  await act(async () => { alpha().querySelector('input')!.dispatchEvent(alt('ArrowRight')); });
  expect(moves).toEqual([]);
  await act(async () => { alpha().dispatchEvent(alt('ArrowRight')); });
  expect(moves).toEqual(['X0002222>X0001111']);
  expect(names()).toEqual(['all', 'group:Investment', 'account:X0002222', 'account:X0001111', 'group:Retirement', 'account:X0003333']);
  expect(document.activeElement).toBe(alpha());
  // the last account of a group does not jump into the next group
  await act(async () => { alpha().dispatchEvent(alt('ArrowRight')); });
  expect(moves).toEqual(['X0002222>X0001111']);
  const retirement = () => document.querySelector<HTMLElement>('[data-scope="group:Retirement"]')!;
  // the account chip losing the focus draws the strip again (the kept focus is let go)
  await act(async () => retirement().focus());
  await act(async () => { retirement().dispatchEvent(alt('ArrowLeft')); });
  expect(moves).toEqual(['X0002222>X0001111', 'Retirement>Investment']);
  expect(names()).toEqual(['all', 'group:Retirement', 'account:X0003333', 'group:Investment', 'account:X0002222', 'account:X0001111']);
  expect(document.activeElement).toBe(retirement());
  // All accounts stays first: no move on it
  const all = document.querySelector<HTMLElement>('[data-scope="all"]')!;
  const still = alt('ArrowRight');
  await act(async () => { all.dispatchEvent(still); });
  expect(still.defaultPrevented).toBe(false);
  expect(moves.length).toBe(2);
  await act(async () => root.unmount());
});

test('useKeepFocus gives the focus back to the kept item after a new order, and only then', async () => {
  const { act, useRef } = await import('react');
  const { createRoot } = await import('react-dom/client');
  const { useKeepFocus } = await import('./useKeepFocus');
  let keep: (id: string | null) => void = () => {};
  function List({ order }: { order: string[] }) {
    const root = useRef<HTMLDivElement>(null);
    keep = useKeepFocus(root, 'data-id', order);
    return <div ref={root}>{order.map((id) => <button key={id} data-id={id}>{id}</button>)}<button id="elsewhere" /></div>;
  }
  document.body.innerHTML = '<div id="root"></div>';
  const root = createRoot(document.getElementById('root')!);
  const a = ['a', 'b'];
  await act(async () => root.render(<List order={a} />));
  await act(async () => keep('a'));
  expect(document.activeElement?.getAttribute('data-id')).toBe('a');
  // a moved node can lose the focus in a browser; the next order brings it back
  const elsewhere = document.getElementById('elsewhere')!;
  await act(async () => elsewhere.focus());
  await act(async () => root.render(<List order={['b', 'a']} />));
  expect(document.activeElement?.getAttribute('data-id')).toBe('a');
  // let go (the item lost the focus): a later order leaves the focus where it is
  await act(async () => keep(null));
  await act(async () => elsewhere.focus());
  await act(async () => root.render(<List order={['a', 'b']} />));
  expect(document.activeElement).toBe(elsewhere);
  await act(async () => root.unmount());
});

test('an account\'s beta is a button named in words that opens its breakdown and gets the focus back', async () => {
  const { act } = await import('react');
  const { createRoot } = await import('react-dom/client');
  const { AccountBeta } = await import('./BetaBreakdown');
  const { betaBreakdown } = await import('../../shared/beta');
  // made-up positions: a stock with a beta, a bond without one, cash
  const pos = (kind: 'position' | 'core', symbol: string, currentValue: number) => ({ account: 'X1', kind, symbol, description: `${symbol} name`, currentValue, fields: {} });
  const breakdown = betaBreakdown([pos('position', 'AAA', 600), pos('position', '912828ZZ9', 300), pos('core', 'MMM', 100)], { AAA: { beta: 1.4, source: 'stock5y', asOf: '2026-11-25T15:00:00.000Z' } });
  document.body.innerHTML = '<div id="root"></div>';
  const root = createRoot(document.getElementById('root')!);
  await act(async () => root.render(<AccountBeta name="Made-up account" breakdown={breakdown} />));
  const button = document.querySelector<HTMLButtonElement>('[data-beta-button]')!;
  expect(button.getAttribute('aria-haspopup')).toBe('dialog');
  expect(button.querySelector('.sr-only')!.textContent).toBe('Beta 1.20');
  expect(button.querySelector('[aria-hidden="true"]')!.textContent).toBe('1.20β');
  // 700 of 1000 has a beta: the line under the number says 70%
  expect(document.querySelector('[data-beta-coverage]')!.textContent).toBe('70%');
  button.focus();
  await act(async () => button.click());
  const dialog = document.querySelector('[role="dialog"]')!;
  expect(dialog.getAttribute('aria-label')).toBe('Made-up account, beta 1.20');
  expect(Array.from(dialog.querySelectorAll('[data-beta-row]')).map((r) => r.getAttribute('data-beta-row'))).toEqual(['stock5y', 'cash', 'none']);
  expect(dialog.querySelector('[data-beta-totals]')!.textContent).toBe('Beta 1.20, covers 70.00% of the value; positions without a beta: 1');
  await act(async () => { window.dispatchEvent(key('Escape')); });
  expect(document.activeElement).toBe(button);
  await act(async () => root.unmount());
});
