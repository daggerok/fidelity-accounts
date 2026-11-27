/// <reference types="bun" />
/// <reference lib="esnext" />
import { expect, test } from 'bun:test';
import { squashAsk, squashed } from './squash';

test('the rows ask to squash on a move down past the first row and to open back at the top', () => {
  expect(squashAsk(30, 0)).toBeNull(); // not far enough
  expect(squashAsk(80, 30)).toBe('squash');
  expect(squashAsk(200, 400)).toBeNull(); // a move up changes nothing
  expect(squashAsk(0, 200)).toBe('open');
  expect(squashAsk(4, 10)).toBe('open');
});

test('only a phone with the settings shut is squashed, and a tap on the lit piece holds it open', () => {
  const on = { phone: true, settings: false, asked: true, held: false };
  expect(squashed(on)).toBe(true);
  expect(squashed({ ...on, phone: false })).toBe(false);
  expect(squashed({ ...on, settings: true })).toBe(false);
  expect(squashed({ ...on, asked: false })).toBe(false);
  expect(squashed({ ...on, held: true })).toBe(false);
});
