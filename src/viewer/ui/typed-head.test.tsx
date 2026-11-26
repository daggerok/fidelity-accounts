/// <reference types="bun" />
/// <reference types="node" />
/// <reference lib="esnext" />
// The shared table head: every word of the filter engine has a Russian line, and the filter input applies after a
// pause, at once on Enter, and clears by ✕ or Esc
import { afterAll, beforeAll, expect, test } from 'bun:test';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { ALL_TYPES, TYPE_HELP, TYPE_NAMES } from '../../shared/typed-columns';
import { RU } from '../app/i18n/ru';

beforeAll(() => {
  GlobalRegistrator.register({ url: 'https://daggerok.github.io/fidelity-accounts/' });
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterAll(() => GlobalRegistrator.unregister());

test('the type names and the filter help of every type have a Russian line', () => {
  const missing = ALL_TYPES.map((type) => TYPE_NAMES[type]).concat(ALL_TYPES.map((type) => TYPE_HELP[type])).filter((text) => !(text in RU));
  expect(missing).toEqual([]);
});

const wait = (ms: number) => new Promise((done) => { setTimeout(done, ms); });

test('a table sorts, filters and changes a column type through its head', async () => {
  const { act } = await import('react');
  const { createRoot } = await import('react-dom/client');
  const { FILTER_DEBOUNCE_MS, TypedHead } = await import('./TypedHead');
  const { useTypedTable } = await import('./useTypedTable');
  interface Row { name: string; freq: string; value: number }
  const data: Row[] = [{ name: 'beta', freq: 'Quarterly', value: 10 }, { name: 'alpha', freq: 'Monthly', value: 300 }, { name: 'gamma', freq: 'Annually', value: 25 }];
  const cols = [
    { key: 'name', label: 'Name', text: (r: Row) => r.name },
    { key: 'freq', label: 'Frequency', text: (r: Row) => r.freq },
    { key: 'value', label: 'Value', text: (r: Row) => `$${r.value.toFixed(2)}`, value: (r: Row) => r.value },
  ];
  function Table() {
    const table = useTypedTable(cols, data);
    return <table><TypedHead cols={cols} control={table.control} /><tbody>{table.rows.map((r) => <tr key={r.name} data-row={r.name} />)}</tbody></table>;
  }
  document.body.innerHTML = '<div id="root"></div>';
  const root = createRoot(document.getElementById('root')!);
  await act(async () => root.render(<Table />));
  const rows = () => Array.from(document.querySelectorAll('[data-row]')).map((el) => el.getAttribute('data-row')).join(' ');
  const q = <T extends Element>(sel: string) => document.querySelector<T>(sel)!;
  const badges = () => Array.from(document.querySelectorAll('[data-type-badge]')).map((el) => el.textContent).join(' ');
  const type = async (key: string, text: string) => {
    const input = q<HTMLInputElement>(`[data-filter="${key}"]`);
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, text);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  };
  const key = async (name: string, k: string) => act(async () => { q(`[data-filter="${name}"]`).dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })); });

  expect(rows()).toBe('beta alpha gamma'); // no sort chosen: the order the rows came in
  expect(badges()).toBe('ABC FRQ $');
  expect(q<HTMLInputElement>('[data-filter="value"]').placeholder).toBe('>1B, ..500M');

  // sort: text starts A to Z, frequency with the most frequent first, a second click turns it around
  await act(async () => q<HTMLButtonElement>('[data-sort="name"]').click());
  expect(rows()).toBe('alpha beta gamma');
  expect(q('[data-col="name"]').getAttribute('aria-sort')).toBe('ascending');
  await act(async () => q<HTMLButtonElement>('[data-sort="freq"]').click());
  expect(rows()).toBe('alpha beta gamma');
  expect(q('[data-sort="freq"]').textContent).toBe('Frequency ▼');
  await act(async () => q<HTMLButtonElement>('[data-sort="freq"]').click());
  expect(rows()).toBe('gamma beta alpha');

  // typing applies after the pause, not at once; ✕ shows up and clears at once
  await type('value', '>20');
  expect(rows()).toBe('gamma beta alpha');
  await act(async () => { await wait(FILTER_DEBOUNCE_MS + 50); });
  expect(rows()).toBe('gamma alpha');
  await act(async () => q<HTMLButtonElement>('[data-filter-clear="value"]').click());
  expect(rows()).toBe('gamma beta alpha');
  expect(document.querySelector('[data-filter-clear="value"]')).toBeNull();

  // Enter applies at once, Esc clears; a filter that cannot be read is marked and filters nothing
  await type('freq', 'monthly, ann');
  await key('freq', 'Enter');
  expect(rows()).toBe('gamma alpha');
  await key('freq', 'Escape');
  expect(rows()).toBe('gamma beta alpha');
  await type('value', 'abc');
  await key('value', 'Enter');
  expect(rows()).toBe('gamma beta alpha');
  expect(q('[data-filter="value"]').getAttribute('aria-invalid')).toBe('true');
  expect(q('[data-filter="value"]').getAttribute('title')).toContain('cannot read "abc" as money');
  await key('value', 'Escape');

  // the badge sets the next type, Shift+click returns to the detected one
  await act(async () => q<HTMLButtonElement>('[data-col="freq"] [data-type-badge]').click());
  expect(badges()).toBe('ABC ABC $');
  await act(async () => { q('[data-col="freq"] [data-type-badge]').dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true })); });
  expect(badges()).toBe('ABC FRQ $');
  await act(async () => root.unmount());
});
