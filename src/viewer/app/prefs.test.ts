/// <reference types="bun" />
/// <reference types="node" />
/// <reference lib="esnext" />
import { expect, test } from 'bun:test';
import { COLUMNS_V, DEFAULT_PREFS, loadPrefs } from './prefs';
import { NEW_COLUMN_KEYS } from './position-columns';

const load = (json: string | null) => loadPrefs({ getItem: () => json });

test('no saved value or broken JSON gives the defaults', () => {
  expect(load(null)).toEqual(DEFAULT_PREFS);
  expect(load('{broken')).toEqual(DEFAULT_PREFS);
});

test('scope and search must be strings', () => {
  const p = load('{"scope":5,"search":null}');
  expect(p.scope).toBe('all');
  expect(p.search).toBe('');
  expect(load('{"scope":"account:X1","search":"abc"}').scope).toBe('account:X1');
});

test('period aliases and junk', () => {
  expect(load('{"period":"2Q"}').period).toBe('6M');
  expect(load('{"period":"9M"}').period).toBe('3Q');
  expect(load('{"period":"junk"}').period).toBe('1Y');
});

test('junk choices fall back to the defaults', () => {
  const p = load('{"moversOf":"junk","accountSort":"junk","tab":"junk"}');
  expect(p.moversOf).toBe('all');
  expect(p.accountSort).toBe('mine');
  expect(p.tab).toBe('summary');
});

test('column filters and types: only filled strings and known types stay', () => {
  const p = load('{"filters":{"sector":"energy, !tech","lastPrice":"  ","junk":5},"types":{"quantity":"currency","sector":"frequency","x":"nope"}}');
  expect(p.filters).toEqual({ sector: 'energy, !tech' });
  expect(p.types).toEqual({ quantity: 'currency', sector: 'frequency' });
  expect(load('{"filters":["a"],"types":"x"}').filters).toEqual({});
  expect(load('{"filters":["a"],"types":"x"}').types).toEqual({});
});

test('the columns added later start hidden once: by default and for a choice saved before them, never again after', () => {
  expect(NEW_COLUMN_KEYS.length).toBeGreaterThan(40);
  expect(DEFAULT_PREFS.hidden).toEqual(NEW_COLUMN_KEYS);
  const old = load(JSON.stringify({ hidden: ['sector'] }));
  expect(old.hidden).toEqual(['sector'].concat(NEW_COLUMN_KEYS));
  expect(old.columnsV).toBe(COLUMNS_V);
  // turned on after the upgrade: stays on
  const later = load(JSON.stringify({ hidden: ['sector'], columnsV: COLUMNS_V }));
  expect(later.hidden).toEqual(['sector']);
});
