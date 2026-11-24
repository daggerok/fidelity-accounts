/// <reference types="bun" />
/// <reference types="node" />
/// <reference lib="esnext" />
// A masked settings value is shown only by 👁: a click or focus on the dots keeps it hidden (owner 2026-11-22)
import { afterAll, beforeAll, expect, test } from 'bun:test';
import { GlobalRegistrator } from '@happy-dom/global-registrator';

beforeAll(() => {
  GlobalRegistrator.register({ url: 'https://daggerok.github.io/fidelity-accounts/' });
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterAll(() => GlobalRegistrator.unregister());

test('click and focus keep the dots, 👁 shows the value for editing and hides it again', async () => {
  const { act } = await import('react');
  const { createRoot } = await import('react-dom/client');
  const { MaskedField } = await import('./MaskedField');
  const secret = '1234567890-abcdefghijk.apps.googleusercontent.com';
  document.body.innerHTML = '<div id="root"></div>';
  const root = createRoot(document.getElementById('root')!);
  await act(async () => root.render(<MaskedField label="Client ID" value={secret} mask={(v) => `${v.slice(0, 4)}••••`} placeholder="" onChange={() => {}} />));
  const input = () => document.querySelector<HTMLInputElement>('input')!;
  const eye = () => document.querySelector<HTMLButtonElement>('button')!;
  expect(input().value).toBe('1234••••');
  await act(async () => { input().click(); input().focus(); });
  expect(input().value).toBe('1234••••');
  expect(input().readOnly).toBe(true);
  await act(async () => eye().click());
  expect(input().value).toBe(secret);
  expect(input().readOnly).toBe(false);
  await act(async () => eye().click());
  expect(input().value).toBe('1234••••');
  await act(async () => root.unmount());
});

test('an empty field takes typing at once and stays editable while typed in; dots come back once it is left', async () => {
  const { act, useState } = await import('react');
  const { createRoot } = await import('react-dom/client');
  const { MaskedField } = await import('./MaskedField');
  function Host() {
    const [v, setV] = useState('');
    return <MaskedField label="Client ID" value={v} mask={(x) => `${x.slice(0, 2)}••`} placeholder="paste here" onChange={setV} />;
  }
  document.body.innerHTML = '<div id="root"></div>';
  const root = createRoot(document.getElementById('root')!);
  await act(async () => root.render(<Host />));
  const input = () => document.querySelector<HTMLInputElement>('input')!;
  expect(input().readOnly).toBe(false);
  const typeInto = (el: HTMLInputElement, value: string) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };
  await act(async () => { input().focus(); });
  await act(async () => { typeInto(input(), 'a'); });
  expect(input().readOnly).toBe(false);
  await act(async () => { typeInto(input(), 'abc'); });
  expect(input().value).toBe('abc');
  expect(document.activeElement).toBe(input());
  await act(async () => { input().blur(); });
  expect(input().value).toBe('ab••');
  expect(input().readOnly).toBe(true);
  await act(async () => root.unmount());
});
