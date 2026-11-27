/// <reference lib="esnext" />
// A tiny in-memory Sheets v4 for the tests (moved out of client.test.ts so the sync and userscript tests write to the
// same fake): tabs with a grid row count, values by row; enough for the calls the client makes. Each call is kept with
// the size of its body, so a test can count the requests and the bytes a write sends
import type { FetchLike } from './client';

export type FakeTab = { sheetId: number; rows: number; frozen: number; values: unknown[][] };
export type FakeCall = { method: string; url: string; body: unknown; auth: string; bytes: number };

export function fakeSheets(opts: { expiredTokens?: string[]; gridRows?: number } = {}) {
  const tabs: Record<string, FakeTab> = {};
  const calls: FakeCall[] = [];
  // a request that fails once with this status when the test sets it (a write cut short)
  const failures: Array<{ when: (c: FakeCall) => boolean; status: number }> = [];
  let nextId = 1;
  const json = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  const rangeOf = (url: string): { tab: string; r1: number; r2: number } => {
    const m = /\/values\/([^?:]+)/.exec(url);
    const a1 = decodeURIComponent(m ? m[1]! : '');
    // whole tab ("'fidelity_rate'") and whole rows ("'fidelity_rate'!1:1"), as the client uses for old layouts
    if (a1.indexOf('!') === -1) return { tab: a1.replace(/^'|'$/g, ''), r1: 1, r2: -1 };
    const rows = /^(.+)!(\d+):(\d+)$/.exec(a1);
    if (rows) return { tab: rows[1]!.replace(/^'|'$/g, ''), r1: Number(rows[2]), r2: Number(rows[3]) };
    const p = /^(.+)!([A-Z]+)(\d+)(?::([A-Z]+)(\d*))?$/.exec(a1);
    if (!p) throw new Error('bad range ' + a1);
    return { tab: p[1]!.replace(/^'|'$/g, ''), r1: Number(p[3]), r2: p[5] ? Number(p[5]) : Infinity };
  };
  const fetch: FetchLike = async (url, init) => {
    const method = (init && init.method) || 'GET';
    const headers = (init && init.headers) as Record<string, string>;
    const auth = headers.Authorization!;
    const raw = init && typeof init.body === 'string' ? init.body : '';
    const body: unknown = raw ? JSON.parse(raw) : undefined;
    const call: FakeCall = { method, url, body, auth, bytes: raw.length };
    calls.push(call);
    if ((opts.expiredTokens || []).some((t) => auth === 'Bearer ' + t)) return json(401, { error: { message: 'Request had invalid authentication credentials.' } });
    const failing = failures.findIndex((f) => f.when(call));
    if (failing !== -1) {
      const f = failures.splice(failing, 1)[0]!;
      return json(f.status, { error: { message: 'The service is currently unavailable.' } });
    }
    if (method === 'GET' && /\/spreadsheets\/[^/]+\?fields=/.test(url)) {
      return json(200, {
        properties: { title: 'Book' },
        sheets: Object.keys(tabs).map((t) => ({ properties: { title: t, sheetId: tabs[t]!.sheetId, gridProperties: { rowCount: tabs[t]!.rows, frozenRowCount: tabs[t]!.frozen || undefined } } })),
      });
    }
    if (method === 'POST' && url.endsWith(':batchUpdate')) {
      const req = (body as { requests: Record<string, { properties: { title?: string; sheetId?: number; gridProperties?: { frozenRowCount?: number } } }>[] }).requests[0]!;
      const grow = (req as unknown as { appendDimension?: { sheetId: number; dimension: string; length: number } }).appendDimension;
      if (grow) {
        Object.keys(tabs).forEach((t) => { if (tabs[t]!.sheetId === grow.sheetId) tabs[t]!.rows += grow.length; });
        return json(200, { replies: [{}] });
      }
      if (req.addSheet) {
        const title = req.addSheet.properties.title || '';
        if (tabs[title]) return json(400, { error: { message: 'A sheet with the name "' + title + '" already exists.' } });
        tabs[title] = { sheetId: nextId++, rows: opts.gridRows || 1000, frozen: (req.addSheet.properties.gridProperties || {}).frozenRowCount || 0, values: [] };
        return json(200, { replies: [{ addSheet: { properties: { title, sheetId: tabs[title]!.sheetId, gridProperties: { rowCount: tabs[title]!.rows, frozenRowCount: tabs[title]!.frozen } } } }] });
      }
      if (req.updateSheetProperties) {
        const id = req.updateSheetProperties.properties.sheetId;
        Object.keys(tabs).forEach((t) => { if (tabs[t]!.sheetId === id) tabs[t]!.frozen = 1; });
        return json(200, { replies: [{}] });
      }
    }
    if (url.indexOf('/values/') !== -1) {
      const r = rangeOf(url);
      const tab = tabs[r.tab];
      if (!tab) return json(400, { error: { message: 'Unable to parse range: ' + r.tab } });
      if (method === 'PUT') {
        const values = (body as { values: unknown[][] }).values;
        // like the real API: a range that starts inside the grid grows it, one that starts past its last row is refused
        if (r.r1 > tab.rows) return json(400, { error: { message: `Range (${r.tab}!A${r.r1}) exceeds grid limits. Max rows: ${tab.rows}` } });
        // like the real API: only the cells of the range change, cells to the right of it stay (ranges start at A)
        values.forEach((row, i) => { const next = (tab.values[r.r1 - 1 + i] || []).slice(); row.forEach((v, j) => { next[j] = v; }); tab.values[r.r1 - 1 + i] = next; });
        tab.rows = Math.max(tab.rows, r.r1 - 1 + values.length);
        return json(200, { updatedRows: values.length });
      }
      if (method === 'POST' && url.indexOf(':clear') !== -1) {
        if (r.r2 === -1) { tab.values = []; return json(200, {}); }
        if (r.r2 > tab.rows) return json(400, { error: { message: 'Range exceeds grid limits' } });
        for (let i = r.r1 - 1; i < Math.min(r.r2, tab.values.length); i++) tab.values[i] = [];
        return json(200, {});
      }
      if (method === 'GET') {
        const rows = tab.values.slice(r.r1 - 1);
        while (rows.length && !(rows[rows.length - 1] || []).length) rows.pop();
        return json(200, rows.length ? { values: rows.map((x) => x || []) } : {});
      }
    }
    return json(404, { error: { message: 'Requested entity was not found.' } });
  };
  return { tabs, calls, fetch, failures };
}

/** what a reader of the sheet sees: each tab's rows with trailing empty cells and empty rows at the end dropped */
export function sheetState(tabs: Record<string, FakeTab>): Record<string, unknown[][]> {
  const out: Record<string, unknown[][]> = {};
  Object.keys(tabs).sort().forEach((t) => {
    const rows = tabs[t]!.values.map((r) => {
      const row = (r || []).slice();
      while (row.length && (row[row.length - 1] === undefined || row[row.length - 1] === '')) row.pop();
      return row;
    });
    while (rows.length && !rows[rows.length - 1]!.length) rows.pop();
    out[t] = rows;
  });
  return out;
}
