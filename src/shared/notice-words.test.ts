/// <reference types="bun" />
/// <reference lib="esnext" />
import { describe, expect, test } from 'bun:test';
import { freshNotice, makeNotice } from './notice';
import { NOTICE_KEYS, balancesRead, betasRead, jobFailed, positionsRead, say, sheetsFailed, transactionsRead, wordsOf } from './notice-words';
import { RU } from '../viewer/app/i18n/ru';

describe('notification words', () => {
  test('a read of the positions is one sentence, a second one when the sheet got it', () => {
    expect(say(positionsRead(6, 1090, true))).toBe('Positions updated. Accounts: 6, positions: 1,090. Saved to Google Sheets.');
    expect(say(positionsRead(1, 1, false))).toBe('Positions updated. Accounts: 1, positions: 1.');
  });

  test('the other jobs', () => {
    expect(say(balancesRead(4, 6, false))).toBe('Daily balances updated. Accounts: 4 of 6.');
    expect(say(transactionsRead(18005, 5, true))).toBe('Transactions updated. New: 5, total: 18,005. Saved to Google Sheets.');
    expect(say(transactionsRead(18000, 0, false))).toBe('Transactions checked, nothing new. Total: 18,000.');
    expect(say(betasRead(210, 217, false))).toBe('Betas updated. Found: 210 of 217.');
    expect(say(jobFailed('positions', new Error('no grid')))).toBe('Could not read the positions: no grid');
    expect(say(sheetsFailed('x'.repeat(500))).length).toBeLessThan(240);
  });

  test('no notice is glued from the panel log lines', () => {
    [positionsRead(6, 1090, true), balancesRead(6, 6, true), transactionsRead(10, 1, true), betasRead(1, 2, true)].map((w) => say(w)).forEach((s) => {
      expect(s).not.toContain('sheets:');
      expect(s).not.toContain(' · ');
      expect(s).not.toContain(';');
    });
  });

  test('every sentence has a Russian line with the same placeholders, and the viewer says it in Russian', () => {
    const holes = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join();
    NOTICE_KEYS.forEach((key) => { expect(RU[key], key).toBeString(); expect(holes(RU[key]!), key).toBe(holes(key)); });
    expect(say(positionsRead(6, 1090, true), (key) => RU[key] ?? key, 'ru-RU').replace(/\s/g, ' ')).toBe('Позиции обновлены. Счетов: 6, позиций: 1 090. Сохранено в Google Sheets.');
  });

  test('a notice carries its words next to the English text; broken words are dropped', () => {
    const now = 5_000_000;
    const n = freshNotice(makeNotice('ok', positionsRead(2, 30, false), now), now)!;
    expect(n.text).toBe('Positions updated. Accounts: 2, positions: 30.');
    expect(n.words).toEqual(positionsRead(2, 30, false));
    expect(freshNotice(JSON.stringify({ at: now, level: 'ok', text: 'x', words: [{ key: 5 }] }), now)).toEqual({ at: now, level: 'ok', text: 'x' });
    expect(wordsOf([{ key: 'a', params: { n: {} } }])).toBeNull();
    expect(wordsOf('nope')).toBeNull();
  });
});
