/// <reference types="bun" />
/// <reference types="node" />
/// <reference lib="esnext" />
// Bundles userscript/src/main.ts with its Tampermonkey header into dist/fidelity-accounts-sync.user.js.
// Run by `postbuild` (Pages serves it next to the viewer) and, with --dev (also runs on localhost), by `preserve`
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { USERSCRIPT_FILE, userscriptHeader } from '../userscript/header';

const root = join(__dirname, '..', '..');

export async function buildUserscript(outDir = join(root, 'dist'), dev = false): Promise<string> {
  const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { version: string };
  const result = await Bun.build({
    entrypoints: [join(root, 'src/userscript/main.ts')],
    target: 'browser',
    format: 'iife',
    define: { __VERSION__: JSON.stringify(version) },
  });
  if (!result.success) {
    for (const log of result.logs) console.error(String(log));
    throw new Error('userscript bundle failed');
  }
  const out = userscriptHeader(version, dev) + (await result.outputs[0]!.text());
  mkdirSync(outDir, { recursive: true });
  const file = join(outDir, USERSCRIPT_FILE);
  writeFileSync(file, out);
  console.log(`${file.replace(`${root}/`, '')}: ${out.length} bytes, version ${version}`);
  return file;
}

if (require.main === module) buildUserscript(undefined, process.argv.includes('--dev')).catch((err: unknown) => { console.error(err); process.exitCode = 1; });
