/// <reference types="bun" />
/// <reference lib="esnext" />
import { expect, test } from 'bun:test';
import type { Account } from '../shared/model';
import { accountsHere, markRead, oldestRead, readsOf } from './here';

const acct = (number: string): Account => ({ number, name: number, group: 'g' } as Account);
const mine = [acct('A1'), acct('A2')];
const hers = [acct('B1')];

test('a page reads only the accounts of its own account list; the other login keeps its own', () => {
  const stored = mine.concat(hers);
  expect(accountsHere(stored, [{ number: 'B1' }]).map((a) => a.number)).toEqual(['B1']);
  expect(accountsHere(stored, [{ number: 'A2' }, { number: 'A1' }, { number: 'NEW' }]).map((a) => a.number)).toEqual(['A1', 'A2']);
  expect(accountsHere(stored, [])).toEqual([]); // no account list on the page: nothing is asked
});

test('each account keeps the time of its last read: one login read does not make the other look read', () => {
  const evening = '2026-11-26T01:30:00.000Z';
  const reads = markRead({}, mine, 'history', evening);
  expect(oldestRead(reads, mine, 'history')).toBe(evening);
  expect(oldestRead(reads, hers, 'history')).toBeUndefined(); // never read: due
  expect(oldestRead(reads, mine, 'txns')).toBeUndefined(); // another kind of read
  const later = markRead(reads, [mine[1]!], 'history', '2026-11-27T01:30:00.000Z');
  expect(oldestRead(later, mine, 'history')).toBe(evening); // the oldest of the two decides
  expect(later.A1).toEqual({ history: evening });
  expect(oldestRead(reads, [], 'history')).toBeUndefined();
});

test('stored times that are not what we wrote read as none', () => {
  expect(readsOf(null)).toEqual({});
  expect(readsOf('x')).toEqual({});
  expect(readsOf({ A1: { history: 'not a date', txns: '2026-11-26T01:30:00.000Z' }, A2: 5 })).toEqual({ A1: { txns: '2026-11-26T01:30:00.000Z' } });
});
