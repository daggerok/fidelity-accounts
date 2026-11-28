/// <reference types="bun" />
/// <reference types="node" />
/// <reference lib="esnext" />
import { expect, test } from 'bun:test';
import { incomeReceived, monthWindows, nyDate, nyEpoch, parseTransactions, parseTxnStore, replaceWindow, splitWindow, txnRequest, type Txn } from './transactions';

// made-up rows in the shape of the answer seen on 2026-11-24
const row = (o: { day: number; mnemonic: string; cat?: string; dir?: string; symbol?: string; qty?: string; net: number; cancelled?: boolean }) => ({
  acctNum: 'X1', date: o.day, dateDetail: { tradedDate: o.day, postedDate: o.day },
  catDetail: { txnCatCode: o.cat ?? '', txnSubCatCode: '' }, brokerageDetail: { isCancelled: o.cancelled ?? false, additionalDetail: { mnemonic: o.mnemonic, depositWithdrawalCode: o.dir ?? '' } },
  securityDetail: { symbol: o.symbol ?? 'AAAA' }, quantity: o.qty ?? '0', amtDetail: { net: o.net }, description: `${o.mnemonic} row`,
});
const NOV24 = 1795496400; // 2026-11-24 00:00 New York

test('New York days and epochs', () => {
  expect(nyDate(NOV24)).toBe('2026-11-24');
  expect(nyEpoch('2026-11-24')).toBe(NOV24);
  expect(nyDate(nyEpoch('2026-07-04'))).toBe('2026-07-04'); // summer time
});

test('parse keeps the fields the app uses and refuses a changed answer', () => {
  const [t] = parseTransactions({ data: { transactions: [row({ day: NOV24, mnemonic: 'DIV', cat: 'DV', dir: 'D', net: 0.16 })] } }, 'X1');
  expect(t).toEqual({ account: 'X1', date: '2026-11-24', mnemonic: 'DIV', cat: 'DV', sub: '', dir: 'D', symbol: 'AAAA', qty: 0, net: 0.16, desc: 'DIV row', cancelled: false });
  expect(() => parseTransactions({ data: {} }, 'X1')).toThrow('no data.transactions');
});

test('month windows never share a day; a window splits in halves down to one day', () => {
  expect(monthWindows('2026-01-15', '2026-03-10')).toEqual([['2026-01-15', '2026-01-31'], ['2026-02-01', '2026-02-28'], ['2026-03-01', '2026-03-10']]);
  expect(splitWindow(['2026-02-01', '2026-02-28'])).toEqual([['2026-02-01', '2026-02-14'], ['2026-02-15', '2026-02-28']]);
  expect(splitWindow(['2026-02-01', '2026-02-02'])).toEqual([['2026-02-01', '2026-02-01'], ['2026-02-02', '2026-02-02']]);
  expect(splitWindow(['2026-02-01', '2026-02-01'])).toBeNull();
});

test('a fresh read replaces only that account and window', () => {
  const t = (account: string, date: string, net: number): Txn => ({ account, date, mnemonic: 'DIV', cat: 'DV', sub: '', dir: 'D', symbol: 'A', qty: 0, net, desc: '', cancelled: false });
  const rows = [t('X1', '2026-11-01', 1), t('X1', '2026-11-20', 2), t('X2', '2026-11-20', 3)];
  const next = replaceWindow(rows, 'X1', '2026-11-15', '2026-11-24', [t('X1', '2026-11-21', 5)]);
  expect(next.map((r) => `${r.account}:${r.date}:${r.net}`)).toEqual(['X1:2026-11-01:1', 'X2:2026-11-20:3', 'X1:2026-11-21:5']);
});

test('income received: dividends and interest paid in, in the accounts and days asked', () => {
  const rows = parseTransactions({ data: { transactions: [
    row({ day: NOV24, mnemonic: 'DIV', cat: 'DV', dir: 'D', net: 1.5 }),
    row({ day: NOV24, mnemonic: 'RIN', cat: 'DV', dir: 'W', net: -1.5, qty: '0.01' }), // the reinvest buy is not income
    row({ day: NOV24, mnemonic: 'DIV', cat: 'DV', dir: 'D', net: 9, cancelled: true }),
    row({ day: NOV24 - 30 * 86400, mnemonic: 'DIV', cat: 'DV', dir: 'D', net: 2 }),
    row({ day: NOV24, mnemonic: 'TFR', cat: 'ZZ', dir: 'D', net: 100 }),
  ] } }, 'X1');
  expect(incomeReceived(rows, new Set(['X1']), '2026-11-01', '2026-11-30')).toBe(1.5);
  expect(incomeReceived(rows, new Set(['X1']), '2026-01-01', '2026-12-31')).toBe(3.5);
  expect(incomeReceived(rows, new Set(['X2']), '2026-01-01', '2026-12-31')).toBe(0);
  expect(incomeReceived(rows, new Set(['X1']), '2026-01-01', '2026-12-31', (r) => r.symbol === 'BBBB')).toBe(0);
});

test('request body: base64 name, window as New York epochs', () => {
  const b = txnRequest({ number: 'X1', name: 'Ünï' }, '2026-11-01', '2026-11-24') as { filter: { accounts: Array<{ acctName: string }>; searchCriteriaDetail: { txnFromDate: number; txnToDate: number } } };
  expect(new TextDecoder().decode(Uint8Array.from(atob(b.filter.accounts[0]!.acctName), (c) => c.charCodeAt(0)))).toBe('Ünï');
  expect(b.filter.searchCriteriaDetail.txnToDate).toBe(NOV24);
});

test('store parse', () => {
  expect(parseTxnStore('{"version":1,"at":"x","synced":{},"rows":[]}')).not.toBeNull();
  expect(parseTxnStore('nope')).toBeNull();
  expect(parseTxnStore({ version: 2, rows: [], synced: {} })).toBeNull();
});

test('a buy keeps the price Fidelity gives; a payment has none', () => {
  const buy = { ...row({ day: NOV24, mnemonic: 'RIN', cat: 'DV', dir: 'W', net: -0.06, qty: '0.001' }) } as Record<string, unknown>;
  buy.amtDetail = { net: -0.06, price: 92.34 };
  const [t1, t2] = parseTransactions({ data: { transactions: [buy, row({ day: NOV24, mnemonic: 'DIV', cat: 'DV', dir: 'D', net: 0.06 })] } }, 'X1');
  expect(t1!.price).toBe(92.34);
  expect('price' in t2!).toBe(false);
});

test('a pending payment is dated by the day it will post, any other row by the day it was traded', () => {
  const pending = { ...row({ day: NOV24, mnemonic: 'FRN', cat: 'DV', dir: 'D', net: 0 }) } as Record<string, unknown>;
  pending.description = 'DIV OF $0.08 PENDING REINVESTMENT as of 2026-11-24 DEMO CO (AAAA) (Cash)';
  pending.dateDetail = { tradedDate: NOV24, postedDate: NOV24 + 3 * 86400 };
  const paid = { ...row({ day: NOV24, mnemonic: 'DIV', cat: 'DV', dir: 'D', net: 0.08 }) } as Record<string, unknown>;
  paid.dateDetail = { tradedDate: NOV24, postedDate: NOV24 + 3 * 86400 };
  const [a, b] = parseTransactions({ data: { transactions: [pending, paid] } }, 'X1');
  expect(a!.date).toBe('2026-11-27');
  expect(b!.date).toBe('2026-11-24');
});
