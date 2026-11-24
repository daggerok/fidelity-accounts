/// <reference lib="esnext" />
/// <reference types="node" />
// The version of this viewer build (= the script it serves): `build` sets APP_VERSION from package.json and Parcel
// puts the value in place of process.env.APP_VERSION; "dev" on the dev server and in tests
export const APP_VERSION: string = process.env.APP_VERSION || 'dev';

// "0.3.3" < "0.4.1"; anything unparsable is never called outdated
export function isOlder(installed: string | null, current: string): boolean {
  const parse = (v: string) => (/^\d+\.\d+\.\d+$/.test(v) ? v.split('.').map(Number) : null);
  const a = installed ? parse(installed) : null;
  const b = parse(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i]! < b[i]!;
  return false;
}
