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

test('the stylesheet animates the way in and the way out, and not at all with reduced motion', () => {
  const css = readFileSync(join(__dirname, '..', 'index.css'), 'utf8');
  expect(css).toMatch(/@keyframes notice-in\s*\{\s*from\s*\{\s*opacity:\s*0/);
  expect(css).toMatch(/\.notice\s*\{[^}]*animation:\s*notice-in \.3s[^}]*transition:\s*opacity \.3s/);
  expect(css).toMatch(/\.notice\.out\s*\{[^}]*opacity:\s*0/);
  expect(css).toMatch(/prefers-reduced-motion: reduce\)\s*\{\s*\.notice\s*\{\s*animation: none; transition: none;/);
});
