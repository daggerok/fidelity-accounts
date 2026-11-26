/// <reference types="bun" />
/// <reference types="node" />
/// <reference lib="esnext" />
import { expect, test } from 'bun:test';
import { nyDate } from '../shared/transactions';
import { pagePost } from './history-sync';
import { EMPTY_STORE, lastTxnsRead, readTransactions, sameTxns, startDay } from './transactions-sync';
import { parseTxnStore, type TxnStore } from '../shared/transactions';

const accounts = [{ number: 'X1', name: 'A', group: 'G', asOf: 't' }, { number: 'X2', name: 'B', group: 'G', asOf: 't' }];
type Body = { filter: { accounts: Array<{ acctNum: string }>; searchCriteriaDetail: { txnFromDate: number; txnToDate: number } } };

test('start day: the first daily value, else a fixed day; later 10 days before the last read', () => {
  expect(startDay('X1', EMPTY_STORE, { X1: [{ date: '2026-03-02', value: 1 }] })).toBe('2026-03-02');
  expect(startDay('X2', EMPTY_STORE, undefined)).toBe('2024-01-01');
  expect(startDay('X1', { ...EMPTY_STORE, synced: { X1: '2026-11-24' } }, undefined)).toBe('2026-11-14');
  // a recent read (👀 in the session): yesterday and today only; a never read account still starts at its beginning
  expect(startDay('X1', { ...EMPTY_STORE, synced: { X1: '2026-11-24' } }, undefined, 1)).toBe('2026-11-23');
  expect(startDay('X2', EMPTY_STORE, undefined, 1)).toBe('2024-01-01');
});

test('reads month by month, splits a full window, keeps a failed account for tomorrow', async () => {
  const asked: string[] = [];
  const post = async (_url: string, body: unknown) => {
    const b = body as Body;
    const acct = b.filter.accounts[0]!.acctNum;
    const from = nyDate(b.filter.searchCriteriaDetail.txnFromDate);
    const to = nyDate(b.filter.searchCriteriaDetail.txnToDate);
    asked.push(`${acct} ${from}..${to}`);
    if (acct === 'X2') throw new Error('500');
    // November 1-30 as one window is "too full", its halves are fine
    const n = from === '2026-11-01' && to === '2026-11-24' ? 1500 : 1;
    return { data: { transactions: Array.from({ length: n }, () => ({ acctNum: acct, date: b.filter.searchCriteriaDetail.txnToDate, amtDetail: { net: 1 }, catDetail: { txnCatCode: 'DV' }, brokerageDetail: { additionalDetail: { depositWithdrawalCode: 'D' } } })) } };
  };
  const { store, failed } = await readTransactions(accounts, EMPTY_STORE, { X1: [{ date: '2026-10-20', value: 1 }] }, '2026-11-24', post);
  expect(asked.filter((a) => a.startsWith('X1'))).toEqual(['X1 2026-10-20..2026-10-31', 'X1 2026-11-01..2026-11-24', 'X1 2026-11-01..2026-11-12', 'X1 2026-11-13..2026-11-24']);
  expect(failed).toEqual(['X2']);
  expect(store.synced).toEqual({ X1: '2026-11-24' });
  expect(store.rows).toHaveLength(3); // one per final window
});

test('the page POST allows only the two reads', async () => {
  await expect(pagePost('/ftgw/digital/trade/api/order', {})).rejects.toThrow('not allowed');
  await expect(pagePost('/ftgw/digital/activityapi/api/v1/transactions/history/../order', {})).rejects.toThrow('not allowed');
});

test('a read that changed nothing is told apart from one that did (the store is then not stored again)', () => {
  const r = { account: 'X1', date: '2026-11-20', mnemonic: 'DIV', cat: 'DV', sub: 'VP', dir: 'D', symbol: 'AAAA', qty: 0, net: 1.25, desc: 'MADE UP', cancelled: false };
  const stored: TxnStore = { version: 1, at: '2026-11-24T15:00:00.000Z', synced: { X1: '2026-11-24', X2: '2026-11-24' }, rows: [r, { ...r, account: 'X2' }] };
  // the same content read again later: a new time and new objects, nothing else
  const again = parseTxnStore(JSON.stringify({ ...stored, at: '2026-11-24T15:10:00.000Z' }))!;
  expect(sameTxns(stored, again)).toBe(true);
  expect(sameTxns(stored, { ...again, rows: again.rows.concat([{ ...r, net: 2 }]) })).toBe(false);
  expect(sameTxns(stored, { ...again, rows: [again.rows[0]!, { ...again.rows[1]!, cancelled: true }] })).toBe(false);
  expect(sameTxns(stored, { ...again, synced: { X1: '2026-11-24', X2: '2026-11-25' } })).toBe(false);
  expect(sameTxns(stored, { ...again, synced: { X2: '2026-11-24', X1: '2026-11-24' } })).toBe(false); // another order: another JSON
  const { cancelled: _c, ...noFlag } = again.rows[0]!;
  expect(sameTxns(stored, { ...again, rows: [noFlag as typeof r, again.rows[1]!] })).toBe(false);
});

test('the time of the last read: the store\'s own or a later check that changed nothing', () => {
  const store: TxnStore = { ...EMPTY_STORE, at: '2026-11-24T15:00:00.000Z' };
  expect(lastTxnsRead(store, null)).toBe('2026-11-24T15:00:00.000Z');
  expect(lastTxnsRead(store, '2026-11-24T15:10:00.000Z')).toBe('2026-11-24T15:10:00.000Z');
  expect(lastTxnsRead(store, '2026-11-24T14:00:00.000Z')).toBe('2026-11-24T15:00:00.000Z');
  expect(lastTxnsRead(store, 'garbage')).toBe('2026-11-24T15:00:00.000Z');
  expect(lastTxnsRead(null, null)).toBe('');
  expect(lastTxnsRead({ ...store, at: '' }, '2026-11-24T15:10:00.000Z')).toBe('2026-11-24T15:10:00.000Z');
});
