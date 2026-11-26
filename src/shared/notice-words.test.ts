/// <reference types="bun" />
/// <reference lib="esnext" />
import { describe, expect, test } from 'bun:test';
import { freshNotice, makeNotice } from './notice';
import { NOTICE_KEYS, NOTICE_LINES, NO_POSITIONS, NO_READER, SHEETS_WAITING, balancesRead, betasFailed, betasRead, fidelityChanged, jobFailed, lines, positionsRead, say, sheetWaitsAllow, sheetsFailed, transactionsFailed, transactionsRead, wordsOf } from './notice-words';
import { RU } from '../viewer/app/i18n/ru';

describe('notification words', () => {
  test('one item a line: what happened, then each number, then the sheet when it got it', () => {
    expect(lines(positionsRead(6, 1090, true))).toEqual(['Positions updated', 'Accounts: 6', 'Positions: 1,090', 'Saved to Google Sheets']);
    expect(lines(positionsRead(1, 1, false))).toEqual(['Positions updated', 'Accounts: 1', 'Positions: 1']);
    expect(say(positionsRead(1, 1, false))).toBe('Positions updated\nAccounts: 1\nPositions: 1');
  });

  test('the other jobs', () => {
    expect(lines(balancesRead(4, 6, false))).toEqual(['Daily balances updated', 'Accounts: 4 of 6']);
    expect(lines(transactionsRead(18005, 5, true))).toEqual(['Transactions updated', 'New: 5', 'Total: 18,005', 'Saved to Google Sheets']);
    expect(lines(transactionsRead(18000, 0, false))).toEqual(['Transactions checked', 'Nothing new', 'Total: 18,000']);
    expect(lines(betasRead(210, 217, false))).toEqual(['Betas updated', 'Found: 210 of 217']);
    expect(lines(jobFailed('positions', new Error('no grid')))).toEqual(['Could not read the positions', 'Reason: no grid']);
    expect(say(sheetsFailed('x'.repeat(500))).length).toBeLessThan(260);
  });

  test('no line is glued from several things and no notice is longer than the popup holds', () => {
    const all = [positionsRead(6, 1090, true), balancesRead(6, 6, true), transactionsRead(10, 1, true), transactionsFailed(2), betasRead(1, 2, true), betasFailed(1, 2, ['betas.etf']), jobFailed('page', 'x'), fidelityChanged('grid.fields'), SHEETS_WAITING, sheetsFailed('x'), sheetWaitsAllow('…abc123'), NO_READER, NO_POSITIONS];
    all.forEach((w) => {
      expect(w.length).toBeLessThanOrEqual(NOTICE_LINES);
      expect(wordsOf(JSON.parse(JSON.stringify(w)))).not.toBeNull();
      lines(w).forEach((s) => { expect(s).not.toContain('sheets:'); expect(s).not.toContain(' · '); expect(s).not.toContain(';'); expect(s.endsWith('.')).toBe(false); });
    });
  });

  test('every line has a Russian line with the same placeholders, and the viewer says it in Russian', () => {
    const holes = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join();
    NOTICE_KEYS.forEach((key) => { expect(RU[key], key).toBeString(); expect(holes(RU[key]!), key).toBe(holes(key)); });
    expect(lines(positionsRead(6, 1090, true), (key) => RU[key] ?? key, 'ru-RU').map((s) => s.replace(/\s/g, ' '))).toEqual(['Позиции обновлены', 'Счетов: 6', 'Позиций: 1 090', 'Сохранено в Google Sheets']);
  });

  test('a notice carries its words next to the English text; broken words are dropped', () => {
    const now = 5_000_000;
    const n = freshNotice(makeNotice('ok', positionsRead(2, 30, false), now), now)!;
    expect(n.text).toBe('Positions updated\nAccounts: 2\nPositions: 30');
    expect(n.words).toEqual(positionsRead(2, 30, false));
    expect(freshNotice(JSON.stringify({ at: now, level: 'ok', text: 'x', words: [{ key: 5 }] }), now)).toEqual({ at: now, level: 'ok', text: 'x' });
    expect(wordsOf([{ key: 'a', params: { n: {} } }])).toBeNull();
    expect(wordsOf('nope')).toBeNull();
  });
});
