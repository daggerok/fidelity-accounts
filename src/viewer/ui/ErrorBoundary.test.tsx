/// <reference types="bun" />
/// <reference types="node" />
/// <reference lib="esnext" />
// A screen that throws shows the error with Reset view and Full reset instead of a blank page, and a new copy of the
// data (another resetKey) draws the screen again
import { afterAll, beforeAll, expect, test } from 'bun:test';
import { GlobalRegistrator } from '@happy-dom/global-registrator';

beforeAll(() => {
  GlobalRegistrator.register({ url: 'https://daggerok.github.io/fidelity-accounts/' });
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterAll(() => GlobalRegistrator.unregister());

test('a throwing child renders the fallback with both resets; a new resetKey draws the child again', async () => {
  const { act } = await import('react');
  const { createRoot } = await import('react-dom/client');
  const { ErrorBoundary } = await import('./ErrorBoundary');
  let broken = true;
  function Screen() {
    if (broken) throw new Error('bad row');
    return <p data-screen>fine</p>;
  }
  const quiet = console.error;
  console.error = () => { /* React and the boundary log the expected error */ };
  try {
    document.body.innerHTML = '<div id="root"></div>';
    const root = createRoot(document.getElementById('root')!);
    await act(async () => root.render(<ErrorBoundary resetKey="a"><Screen /></ErrorBoundary>));
    const fallback = document.querySelector('[data-error-boundary]');
    expect(fallback?.textContent).toContain('bad row');
    expect(document.querySelector('[data-resets]')).not.toBeNull();
    expect(document.querySelector('[data-reset="view"]')).not.toBeNull();
    expect(document.querySelector('[data-full-reset-switch]')).not.toBeNull();
    expect(document.querySelector('[data-screen]')).toBeNull();
    broken = false;
    await act(async () => root.render(<ErrorBoundary resetKey="a"><Screen /></ErrorBoundary>));
    expect(document.querySelector('[data-error-boundary]')).not.toBeNull();
    await act(async () => root.render(<ErrorBoundary resetKey="b"><Screen /></ErrorBoundary>));
    expect(document.querySelector('[data-error-boundary]')).toBeNull();
    expect(document.querySelector('[data-screen]')?.textContent).toBe('fine');
    await act(async () => root.unmount());
  } finally {
    console.error = quiet;
  }
});
