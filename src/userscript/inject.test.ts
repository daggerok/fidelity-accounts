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
