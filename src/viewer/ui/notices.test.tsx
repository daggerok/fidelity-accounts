/// <reference types="bun" />
/// <reference types="node" />
/// <reference lib="esnext" />
// The 🔔 popups come and go with an animation (owner 2026-11-25: "make sure we have animation for appear/disappear"): a
// popup is drawn with the animated class, ✕ first marks it as leaving (the way out in index.css) and only then, after
// the fade, it leaves the list; the stylesheet really animates both ways
import { afterAll, beforeAll, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GlobalRegistrator } from '@happy-dom/global-registrator';

beforeAll(() => {
  GlobalRegistrator.register({ url: 'https://daggerok.github.io/fidelity-accounts/' });
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterAll(() => GlobalRegistrator.unregister());

const wait = (ms: number) => new Promise((resolve) => { setTimeout(resolve, ms); });

test('a popup appears animated, fades out on ✕ and leaves only after the fade', async () => {
  const { act } = await import('react');
  const { createRoot } = await import('react-dom/client');
  const { NOTICE_FADE_MS, Notices } = await import('./Notices');
  const { notices } = await import('../app/data');
  document.body.innerHTML = '<div id="root"></div>';
  const root = createRoot(document.getElementById('root')!);
  await act(async () => { root.render(<Notices />); });
  await act(async () => { notices.set([{ at: 1, level: 'error', text: 'Failed positions update', words: [{ key: 'Failed positions update' }, { key: '{error}', params: { error: 'no grid' } }] }]); });
  const popup = document.querySelector('[data-notice]')!;
  expect(popup.classList.contains('notice')).toBe(true);
  expect(popup.classList.contains('out')).toBe(false);
  // the operation in bold on the first line, the details under it
  const rows = Array.from(popup.querySelectorAll('[data-notice-lines] > span'));
  expect(rows.map((r) => r.textContent)).toEqual(['Failed positions update', 'no grid']);
  expect(rows[0]!.className).toContain('font-bold');
  expect(rows[1]!.className).not.toContain('font-bold');

  await act(async () => { popup.querySelector('button')!.click(); });
  const leaving = document.querySelector('[data-notice]')!;
  expect(leaving.classList.contains('out')).toBe(true); // still drawn, fading
  expect(notices.get()).toHaveLength(1);
  await act(async () => { await wait(NOTICE_FADE_MS + 50); });
  expect(document.querySelector('[data-notice]')).toBeNull();
  expect(notices.get()).toHaveLength(0);
  await act(async () => { root.unmount(); });
});

test('a click elsewhere on the page closes a popup, but not in its first 2 seconds and not a click on it', async () => {
  const { act } = await import('react');
  const { createRoot } = await import('react-dom/client');
  const { Notices } = await import('./Notices');
  const { notices } = await import('../app/data');
  const { NOTICE_CLICK_AWAY_MS } = await import('../../shared/notice');
  document.body.innerHTML = '<div id="root"></div><button id="elsewhere">x</button>';
  const root = createRoot(document.getElementById('root')!);
  const realNow = Date.now;
  let now = 1_000_000;
  Date.now = () => now;
  try {
    await act(async () => { root.render(<Notices />); });
    await act(async () => { notices.set([{ at: 2, level: 'error', text: 'Failed positions update' }]); });
    const down = (el: Element) => el.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    now += NOTICE_CLICK_AWAY_MS - 1;
    await act(async () => { down(document.getElementById('elsewhere')!); });
    expect(document.querySelector('[data-notice]')!.classList.contains('out')).toBe(false); // too early
    now += 1;
    await act(async () => { down(document.querySelector('[data-notice-lines]')!); });
    expect(document.querySelector('[data-notice]')!.classList.contains('out')).toBe(false); // a click on the popup
    await act(async () => { down(document.getElementById('elsewhere')!); });
    expect(document.querySelector('[data-notice]')!.classList.contains('out')).toBe(true); // fading out
  } finally {
    Date.now = realNow;
    await act(async () => { notices.set([]); });
    await act(async () => { root.unmount(); });
  }
});

test('Esc closes a popup at once, with no wait', async () => {
  const { act } = await import('react');
  const { createRoot } = await import('react-dom/client');
  const { Notices } = await import('./Notices');
  const { notices } = await import('../app/data');
  document.body.innerHTML = '<div id="root"></div>';
  const root = createRoot(document.getElementById('root')!);
  await act(async () => { root.render(<Notices />); });
  await act(async () => { notices.set([{ at: 3, level: 'ok', text: 'Positions updated' }]); });
  await act(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true })); });
  expect(document.querySelector('[data-notice]')!.classList.contains('out')).toBe(false); // another key
  await act(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
  expect(document.querySelector('[data-notice]')!.classList.contains('out')).toBe(true);
  await act(async () => { notices.set([]); });
  await act(async () => { root.unmount(); });
});

test('with a ⤢ window open the first Esc closes the popups only, the next one the window', async () => {
  const { act, useState } = await import('react');
  const { createRoot } = await import('react-dom/client');
  const { Notices } = await import('./Notices');
  const { Zoom } = await import('./Zoom');
  const { notices } = await import('../app/data');
  (Element.prototype as unknown as { animate?: unknown }).animate = undefined;
  let closed = 0;
  function Page() {
    const [open, setOpen] = useState(true);
    return <div><Notices /><Zoom open={open} title="T" onClose={() => { closed += 1; setOpen(false); }}><button>x</button></Zoom></div>;
  }
  document.body.innerHTML = '<div id="root"></div>';
  const root = createRoot(document.getElementById('root')!);
  await act(async () => { root.render(<Page />); });
  await act(async () => { notices.set([{ at: 4, level: 'error', text: 'one' }, { at: 5, level: 'ok', text: 'two' }]); });
  // the popup that came last is on top and moved the earlier one down
  expect(Array.from(document.querySelectorAll('[data-notice-lines]')).map((el) => el.textContent)).toEqual(['two', 'one']);
  const esc = () => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  await act(async () => { esc(); });
  expect(Array.from(document.querySelectorAll('[data-notice]')).map((el) => el.classList.contains('out'))).toEqual([true, true]); // both popups
  expect(closed).toBe(0); // the window stays
  await act(async () => { esc(); });
  expect(closed).toBe(1); // no popup left to take the key
  await act(async () => { notices.set([]); });
  await act(async () => { root.unmount(); });
});

test('the pointer over a success popup holds it; it gets its whole time again after the pointer leaves', async () => {
  const { act } = await import('react');
  const { createRoot } = await import('react-dom/client');
  const { Notices } = await import('./Notices');
  const { notices } = await import('../app/data');
  const { NOTICE_OK_MS } = await import('../../shared/notice');
  // the timers of this test only: the time a success stays is asked for, the fade is not reached
  const realSet = globalThis.setTimeout;
  const realClear = globalThis.clearTimeout;
  const pending = new Map<number, () => void>();
  let ids = 1_000_000;
  (globalThis as { setTimeout: unknown }).setTimeout = ((fn: () => void, ms?: number) => { if (ms !== NOTICE_OK_MS) return realSet(fn, ms); ids += 1; pending.set(ids, fn); return ids; }) as unknown;
  (globalThis as { clearTimeout: unknown }).clearTimeout = ((id: unknown) => { if (typeof id === 'number' && pending.has(id)) pending.delete(id); else realClear(id as ReturnType<typeof realSet>); }) as unknown;
  document.body.innerHTML = '<div id="root"></div>';
  const root = createRoot(document.getElementById('root')!);
  try {
    await act(async () => { root.render(<Notices />); });
    await act(async () => { notices.set([{ at: 6, level: 'ok', text: 'Positions updated' }]); });
    expect(pending.size).toBe(1); // counting down
    const popup = document.querySelector('[data-notice]')!;
    await act(async () => { popup.dispatchEvent(new Event('pointerover', { bubbles: true })); });
    expect(pending.size).toBe(0); // held: nothing will close it
    expect(popup.getAttribute('data-held')).toBe('true');
    await act(async () => { popup.dispatchEvent(new Event('pointerout', { bubbles: true })); });
    expect(pending.size).toBe(1); // the whole time again
    await act(async () => { Array.from(pending.values()).forEach((fn) => fn()); });
    expect(document.querySelector('[data-notice]')!.classList.contains('out')).toBe(true);
  } finally {
    (globalThis as { setTimeout: unknown }).setTimeout = realSet;
    (globalThis as { clearTimeout: unknown }).clearTimeout = realClear;
    await act(async () => { notices.set([]); });
    await act(async () => { root.unmount(); });
  }
});

test('a popup that comes on top makes the earlier one slide down from its old place', async () => {
  const { act } = await import('react');
  const { createRoot } = await import('react-dom/client');
  const { Notices } = await import('./Notices');
  const { notices } = await import('../app/data');
  // this DOM has no layout: a slot stands 62 px under the one before it; every slide asked for is written down
  const proto = Element.prototype as unknown as { getBoundingClientRect: () => { top: number }; animate?: unknown };
  const realRect = proto.getBoundingClientRect;
  const realAnimate = proto.animate;
  const slides: { text: string | null; from: string }[] = [];
  proto.getBoundingClientRect = function rect(this: Element) { return { top: Array.from(document.querySelectorAll('[data-notice-slot]')).indexOf(this) * 62 }; };
  proto.animate = function animate(this: Element, frames: { transform: string }[]) { slides.push({ text: this.textContent, from: frames[0]!.transform }); };
  document.body.innerHTML = '<div id="root"></div>';
  const root = createRoot(document.getElementById('root')!);
  try {
    await act(async () => { root.render(<Notices />); });
    await act(async () => { notices.set([{ at: 7, level: 'error', text: 'first' }]); });
    expect(slides).toEqual([]); // a new popup only fades in
    await act(async () => { notices.set(notices.get().concat({ at: 8, level: 'error', text: 'second' })); });
    expect(slides).toEqual([{ text: 'first✕', from: 'translateY(-62px)' }]); // it starts where it was and slides down
    await act(async () => { notices.set(notices.get().filter((n) => n.text !== 'second')); });
    expect(slides[1]).toEqual({ text: 'first✕', from: 'translateY(62px)' }); // and back up when the one above leaves
  } finally {
    proto.getBoundingClientRect = realRect;
    proto.animate = realAnimate;
    await act(async () => { notices.set([]); });
    await act(async () => { root.unmount(); });
  }
});

test('the stylesheet animates the way in and the way out, and not at all with reduced motion', () => {
  const css = readFileSync(join(__dirname, '..', 'index.css'), 'utf8');
  expect(css).toMatch(/@keyframes notice-in\s*\{\s*from\s*\{\s*opacity:\s*0/);
  expect(css).toMatch(/\.notice\s*\{[^}]*animation:\s*notice-in \.3s[^}]*transition:\s*opacity \.3s/);
  expect(css).toMatch(/\.notice\.out\s*\{[^}]*opacity:\s*0/);
  expect(css).toMatch(/prefers-reduced-motion: reduce\)\s*\{\s*\.notice\s*\{\s*animation: none; transition: none;/);
});
