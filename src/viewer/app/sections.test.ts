/// <reference types="bun" />
/// <reference lib="esnext" />
import { expect, test } from 'bun:test';
import { SECTIONS_KEY, readSections, saveSection, sectionOpen } from './sections';

const store = (seed: Record<string, string> = {}) => {
  const m = new Map(Object.entries(seed));
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); } };
};

test('a section the owner folded stays folded, an untouched one follows its default', () => {
  const s = store();
  expect(sectionOpen(readSections(s), 'get-started', true)).toBe(true);
  expect(sectionOpen(readSections(s), 'get-started', false)).toBe(false);
  saveSection(s, 'get-started', false);
  expect(sectionOpen(readSections(s), 'get-started', true)).toBe(false);
  // another section keeps its own choice
  expect(sectionOpen(readSections(s), 'preferences', true)).toBe(true);
  saveSection(s, 'preferences', false);
  expect(readSections(s)).toEqual({ 'get-started': false, preferences: false });
});

test('a broken or foreign saved value reads as no choice', () => {
  expect(readSections(store({ [SECTIONS_KEY]: 'not json' }))).toEqual({});
  expect(readSections(store({ [SECTIONS_KEY]: '{"a":"yes","b":true}' }))).toEqual({ b: true });
  expect(readSections(undefined)).toEqual({});
});
