/// <reference types="bun" />
/// <reference lib="esnext" />
import { expect, test } from 'bun:test';
import { TRANSFER_KEYS, applySettings, collectSettings, decryptSettings, encryptSettings, fileName } from './transfer';

// few rounds here: the real count only makes guessing slow
const ROUNDS = 1000;
const store = (seed: Record<string, string>) => {
  const m = new Map(Object.entries(seed));
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, m };
};

test('only the setup and the view travel: never the Google token or a neighbour app key', () => {
  const s = store({ 'fidelity-accounts-gs-config': '{"clientId":"c"}', 'fidelity-accounts.prefs': '{}', 'fidelity-accounts-google-token': 'secret', 'other-app.setting': '1' });
  expect(collectSettings(s)).toEqual({ 'fidelity-accounts-gs-config': '{"clientId":"c"}', 'fidelity-accounts.prefs': '{}' });
  expect(TRANSFER_KEYS).not.toContain('fidelity-accounts-google-token');
});

test('a file opens with its password and shows nothing without it', async () => {
  const settings = { 'fidelity-accounts-gs-config': '{"clientId":"my-client","spreadsheetId":"my-sheet"}' };
  const file = await encryptSettings(settings, 'correct horse', ROUNDS);
  const text = JSON.stringify(file);
  expect(text).not.toContain('my-client');
  expect(text).not.toContain('my-sheet');
  expect(await decryptSettings(text, 'correct horse')).toEqual(settings);
  expect(await decryptSettings(text, 'wrong horse')).toBe('wrong-password');
});

test('two exports of the same settings differ: the salt and the nonce are new each time', async () => {
  const a = await encryptSettings({}, 'password1', ROUNDS);
  const b = await encryptSettings({}, 'password1', ROUNDS);
  expect(a.salt).not.toBe(b.salt);
  expect(a.data).not.toBe(b.data);
});

test('a changed file and a file of something else are refused', async () => {
  const file = await encryptSettings({ 'fidelity-accounts.lang': 'ru' }, 'password1', ROUNDS);
  const last = file.data.slice(-4);
  const cut = { ...file, data: file.data.slice(0, -4) + (last === 'AAAA' ? 'BBBB' : 'AAAA') };
  expect(await decryptSettings(JSON.stringify(cut), 'password1')).toBe('wrong-password');
  expect(await decryptSettings('not json', 'password1')).toBe('not-ours');
  expect(await decryptSettings(JSON.stringify({ ...file, app: 'other' }), 'password1')).toBe('not-ours');
  expect(await decryptSettings('null', 'password1')).toBe('not-ours');
});

test('a file writes only the keys this app exports', async () => {
  const file = await encryptSettings({ 'fidelity-accounts.lang': 'ru', 'fidelity-accounts-google-token': 'x', 'other-app.setting': 'y' } as Record<string, string>, 'password1', ROUNDS);
  const read = await decryptSettings(JSON.stringify(file), 'password1');
  expect(read).toEqual({ 'fidelity-accounts.lang': 'ru' });
  const s = store({});
  expect(applySettings({ 'fidelity-accounts.lang': 'ru', 'other-app.setting': 'y' }, s)).toBe(1);
  expect(Array.from(s.m.keys())).toEqual(['fidelity-accounts.lang']);
});

test('the file is named by the app and the day', () => {
  expect(fileName('2026-11-27')).toBe('fidelity-accounts-settings-2026-11-27.json');
});
