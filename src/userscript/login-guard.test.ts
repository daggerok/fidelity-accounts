/// <reference types="bun" />
/// <reference types="node" />
/// <reference lib="esnext" />
// The saved Fidelity login never leaves the script (owner 2026-11-23: "these creds will be never sent to anywhere"):
// the password is read only to type it into Fidelity's own login form; the viewer learns only "saved or not"; no other
// file of the script, the viewer or the shared code touches it
import { expect, test } from 'bun:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(__dirname, '..');
const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f) ? [p] : [];
});

test('the password is used only to type it into the login form', () => {
  // every line that names the password, and why it may
  const allowed: Array<[string, RegExp]> = [
    ['userscript/signin.ts', /export interface Login \{ user: string; pass: string \}/], // its type
    ['userscript/signin.ts', /if \(!allow\.pass\)/], // a flag of the 30-minute rule, not the password
    ['userscript/signin.ts', /typeInto\(f\.pass, login\.pass\)/], // typed into Fidelity's login form
    ['userscript/main.ts', /save: \(user: string, pass: string\) => \{ gmSet\(LOGIN_KEY, \{ user, pass \}\)/], // 🔑 Save into Tampermonkey storage
    ['userscript/badge.ts', /save: \(user: string, pass: string\) => void;/], // the panel's Save hook type
  ];
  const uses = files(SRC).flatMap((f) => readFileSync(f, 'utf8').split('\n').map((line) => ({ f: f.slice(SRC.length + 1), line }))
    .filter((x) => /\blogin\.pass\b|\.pass\)|\bpass:\s*string/.test(x.line)));
  uses.forEach((u) => { if (!allowed.some(([f, re]) => f === u.f && re.test(u.line))) throw new Error(`unexpected use of the password in ${u.f}: ${u.line.trim()}`); });
  expect(uses.some((u) => /typeInto\(f\.pass, login\.pass\)/.test(u.line))).toBe(true);
});

test('the login key is read only for the login form and the panel; the viewer gets a boolean', () => {
  const main = readFileSync(join(SRC, 'userscript', 'main.ts'), 'utf8').split('\n');
  const lines = main.filter((l) => /LOGIN_KEY/.test(l) && !/^const LOGIN_KEY/.test(l.trim()));
  lines.forEach((l) => {
    const ok = /\?\.user \?\? null/.test(l) // the panel shows the masked user name
      || /gmSet\(LOGIN_KEY, \{ user, pass \}\)/.test(l) // 🔑 Save
      || /gmDelete\(LOGIN_KEY\)/.test(l) // 🔑 Forget
      || /const login = gmGet<Login \| null>\(LOGIN_KEY, null\);/.test(l) // the login page, typed into the form
      || /saved: !!/.test(l); // the viewer: only whether one is saved
    if (!ok) throw new Error(`unexpected use of the login: ${l.trim()}`);
  });
  expect(lines.length).toBeGreaterThan(0);
  // nothing that leaves the script (Sheets, the dataset, JSON export) knows the Login type
  ['sheets-gm.ts', 'sheets-queue.ts', 'history-sync.ts', 'inject.ts', 'read.ts'].forEach((f) => expect(readFileSync(join(SRC, 'userscript', f), 'utf8')).not.toMatch(/\bLogin\b|LOGIN_KEY/));
});
