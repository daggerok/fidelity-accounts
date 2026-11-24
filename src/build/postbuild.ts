/// <reference types="bun" />
/// <reference types="node" />
/// <reference lib="esnext" />
// After `parcel build`: the Content-Security-Policy goes into dist/index.html (not into the source page, Parcel's dev
// server injects its own hot-reload scripts) and the userscript is bundled next to the viewer, so Pages serves both
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildUserscript } from './build-userscript';
import { withCsp } from './csp';

async function main(): Promise<void> {
  // DIST: another output folder for local checks (.check/out, ignored), the same as parcel's --dist-dir
  const dist = join(__dirname, '..', '..', process.env.DIST ?? 'dist');
  const page = join(dist, 'index.html');
  writeFileSync(page, withCsp(readFileSync(page, 'utf8')));
  await buildUserscript(dist);
}

main().catch((err: unknown) => { console.error(err); process.exitCode = 1; });
