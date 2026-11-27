/// <reference lib="esnext" />
/// <reference lib="dom" />
// Settings in a file, to carry them to another browser without copy and paste (owner 2026-11-27): the Google setup
// (Client ID, spreadsheet, email) and the view, encrypted by the browser's own WebCrypto with a key made from a
// password that is typed at export and at import and kept nowhere. The file is plain JSON whose only readable parts
// are the salt and the nonce (random, made here, never typed). Never in the file: the Google token (it lives an hour
// and is another sign-in away) and anything the script keeps on Fidelity
import { CONFIG_KEY } from '../../shared/sheets/gis';
import { VIEW_KEYS } from './prefs';

export const FILE_APP = 'fidelity-accounts';
export const ITERATIONS = 600000;
export const MIN_PASSWORD = 8;
/** the only keys that leave this browser and the only ones a file may write */
export const TRANSFER_KEYS: readonly string[] = [CONFIG_KEY, ...VIEW_KEYS];

export interface SettingsFile { app: string; kind: 'settings'; v: 1; kdf: 'PBKDF2-SHA256'; cipher: 'AES-256-GCM'; iterations: number; salt: string; iv: string; data: string }
export type TransferError = 'not-ours' | 'wrong-password';

const b64 = (bytes: Uint8Array): string => btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(''));
const unb64 = (text: string): Uint8Array<ArrayBuffer> => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

async function keyOf(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

type Reads = Pick<Storage, 'getItem'>;
type Writes = Pick<Storage, 'setItem'>;

/** the settings of this browser that travel: key -> stored text */
export function collectSettings(storage: Reads): Record<string, string> {
  const out: Record<string, string> = {};
  TRANSFER_KEYS.forEach((k) => { const v = storage.getItem(k); if (typeof v === 'string') out[k] = v; });
  return out;
}

export async function encryptSettings(settings: Record<string, string>, password: string, iterations = ITERATIONS): Promise<SettingsFile> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await keyOf(password, salt, iterations), new TextEncoder().encode(JSON.stringify(settings)));
  return { app: FILE_APP, kind: 'settings', v: 1, kdf: 'PBKDF2-SHA256', cipher: 'AES-256-GCM', iterations, salt: b64(salt), iv: b64(iv), data: b64(new Uint8Array(data)) };
}

/** the settings of a file, or why not: the file is not one of ours, or the password does not open it */
export async function decryptSettings(text: string, password: string): Promise<Record<string, string> | TransferError> {
  let f: Partial<SettingsFile>;
  try { f = JSON.parse(text) as Partial<SettingsFile>; } catch { return 'not-ours'; }
  const ours = f && f.app === FILE_APP && f.kind === 'settings' && f.v === 1 && typeof f.salt === 'string' && typeof f.iv === 'string' && typeof f.data === 'string'
    && typeof f.iterations === 'number' && f.iterations >= 1 && f.iterations <= 5000000;
  if (!ours) return 'not-ours';
  try {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(f.iv!) }, await keyOf(password, unb64(f.salt!), f.iterations!), unb64(f.data!));
    const json = JSON.parse(new TextDecoder().decode(plain)) as Record<string, unknown>;
    const out: Record<string, string> = {};
    // a file writes only the keys this app exports, whatever else it carries
    TRANSFER_KEYS.forEach((k) => { const v = json?.[k]; if (typeof v === 'string') out[k] = v; });
    return out;
  } catch { return 'wrong-password'; }
}

export function applySettings(settings: Record<string, string>, storage: Writes): number {
  const keys = Object.keys(settings).filter((k) => TRANSFER_KEYS.includes(k));
  keys.forEach((k) => storage.setItem(k, settings[k]));
  return keys.length;
}

export const fileName = (day: string): string => `${FILE_APP}-settings-${day}.json`;

/** hands the file to the browser's own download */
export function saveFile(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
