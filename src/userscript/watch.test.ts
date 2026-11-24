/// <reference types="bun" />
/// <reference types="node" />
/// <reference lib="esnext" />
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, beforeAll, expect, test } from 'bun:test';

beforeAll(() => GlobalRegistrator.register({ url: 'https://digital.fidelity.com/ftgw/digital/portfolio/positions' }));
afterAll(() => GlobalRegistrator.unregister());

test('reads: always when asked or first on the page; while watching every 30 s; otherwise not again', async () => {
  const { acceptRead, WATCH_READ_GAP_MS } = await import('./watch');
  const now = 1_000_000;
  expect(acceptRead({ asked: false, watching: false, now, lastRead: 0 })).toBe(true);
  expect(acceptRead({ asked: false, watching: false, now, lastRead: now - 3_600_000 })).toBe(false);
  expect(acceptRead({ asked: true, watching: false, now, lastRead: now - 1 })).toBe(true);
  expect(acceptRead({ asked: false, watching: true, now, lastRead: now - 10_000 })).toBe(false);
  expect(acceptRead({ asked: false, watching: true, now, lastRead: now - WATCH_READ_GAP_MS })).toBe(true);
});

test('sheets: every read when not watching, at most every 10 minutes while watching', async () => {
  const { sheetsDue, WATCH_SHEETS_GAP_MS } = await import('./watch');
  const now = 10_000_000;
  expect(sheetsDue({ asked: false, watching: false, now, lastWrite: now - 1 })).toBe(true);
  expect(sheetsDue({ asked: false, watching: true, now, lastWrite: now - 60_000 })).toBe(false);
  expect(sheetsDue({ asked: false, watching: true, now, lastWrite: now - WATCH_SHEETS_GAP_MS })).toBe(true);
  expect(sheetsDue({ asked: true, watching: true, now, lastWrite: now - 1 })).toBe(true);
});

test('the refresh button is found by its accessible name only', async () => {
  const { findRefreshButton } = await import('./watch');
  document.body.innerHTML = '<button aria-label="Trade">Trade</button><button aria-label="Refresh Positions"><svg></svg></button>';
  expect(findRefreshButton(document)?.getAttribute('aria-label')).toBe('Refresh Positions');
  document.body.innerHTML = '<button>Refresh positions</button>';
  expect(findRefreshButton(document)?.textContent).toBe('Refresh positions');
  document.body.innerHTML = '<button aria-label="Buy">Buy</button>';
  expect(findRefreshButton(document)).toBeNull();
});
