/// <reference types="bun" />
/// <reference lib="esnext" />
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, beforeAll, expect, test } from 'bun:test';
import { PAGE_TAG, askGrid, pageReader } from './inject';

beforeAll(() => { GlobalRegistrator.register({ url: 'https://digital.fidelity.com/ftgw/digital/portfolio/positions' }); });
afterAll(async () => { await GlobalRegistrator.unregister(); });

// a rendered ag-grid row as the page keeps it: the grid api hangs on an own __AG_* property of the row element
function gridRow(data: Array<Record<string, unknown>>): { forEachNode: (fn: (n: { data?: Record<string, unknown> }) => void) => void } {
  const api = { forEachNode: (fn: (n: { data?: Record<string, unknown> }) => void) => data.forEach((d) => fn({ data: d })) };
  const el = document.createElement('div');
  el.className = 'ag-row';
  Object.defineProperty(el, '__AG_1', { value: { renderedRow: { beans: { gridApi: api } } }, enumerable: false });
  document.body.appendChild(el);
  return api;
}

test('of several grids on the page the one whose rows say their kind is read, wherever it stands', async () => {
  gridRow([{ lot: 1 }, { lot: 2 }, { lot: 3 }]); // another grid first in the page
  gridRow([{ rowType: 'ACCOUNT', actNum: 'X1' }, { rowType: 'POSITION', actNum: 'X1' }]);
  const got = new Promise<string>((resolve) => window.addEventListener('message', (e) => { if (e.data && e.data.source === PAGE_TAG && e.data.type === 'grid') resolve(e.data.json as string); }));
  pageReader(PAGE_TAG);
  askGrid();
  expect((JSON.parse(await got) as Array<{ rowType?: string }>).map((r) => r.rowType)).toEqual(['ACCOUNT', 'POSITION']);
});

// what the page reader posts within a moment after it is asked: the kinds of the rows, or null when it stays silent
async function asked(): Promise<Array<string | undefined> | null> {
  let json: string | null = null;
  const on = (e: MessageEvent) => { if (e.data && e.data.source === PAGE_TAG && e.data.type === 'grid') json = e.data.json as string; };
  window.addEventListener('message', on);
  askGrid();
  await new Promise((r) => setTimeout(r, 60));
  window.removeEventListener('message', on);
  return json === null ? null : (JSON.parse(json) as Array<{ rowType?: string }>).map((r) => r.rowType);
}

test('a table of another kind is never read as positions: an activity grid alone is left alone', async () => {
  document.body.innerHTML = '';
  gridRow([{ acctNum: 'X1', amtDetail: {}, brokerageDetail: {} }, { acctNum: 'X1', amtDetail: {}, brokerageDetail: {} }]);
  pageReader(PAGE_TAG);
  expect(await asked()).toBeNull();
  // rows that lost their kind but still look like positions go out, so the contract check can say what changed
  gridRow([{ actNum: 'X1', sym: 'AAA' }]);
  expect(await asked()).toEqual([undefined]);
});

test('nothing is read on another page: Fidelity changes pages without a reload', async () => {
  document.body.innerHTML = '';
  gridRow([{ rowType: 'POSITION', actNum: 'X1' }]);
  pageReader(PAGE_TAG);
  expect(await asked()).toEqual(['POSITION']);
  (window as unknown as { happyDOM: { setURL: (url: string) => void } }).happyDOM.setURL('https://digital.fidelity.com/ftgw/digital/portfolio/activity');
  expect(await asked()).toBeNull();
  (window as unknown as { happyDOM: { setURL: (url: string) => void } }).happyDOM.setURL('https://digital.fidelity.com/ftgw/digital/portfolio/positions');
  expect(await asked()).toEqual(['POSITION']);
});
