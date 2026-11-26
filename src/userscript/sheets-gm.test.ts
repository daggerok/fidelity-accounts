/// <reference types="bun" />
/// <reference types="node" />
/// <reference lib="esnext" />
import { describe, expect, test } from 'bun:test';
import { fakeSheets, type FakeCall } from '../shared/sheets/fake-sheets';
import { TRANSACTIONS } from '../shared/sheets/tabs';
import type { Txn, TxnStore } from '../shared/transactions';
import { gmFetch, handoffSheet, usableHandoff, writeKept, writeSets, type KeptPrints } from './sheets-gm';

test('gmFetch turns GM_xmlhttpRequest into a Response', async () => {
  const seen: Array<{ method: string; url: string; headers?: Record<string, string>; data?: string }> = [];
  const fetcher = gmFetch((d) => { seen.push(d); d.onload({ status: 200, responseText: '{"ok":1}', responseHeaders: 'content-type: application/json\r\nx-a: b' }); });
  const r = await fetcher('https://sheets.googleapis.com/v4/x', { method: 'PUT', headers: { Authorization: 'Bearer t' }, body: '{"a":1}' });
  expect(await r.json()).toEqual({ ok: 1 });
  expect(r.headers.get('x-a')).toBe('b');
  expect(seen[0]).toMatchObject({ method: 'PUT', url: 'https://sheets.googleapis.com/v4/x', data: '{"a":1}' });
  expect(seen[0]!.headers!.authorization).toBe('Bearer t');
  const failing = gmFetch((d) => d.onerror(new Error('x')));
  await expect(failing('https://x')).rejects.toThrow('network error');
});

test('a handed-over token is used only with more than a minute left', () => {
  const now = 1_000_000;
  const raw = (expiresAt: number) => JSON.stringify({ token: 't', expiresAt, spreadsheetId: 's' });
  expect(usableHandoff(raw(now + 120_000), now)?.token).toBe('t');
  expect(usableHandoff(raw(now + 30_000), now)).toBeNull();
  expect(usableHandoff('{bad', now)).toBeNull();
  expect(usableHandoff(JSON.stringify({ token: 't', expiresAt: now + 999_999 }), now)).toBeNull();
});

test('the spreadsheet of a handoff is known even when its token expired', () => {
  expect(handoffSheet(JSON.stringify({ token: 't', expiresAt: 0, spreadsheetId: 's' }))).toBe('s');
  expect(handoffSheet(JSON.stringify({ token: '', expiresAt: 0, spreadsheetId: '' }))).toBe('');
  expect(handoffSheet('{bad')).toBe('');
  expect(handoffSheet(null)).toBe('');
});

describe('fidelity_transactions in parts, prints kept per spreadsheet (writeKept)', () => {
  // made-up rows only, sorted by date like the store; about 6,000 rows per part
  const row = (i: number, tag = ''): Txn => ({ account: `X${i % 7}`, date: `2026-${String(1 + Math.floor(i / 2600)).padStart(2, '0')}-${String(1 + (Math.floor(i / 100) % 26)).padStart(2, '0')}`, mnemonic: 'DIV', cat: 'DV', sub: 'VP', dir: 'D', symbol: `SYM${i % 300}`, qty: i % 13, net: i / 100, desc: `MADE UP ROW ${i}${tag} DIVIDEND RECEIVED MADE UP SECURITY NAME CLASS A`, cancelled: false });
  const rows = (n: number, from = 0): Txn[] => Array.from({ length: n }, (_, i) => row(from + i));
  const storeOf = (r: Txn[], at = '2026-11-24T17:00:00.000Z'): TxnStore => ({ version: 1, at, synced: { X0: '2026-11-24', X1: '2026-11-24' }, rows: r });
  const g = { token: 't', expiresAt: Date.now() + 3600_000, spreadsheetId: 'book' };
  const memory = (start: KeptPrints | null = null) => { let k = start; return { get: () => k, set: (v: KeptPrints) => { k = JSON.parse(JSON.stringify(v)) as KeptPrints; } }; };
  const isTxnRows = (x: FakeCall) => x.method === 'PUT' && /fidelity_transactions!A\d/.test(decodeURIComponent(x.url)) && !/!A1:/.test(decodeURIComponent(x.url));
  // the tabs a reader sees, fidelity_updates without its write times (they differ between two runs)
  const content = (f: ReturnType<typeof fakeSheets>) => Object.fromEntries(Object.keys(f.tabs).sort().map((t) => [t, t === 'fidelity_updates' ? f.tabs[t]!.values.map((v) => v.slice(0, 1)) : f.tabs[t]!.values]));
  // the old way: every set written whole, prints only for whole sets
  const full = async (f: ReturnType<typeof fakeSheets>, store: TxnStore) => { await writeSets(['transactions'], { ds: null, store }, {}, g, f.fetch, () => {}); };

  test('5 rows appended to 18,000: only the last part goes out, the sheet equals a full rewrite', async () => {
    const a = fakeSheets();
    const b = fakeSheets();
    const kept = memory();
    const s1 = storeOf(rows(18_000));
    const s2 = storeOf(rows(18_005), '2026-11-24T17:10:00.000Z');
    await writeKept(['transactions'], { ds: null, store: s1 }, g, a.fetch, kept);
    await full(b, s1);
    expect(a.calls.filter(isTxnRows).length).toBeGreaterThan(2);
    expect(kept.get()!.chunks![TRANSACTIONS.name]!.length).toBe(a.calls.filter(isTxnRows).length);
    a.calls.length = 0;
    b.calls.length = 0;
    expect(await writeKept(['transactions'], { ds: null, store: s2 }, g, a.fetch, kept)).toEqual(['transactions']);
    await full(b, s2);
    expect(a.calls.filter(isTxnRows)).toHaveLength(1);
    expect(content(a)).toEqual(content(b));
  });

  test('a different spreadsheet, or no prints kept: every part is written', async () => {
    const a = fakeSheets();
    const kept = memory();
    await writeKept(['transactions'], { ds: null, store: storeOf(rows(18_000)) }, g, a.fetch, kept);
    const parts = kept.get()!.chunks![TRANSACTIONS.name]!.length;
    // the prints were for another spreadsheet (this one is new to them)
    const other = memory({ ...kept.get()!, id: 'another-book' });
    a.calls.length = 0;
    await writeKept(['transactions'], { ds: null, store: storeOf(rows(18_001)) }, g, a.fetch, other);
    expect(a.calls.filter(isTxnRows)).toHaveLength(parts);
    expect(other.get()!.id).toBe('book');
    // kept by a version before the chunk prints: the set print alone
    const old = memory({ id: 'book', prints: {} });
    a.calls.length = 0;
    await writeKept(['transactions'], { ds: null, store: storeOf(rows(18_002)) }, g, a.fetch, old);
    expect(a.calls.filter(isTxnRows)).toHaveLength(parts);
  });

  // a write that fails on its second part, then a retry: with `next` (the same rows again) and with the rows of the
  // first write (a row that came and went: the parts the failed write changed must not be trusted)
  for (const retry of ['the same rows', 'the rows before']) {
    test(`a failure mid-way, then a retry with ${retry}, ends with the right sheet`, async () => {
      const a = fakeSheets();
      const b = fakeSheets();
      const kept = memory();
      const before = rows(18_000);
      const s1 = storeOf(before);
      // a row in the first part: every part after it moves
      const s2 = storeOf(before.slice(0, 10).concat([{ ...row(10, ' late'), net: 999.99 }], before.slice(10)), '2026-11-24T17:10:00.000Z');
      await writeKept(['transactions'], { ds: null, store: s1 }, g, a.fetch, kept);
      await full(b, s1);
      let n = 0;
      a.failures.push({ when: (x) => isTxnRows(x) && ++n === 2, status: 503 });
      await expect(writeKept(['transactions'], { ds: null, store: s2 }, g, a.fetch, kept)).rejects.toThrow('503');
      // nothing kept claims the half-written tab
      expect(kept.get()!.prints!.transactions).toBeUndefined();
      expect(kept.get()!.chunks![TRANSACTIONS.name]).toBeUndefined();
      const s3 = retry === 'the same rows' ? s2 : storeOf(before, '2026-11-24T17:20:00.000Z');
      await writeKept(['transactions'], { ds: null, store: s3 }, g, a.fetch, kept);
      await full(b, s3);
      expect(content(a)).toEqual(content(b));
      expect(kept.get()!.prints!.transactions).toBeDefined();
    });
  }

  test('a set skipped as unchanged keeps its parts; other sets do not touch them', async () => {
    const a = fakeSheets();
    const kept = memory();
    const s1 = storeOf(rows(100));
    await writeKept(['transactions'], { ds: null, store: s1 }, g, a.fetch, kept);
    const chunks = kept.get()!.chunks;
    a.calls.length = 0;
    expect(await writeKept(['transactions', 'summary'], { ds: null, store: s1 }, g, a.fetch, kept)).toEqual([]);
    expect(a.calls).toHaveLength(0);
    expect(kept.get()!.chunks).toEqual(chunks!);
  });
});
