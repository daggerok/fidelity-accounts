/// <reference types="bun" />
/// <reference types="node" />
/// <reference lib="esnext" />
import { describe, expect, test } from 'bun:test';
import { CHUNK_CHARS, SheetsClient, chunkPrintsOf, type ChunkPrint } from './client';
import { fakeSheets, type FakeCall } from './fake-sheets';
import { TRANSACTIONS as FIDELITY_TRANSACTIONS, columnLetter, defineTab, growHeader, wideSpec } from './tabs';
import type { Txn } from '../transactions';

// a record shape of 11 columns (A..K) for the generic client tests (the client knows nothing about fidelity data)
interface Transaction { id: string; activityDate: string; payCheckDate?: string; fund: string; source?: string; type: string; rawType: string; units?: number; price?: number; amount: number; origin: string }
const TABS = {
  tx: defineTab<Transaction>('fidelity_tx', [
    { key: 'activityDate', kind: 'text' },
    { key: 'payCheckDate', kind: 'text', optional: true },
    { key: 'fund', kind: 'text' },
    { key: 'source', kind: 'text', optional: true },
    { key: 'type', kind: 'text' },
    { key: 'rawType', kind: 'text' },
    { key: 'units', kind: 'num', optional: true },
    { key: 'price', kind: 'num', optional: true },
    { key: 'amount', kind: 'cents' },
    { key: 'origin', kind: 'text' },
  ], (r) => r.id, 'id'),
  fund: defineTab<{ name: string }>('fidelity_fund', [{ key: 'name', kind: 'text' }], (r) => r.name),
};

// a small tab for layout tests
const RATE = defineTab<{ date: string; rothPct: number; preTaxPct: number }>('fidelity_rate', [
  { key: 'date', kind: 'text' },
  { key: 'rothPct', kind: 'num' },
  { key: 'preTaxPct', kind: 'num' },
], (r) => r.date);

const tx = (n: number, amount = n * 100): Transaction => ({
  id: 'tx-' + n, activityDate: '2026-01-0' + n, fund: 'Fund', type: 'contribution', rawType: 'Contribution', amount, origin: 'txPrint',
});

function client(fake: ReturnType<typeof fakeSheets>, tokens: string[] = ['t1']) {
  const asked: boolean[] = [];
  let i = 0;
  const c = new SheetsClient({
    fetch: fake.fetch,
    getToken: async (force) => { asked.push(force); if (force) i += 1; return tokens[Math.min(i, tokens.length - 1)]; },
    spreadsheetId: 'book',
  });
  return { c, asked };
}

describe('SheetsClient', () => {
  test('ensureTab creates the tab with a frozen header row', async () => {
    const fake = fakeSheets();
    const { c } = client(fake);
    const tab = await c.ensureTab(TABS.tx);
    expect(tab.title).toBe('fidelity_tx');
    expect(fake.tabs.fidelity_tx.frozen).toBe(1);
    expect(fake.tabs.fidelity_tx.values[0]).toEqual(TABS.tx.columns);
    const put = fake.calls.filter((x) => x.method === 'PUT')[0];
    expect(put.url).toContain('valueInputOption=RAW');
    // a second call keeps the tab; the header already holds these columns, so it is not written again
    await c.ensureTab(TABS.tx);
    expect(fake.calls.filter((x) => x.url.endsWith(':batchUpdate'))).toHaveLength(1);
    expect(fake.calls.filter((x) => x.method === 'PUT')).toHaveLength(1);
  });

  test('a tab with another header is never cleared: writing stops with a clear error', async () => {
    const fake = fakeSheets();
    fake.tabs.fidelity_rate = { sheetId: 7, rows: 10, frozen: 1, values: [['id', 'date', 'roth_pct', 'pre_tax_pct'], ['2026-01-01', '2026-01-01', 4, 0]] };
    const { c } = client(fake);
    await expect(c.upsertById(RATE, [{ date: '2026-02-01', rothPct: 6, preTaxPct: 0 }])).rejects.toThrow('header differs');
    expect(fake.tabs.fidelity_rate.values[1]).toEqual(['2026-01-01', '2026-01-01', 4, 0]);
    expect(fake.calls.some((x) => x.url.indexOf(':clear') !== -1)).toBe(false);
  });

  test('extra columns on the right (the owner\'s notes) are kept', async () => {
    const fake = fakeSheets();
    fake.tabs.fidelity_rate = { sheetId: 7, rows: 10, frozen: 1, values: [['date', 'roth_pct', 'pre_tax_pct', 'my notes'], ['2026-01-01', 4, 0, 'raise']] };
    const { c } = client(fake);
    await c.upsertById(RATE, [{ date: '2026-02-01', rothPct: 6, preTaxPct: 0 }]);
    expect(fake.tabs.fidelity_rate.values[0]).toEqual(['date', 'roth_pct', 'pre_tax_pct', 'my notes']);
    expect(fake.tabs.fidelity_rate.values[2]!.slice(0, 3)).toEqual(['2026-02-01', 6, 0]);
  });

  test('ensureTab freezes row 1 of an existing unfrozen tab', async () => {
    const fake = fakeSheets();
    fake.tabs.fidelity_rate = { sheetId: 7, rows: 10, frozen: 0, values: [] };
    const { c } = client(fake);
    await c.ensureTab(RATE);
    expect(fake.tabs.fidelity_rate.frozen).toBe(1);
  });

  test('writeAll puts rows 2..n+1 in one PUT and clears the tail up to the grid row count', async () => {
    const fake = fakeSheets({ gridRows: 20 });
    const { c } = client(fake);
    await c.writeAll(TABS.tx, [tx(1), tx(2), tx(3), tx(4)]);
    fake.calls.length = 0;
    await c.writeAll(TABS.tx, [tx(5), tx(6)]);
    const puts = fake.calls.filter((x) => x.method === 'PUT');
    // the header is already there: only the rows go out
    expect(puts.map((x) => decodeURIComponent(x.url.split('/values/')[1]!.split('?')[0]!))).toEqual(['fidelity_tx!A2:K3']);
    const clears = fake.calls.filter((x) => x.url.indexOf(':clear') !== -1);
    expect(clears.map((x) => decodeURIComponent(x.url.split('/values/')[1].split(':clear')[0]))).toEqual(['fidelity_tx!A4:K20']);
    expect(await c.readRows(TABS.tx)).toEqual([tx(5), tx(6)]);
  });

  test('writeAll of more rows than the grid: no clear past the grid', async () => {
    const fake = fakeSheets({ gridRows: 3 });
    const { c } = client(fake);
    await c.writeAll(TABS.tx, [tx(1), tx(2), tx(3), tx(4), tx(5)]);
    expect(fake.calls.filter((x) => x.url.indexOf(':clear') !== -1)).toHaveLength(0);
    expect(await c.readRows(TABS.tx)).toHaveLength(5);
  });

  test('writeAll of nothing clears every data row', async () => {
    const fake = fakeSheets({ gridRows: 5 });
    const { c } = client(fake);
    await c.writeAll(TABS.tx, [tx(1)]);
    await c.writeAll(TABS.tx, []);
    expect(await c.readRows(TABS.tx)).toEqual([]);
  });

  test('upsertById keeps stored rows, replaces known ids, appends new ones', async () => {
    const fake = fakeSheets({ gridRows: 10 });
    const { c } = client(fake);
    await c.writeAll(TABS.tx, [tx(1), tx(2), tx(3)]);
    const res = await c.upsertById(TABS.tx, [tx(2, 999), tx(4), tx(4, 444)]);
    expect(res).toEqual({ inserted: 1, updated: 1, total: 4 });
    expect(await c.readRows(TABS.tx)).toEqual([tx(1), tx(2, 999), tx(3), tx(4, 444)]);
  });

  test('upsertById with merge and sort', async () => {
    const fake = fakeSheets();
    const { c } = client(fake);
    await c.upsertById(TABS.tx, [tx(2), tx(1)]);
    await c.upsertById(TABS.tx, [tx(1, 5)], {
      merge: (old, inc) => ({ ...inc, amount: old.amount + inc.amount }),
      sort: (a, b) => (a.id < b.id ? -1 : 1),
    });
    expect(await c.readRows(TABS.tx)).toEqual([tx(1, 105), tx(2)]);
  });

  test('a 401 renews the token once and repeats the call', async () => {
    const fake = fakeSheets({ expiredTokens: ['old'] });
    const { c, asked } = client(fake, ['old', 'new']);
    const res = await c.listTabs();
    expect(res.title).toBe('Book');
    expect(asked).toEqual([false, true]);
    expect(fake.calls.map((x) => x.auth)).toEqual(['Bearer old', 'Bearer new']);
  });

  test('a second 401 surfaces as a clear error, no endless retry', async () => {
    const fake = fakeSheets({ expiredTokens: ['old', 'still-old'] });
    const { c } = client(fake, ['old', 'still-old']);
    let err: unknown;
    try { await c.listTabs(); } catch (e) { err = e; }
    expect(fake.calls).toHaveLength(2);
    expect((err as { status: number }).status).toBe(401);
    expect(String(err)).toContain('Google Sheets 401 on list tabs');
  });

  test('errors carry the status and Google\'s message', async () => {
    const fake = fakeSheets();
    const { c } = client(fake);
    let err: unknown;
    try { await c.readRows(TABS.fund); } catch (e) { err = e; }
    expect((err as { status: number }).status).toBe(400);
    expect(String(err)).toContain('read fidelity_fund: Unable to parse range');
  });

  test('no spreadsheet id is a clear error before any request', async () => {
    const fake = fakeSheets();
    const c = new SheetsClient({ fetch: fake.fetch, getToken: async () => 't', spreadsheetId: ' ' });
    await expect(c.listTabs()).rejects.toThrow('No spreadsheet');
    expect(fake.calls).toHaveLength(0);
  });

  test('works with a fetch typed as the global one', async () => {
    const fake = fakeSheets();
    const f = fake.fetch as unknown as typeof fetch;
    const c = new SheetsClient({ fetch: f, getToken: async () => 't', spreadsheetId: 'book' });
    expect((await c.listTabs()).tabs).toEqual([]);
  });
});

test('fidelity_transactions keeps transactions that are the same in every column (live 2026-11-26: 1,500 were dropped)', async () => {
  const fake = fakeSheets();
  const { c } = client(fake);
  const buy: Txn = { account: 'X1', date: '2026-11-20', mnemonic: 'BOT', cat: 'TR', sub: 'BY', dir: 'W', symbol: 'ETFA', qty: 0.01, net: -1, desc: 'YOU BOUGHT', cancelled: false };
  const r = await c.writeAll(FIDELITY_TRANSACTIONS, [buy, { ...buy }, { ...buy, symbol: 'ETFB' }]);
  expect(r.written).toBe(3);
  expect((await c.readRows(FIDELITY_TRANSACTIONS)).map((t) => t.symbol)).toEqual(['ETFA', 'ETFA', 'ETFB']);
});

describe('growing header (fidelity_positions_all)', () => {
  test('a new tab gets the first columns then the sorted keys; a later read appends new keys, never reorders', async () => {
    const fake = fakeSheets();
    const c = new SheetsClient({ fetch: fake.fetch, getToken: async () => 'tok', spreadsheetId: 'sheet' });
    const h1 = await c.growTabHeader('fidelity_positions_all', ['as_of', 'qty', 'actNum', 'lstPrc'], growHeader);
    expect(h1).toEqual(['as_of', 'actNum', 'actNam', 'rowType', 'sym_name', 'sym_desc', 'lstPrc', 'qty']);
    await c.writeAll(wideSpec(h1), [{ as_of: 't', actNum: 'X1', rowType: 'POSITION', sym_name: 'AAA', qty: 2, lstPrc: 10 }]);
    expect(fake.tabs.fidelity_positions_all.values[1]).toEqual(['t', 'X1', '', 'POSITION', 'AAA', '', 10, 2]);
    const h2 = await c.growTabHeader('fidelity_positions_all', ['qty', 'beta', 'alpha'], growHeader);
    expect(h2).toEqual(h1.concat(['alpha', 'beta']));
    expect(fake.tabs.fidelity_positions_all.values[0]).toEqual(h2);
    await c.writeAll(wideSpec(h2), [{ actNum: 'X1', sym_name: 'AAA', alpha: 'a' }]);
    expect(fake.tabs.fidelity_positions_all.values[1]![8]).toBe('a');
    expect(columnLetter(h2.length)).toBe('J');
  });
});

test('a big tab goes in parts under the size limit, rows in order', async () => {
  const fake = fakeSheets();
  const c = new SheetsClient({ fetch: fake.fetch, getToken: async () => 'tok', spreadsheetId: 'sheet' });
  // 40,000 characters per row (a cell holds at most 50,000): about 23 rows per part
  const n = Math.ceil(CHUNK_CHARS / 40_000) * 2 + 3;
  const rows = Array.from({ length: n }, (_, i) => ({ name: `${i}-${'x'.repeat(40_000)}` }));
  await c.writeAll(TABS.fund, rows);
  const ranges = fake.calls.filter((x) => x.method === 'PUT').map((x) => decodeURIComponent(x.url.split('/values/')[1]!.split('?')[0]!)).slice(1);
  expect(ranges.length).toBe(3);
  // contiguous: each part starts where the last ended, the first at row 2, the last ends at row n+1
  const bounds = ranges.map((r) => /A(\d+):A(\d+)$/.exec(r)!.slice(1).map(Number));
  expect(bounds[0]![0]).toBe(2);
  bounds.slice(1).forEach((b, i) => expect(b[0]).toBe(bounds[i]![1]! + 1));
  expect(bounds[bounds.length - 1]![1]).toBe(n + 1);
  fake.calls.filter((x) => x.method === 'PUT').forEach((x) => expect(JSON.stringify(x.body).length).toBeLessThan(CHUNK_CHARS + 50_000));
  expect((await c.readRows(TABS.fund)).map((r) => r.name.split('-')[0])).toEqual(rows.map((_, i) => String(i)));
});

// what each call was: the tab list, a batchUpdate (add or freeze a tab), a header read or write, rows, a clear
const kinds = (calls: FakeCall[]): string[] => calls.map((x) => {
  const a1 = decodeURIComponent(x.url.split('/values/')[1] ?? '').split('?')[0]!.split(':clear')[0]!;
  if (x.url.indexOf('?fields=') !== -1) return 'list';
  if (x.url.endsWith(':batchUpdate')) return 'batch';
  if (x.url.indexOf(':clear') !== -1) return 'clear';
  return x.method + (/!(A1:[A-Z]+1|1:1)$/.test(a1) ? ' header' : ' rows');
});

describe('one run lists the tabs once (review 2026-11-25)', () => {
  // the same writes by one client (one run) and by a new client per write (a fresh tab list each time, as before): the
  // sheets must end the same
  async function oneRunAndApart(setup: (c: SheetsClient) => Promise<unknown>, writes: Array<(c: SheetsClient) => Promise<unknown>>, opts: { gridRows?: number } = {}) {
    const run = fakeSheets(opts);
    const apart = fakeSheets(opts);
    await setup(client(run).c);
    await setup(client(apart).c);
    run.calls.length = 0;
    const one = client(run).c;
    for (const w of writes) await w(one);
    for (const w of writes) await w(client(apart).c);
    expect(run.tabs).toEqual(apart.tabs);
    return run;
  }

  test('(a) every tab there with its header: one tab list, no header writes, the same rows', async () => {
    const run = await oneRunAndApart(
      async (c) => { await c.writeAll(TABS.tx, [tx(1), tx(2), tx(3)]); await c.writeAll(TABS.fund, [{ name: 'A' }, { name: 'B' }]); await c.writeAll(RATE, [{ date: '2026-01-01', rothPct: 4, preTaxPct: 0 }]); },
      [(c) => c.writeAll(TABS.tx, [tx(4), tx(5)]), (c) => c.writeAll(TABS.fund, [{ name: 'C' }]), (c) => c.upsertById(RATE, [{ date: '2026-02-01', rothPct: 6, preTaxPct: 0 }])],
    );
    const k = kinds(run.calls);
    expect(k.filter((x) => x === 'list')).toHaveLength(1);
    expect(k.filter((x) => x === 'PUT header')).toHaveLength(0);
    expect(k).toEqual(['list', 'GET header', 'PUT rows', 'clear', 'GET header', 'PUT rows', 'clear', 'GET header', 'GET rows', 'PUT rows', 'clear']);
  });

  test('(b) a new empty spreadsheet: every tab created, frozen, its header written, as before', async () => {
    const run = await oneRunAndApart(async () => {}, [(c) => c.writeAll(TABS.tx, [tx(1)]), (c) => c.writeAll(TABS.fund, [{ name: 'A' }]), (c) => c.upsertById(RATE, [{ date: '2026-01-01', rothPct: 4, preTaxPct: 0 }])]);
    expect(kinds(run.calls)).toEqual([
      'list', 'batch', 'GET header', 'PUT header', 'PUT rows', 'clear',
      'batch', 'GET header', 'PUT header', 'PUT rows', 'clear',
      'batch', 'GET header', 'PUT header', 'GET rows', 'PUT rows', 'clear',
    ]);
    expect(run.tabs.fidelity_tx!.values[0]).toEqual(TABS.tx.columns);
    expect(run.tabs.fidelity_fund!.values[0]).toEqual(TABS.fund.columns);
    expect(run.tabs.fidelity_rate!.values[0]).toEqual(RATE.columns);
    Object.keys(run.tabs).forEach((t) => expect(run.tabs[t]!.frozen).toBe(1));
  });

  test('(c) a tab another writer added after our list: the 400 "already exists" path lists again and writes', async () => {
    const fake = fakeSheets();
    const c = client(fake).c;
    await c.writeAll(TABS.tx, [tx(1)]); // the run has listed the tabs: no fidelity_fund yet
    await client(fake).c.writeAll(TABS.fund, [{ name: 'theirs' }, { name: 'more' }]); // the other writer
    fake.calls.length = 0;
    await c.writeAll(TABS.fund, [{ name: 'ours' }]);
    expect(kinds(fake.calls)).toEqual(['batch', 'list', 'GET header', 'PUT rows', 'clear']);
    expect(await c.readRows(TABS.fund)).toEqual([{ name: 'ours' }]);
    // the run knows the tab now: the next write of it does not list or add again
    fake.calls.length = 0;
    await c.writeAll(TABS.fund, [{ name: 'again' }]);
    expect(kinds(fake.calls)).toEqual(['GET header', 'PUT rows', 'clear']);
  });

  test('a write that grows the grid: a later write of that tab in the same run clears up to the new size', async () => {
    const run = await oneRunAndApart(async (c) => { await c.writeAll(TABS.tx, [tx(1)]); }, [(c) => c.writeAll(TABS.tx, [tx(1), tx(2), tx(3), tx(4), tx(5), tx(6)]), (c) => c.writeAll(TABS.tx, [tx(7), tx(8)])], { gridRows: 3 });
    expect(await client(run).c.readRows(TABS.tx)).toEqual([tx(7), tx(8)]);
    const clears = run.calls.filter((x) => x.url.indexOf(':clear') !== -1).map((x) => decodeURIComponent(x.url.split('/values/')[1]!.split(':clear')[0]!));
    expect(clears).toEqual(['fidelity_tx!A4:K7']);
  });

  test('a header with spaces around a name is still written again; only an exact header is left alone', async () => {
    const fake = fakeSheets();
    fake.tabs.fidelity_rate = { sheetId: 7, rows: 10, frozen: 1, values: [[' date', 'roth_pct', 'pre_tax_pct ', 'my notes']] };
    const { c } = client(fake);
    await c.ensureTab(RATE);
    expect(fake.tabs.fidelity_rate.values[0]).toEqual(['date', 'roth_pct', 'pre_tax_pct', 'my notes']);
    expect(kinds(fake.calls)).toEqual(['list', 'GET header', 'PUT header']);
  });
});

describe('chunk prints: unchanged parts of a big tab are not sent again (fidelity_transactions)', () => {
  // 40,000 characters per row: 23 rows per part, so 60 rows are parts of 23, 23 and 14 rows
  const big = (i: number, tag = ''): { name: string } => ({ name: `${i}${tag}-${'x'.repeat(40_000)}` });
  const many = (n: number, from = 0): Array<{ name: string }> => Array.from({ length: n }, (_, i) => big(from + i));
  const rowRanges = (calls: FakeCall[]): string[] => calls.filter((x) => x.method === 'PUT' && !/!A1:/.test(decodeURIComponent(x.url))).map((x) => decodeURIComponent(x.url.split('/values/')[1]!.split('?')[0]!));

  // the same writes with chunk prints (a new client per write, as the userscript makes one per run) and as full
  // rewrites without them: the sheets must end the same; returns the row ranges each write with prints sent
  async function withAndWithout(writes: Array<Array<{ name: string }>>, between: (f: ReturnType<typeof fakeSheets>, i: number) => void = () => {}) {
    const a = fakeSheets();
    const b = fakeSheets();
    let prev: ChunkPrint[] = [];
    const sent: string[][] = [];
    for (let i = 0; i < writes.length; i++) {
      between(a, i);
      between(b, i);
      a.calls.length = 0;
      const r = await client(a).c.writeAll(TABS.fund, writes[i]!, prev);
      prev = r.chunks!;
      sent.push(rowRanges(a.calls));
      await client(b).c.writeAll(TABS.fund, writes[i]!);
    }
    expect(a.tabs).toEqual(b.tabs);
    expect((await client(a).c.readRows(TABS.fund)).map((r) => r.name)).toEqual(writes[writes.length - 1]!.map((r) => r.name));
    return { sent, prev, a };
  }

  test('rows appended at the end: only the last part goes out, the sheet equals a full rewrite', async () => {
    const { sent, prev } = await withAndWithout([many(60), many(63)]);
    expect(sent[0]).toEqual(['fidelity_fund!A2:A24', 'fidelity_fund!A25:A47', 'fidelity_fund!A48:A61']);
    expect(sent[1]).toEqual(['fidelity_fund!A48:A64']);
    expect(prev.map((c) => [c.start, c.count])).toEqual([[2, 23], [25, 23], [48, 17]]);
  });

  test('a part that starts past the last grid row: the grid gets its rows first (live 2026-11-26: 400 exceeds grid limits)', async () => {
    // the grid ends exactly at the end of part 1; part 1 is unchanged and not sent, part 2 starts one row past the grid
    const f = fakeSheets({ gridRows: 24 });
    const first = await client(f).c.writeAll(TABS.fund, many(23), []);
    expect(f.tabs.fidelity_fund!.rows).toBe(24);
    f.calls.length = 0;
    await client(f).c.writeAll(TABS.fund, many(40), first.chunks);
    expect(rowRanges(f.calls)).toEqual(['fidelity_fund!A25:A41']);
    expect(f.tabs.fidelity_fund!.rows).toBe(41);
    expect(await client(f).c.readRows(TABS.fund)).toHaveLength(40);
  });

  test('enough rows appended for a new part: the last part and the new one go out', async () => {
    const { sent } = await withAndWithout([many(60), many(80)]);
    expect(sent[1]).toEqual(['fidelity_fund!A48:A70', 'fidelity_fund!A71:A81']);
  });

  test('a row inserted in the middle: from its part on everything goes out', async () => {
    const rows = many(60);
    const inserted = rows.slice(0, 30).concat([big(999)], rows.slice(30));
    const { sent } = await withAndWithout([rows, inserted]);
    expect(sent[1]).toEqual(['fidelity_fund!A25:A47', 'fidelity_fund!A48:A62']);
  });

  test('a row changed in the first part: every part goes out (positions after it are not trusted)', async () => {
    const rows = many(60);
    const changed = rows.map((r, i) => (i === 0 ? big(0, 'changed') : r));
    const { sent } = await withAndWithout([rows, changed]);
    expect(sent[1]).toHaveLength(3);
  });

  test('rows removed: the tab shrinks and the tail is cleared as before', async () => {
    const { sent, a } = await withAndWithout([many(60), many(50)]);
    expect(sent[1]).toEqual(['fidelity_fund!A48:A51']);
    expect(a.calls.filter((x) => x.url.indexOf(':clear') !== -1).map((x) => decodeURIComponent(x.url.split('/values/')[1]!.split(':clear')[0]!))).toEqual(['fidelity_fund!A52:A1000']);
    await withAndWithout([many(60), many(40, 20)]); // removed at the start: every row moves up
  });

  test('the same rows again: no row is sent, the tail clear stays', async () => {
    const { sent } = await withAndWithout([many(60), many(60)]);
    expect(sent[1]).toEqual([]);
  });

  test('no prints, or prints of nothing: everything is written; without prints none come back', async () => {
    const fake = fakeSheets();
    expect((await client(fake).c.writeAll(TABS.fund, many(60))).chunks).toBeUndefined();
    fake.calls.length = 0;
    const r = await client(fake).c.writeAll(TABS.fund, many(61), []);
    expect(rowRanges(fake.calls)).toHaveLength(3);
    expect(r.chunks).toHaveLength(3);
    expect(chunkPrintsOf(r.chunks)).toEqual(r.chunks!);
    expect(chunkPrintsOf([{ start: 2, count: 0, print: 'x' }])).toEqual([]);
    expect(chunkPrintsOf('broken')).toEqual([]);
  });

  test('a tab deleted, emptied or cut shorter by hand: everything is written again', async () => {
    // deleted: created again in this run
    await withAndWithout([many(60), many(61)], (f, i) => { if (i === 1) delete f.tabs.fidelity_fund; });
    // the whole tab cleared (header too)
    await withAndWithout([many(60), many(61)], (f, i) => { if (i === 1) f.tabs.fidelity_fund!.values = []; });
    // rows deleted: the grid no longer reaches the last stored part
    const cut = await withAndWithout([many(60), many(61)], (f, i) => { if (i === 1) { f.tabs.fidelity_fund!.values.length = 30; f.tabs.fidelity_fund!.rows = 30; } });
    expect(cut.sent[1]).toHaveLength(3);
  });

  test('the accepted limit: a row changed by hand in a part that did not change on our side stays as edited', async () => {
    const fake = fakeSheets();
    const first = await client(fake).c.writeAll(TABS.fund, many(60), []);
    fake.tabs.fidelity_fund!.values[3] = ['edited by hand'];
    await client(fake).c.writeAll(TABS.fund, many(61), first.chunks);
    expect(fake.tabs.fidelity_fund!.values[3]).toEqual(['edited by hand']);
    // a write without prints (or once that part changes) puts it back
    await client(fake).c.writeAll(TABS.fund, many(61));
    expect(fake.tabs.fidelity_fund!.values[3]).toEqual([big(2).name]);
  });
});
