/// <reference types="bun" />
/// <reference lib="esnext" />
import { expect, test } from 'bun:test';
import { memoByRaw } from './memo';

test('the same stored string parses once and gives the same object; another string parses again', () => {
  let parses = 0;
  const m = memoByRaw((raw: string) => { parses += 1; return raw ? (JSON.parse(raw) as { n: number }) : null; });
  const a = m.get('{"n":1}');
  expect(m.get('{"n":1}')).toBe(a);
  expect(parses).toBe(1);
  expect(m.get('{"n":2}')).toEqual({ n: 2 });
  expect(m.get('{"n":1}')).not.toBe(a); // one entry: the older string parses again
  expect(parses).toBe(3);
  expect(m.get('')).toBeNull();
  expect(parses).toBe(4);
});

test('a primed value stands for its string until storage holds another one', () => {
  let parses = 0;
  const m = memoByRaw((raw: string) => { parses += 1; return JSON.parse(raw) as { n: number }; });
  const built = { n: 5 };
  m.prime(JSON.stringify(built), built);
  expect(m.get('{"n":5}')).toBe(built);
  expect(parses).toBe(0);
  // the write did not land (storage full): the old string comes back and is parsed
  expect(m.get('{"n":4}')).toEqual({ n: 4 });
  expect(parses).toBe(1);
});
