/// <reference lib="esnext" />
// Google Sheets API v4 over an injected fetch and token getter, so the viewer (window.fetch + GIS) and
// the userscript (GM_xmlhttpRequest + the token the viewer shared) run the same code. Rewritten after
// daggerok/twitter src/sheets.ts: writes are "overwrite rows 2..n+1 in one PUT, then clear the tail",
// so a failed PUT leaves the old rows in place; the clear ends at the grid row count (a range past the
// grid is a 400). A 401 asks the getter for a fresh token once and repeats the call once.
// One client is one run of writes (the userscript makes a new one per writeSets): the tab list is read once and kept,
// updated after a tab is added, frozen or grown by a write, so a run of 6 tabs no longer lists them 6 times (review
// 2026-11-25: 14 of 29 calls of a summary plus positions write were this overhead)
import { columnLetter, type Cell, type TabSpec } from './tabs';

const API = 'https://sheets.googleapis.com/v4';

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;
// force = true: the last token got a 401, renew it even when it looks fresh
export type TokenGetter = (force: boolean) => Promise<string>;

export interface SheetsClientOptions {
  fetch: FetchLike;
  getToken: TokenGetter;
  spreadsheetId: string;
}

export interface TabInfo {
  title: string;
  sheetId: number;
  rows: number;
  frozenRows: number;
}

export class SheetsError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'SheetsError';
    this.status = status;
  }
}

export const statusOf = (e: unknown): number =>
  typeof e === 'object' && e !== null && typeof (e as { status?: unknown }).status === 'number' ? (e as { status: number }).status : 0;

/** Tab names here are fidelity_*, but any name is quoted the way A1 notation wants it. */
export const quoteTab = (name: string): string => (/^[A-Za-z0-9_]+$/.test(name) ? name : "'" + name.replace(/'/g, "''") + "'");
/** characters of row JSON per PUT (the Sheets API wants requests well under 2 MB) */
export const CHUNK_CHARS = 900_000;

const a1 = (tab: string, cells: string): string => quoteTab(tab) + '!' + cells;
const enc = (tab: string, cells: string): string => encodeURIComponent(a1(tab, cells));

type Meta = {
  properties?: { title?: string };
  sheets?: { properties?: SheetProps }[];
};
type SheetProps = { title?: string; sheetId?: number; gridProperties?: { rowCount?: number; frozenRowCount?: number } };

const toInfo = (p: SheetProps | undefined): TabInfo => ({
  title: (p && p.title) || '',
  sheetId: p && typeof p.sheetId === 'number' ? p.sheetId : -1,
  rows: (p && p.gridProperties && p.gridProperties.rowCount) || 0,
  frozenRows: (p && p.gridProperties && p.gridProperties.frozenRowCount) || 0,
});

/**
 * One part of a big write (writeAll in parts under CHUNK_CHARS): its first row number, its row count and a print of
 * exactly the cells it sent. A caller that keeps the parts of its last successful write of a tab to this spreadsheet
 * hands them back, and the parts with the same print, first row and count are not sent again (fidelity_transactions:
 * rows are sorted by date, new ones land in the last part)
 */
export interface ChunkPrint { start: number; count: number; print: string }

/** stored chunk prints read back from storage: anything malformed reads as none (then everything is written) */
export function chunkPrintsOf(raw: unknown): ChunkPrint[] {
  if (!Array.isArray(raw)) return [];
  const ok = raw.every((c) => !!c && typeof c === 'object' && Number.isInteger((c as ChunkPrint).start) && Number.isInteger((c as ChunkPrint).count) && (c as ChunkPrint).count > 0 && typeof (c as ChunkPrint).print === 'string');
  return ok ? (raw as ChunkPrint[]).map((c) => ({ start: c.start, count: c.count, print: c.print })) : [];
}

// two independent 32-bit hashes and the length of the part's JSON: a changed part with the same print is out of reach
function printOf(json: string, count: number): string {
  let h1 = 5381;
  let h2 = 0x811c9dc5;
  for (let i = 0; i < json.length; i++) {
    const c = json.charCodeAt(i);
    h1 = ((h1 * 33) ^ c) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x01000193) >>> 0;
  }
  return `${count}:${json.length}:${h1.toString(36)}:${h2.toString(36)}`;
}

export interface UpsertOptions<T> {
  // how a stored record and an incoming one with the same id combine (default: the incoming one wins)
  merge?: (stored: T, incoming: T) => T;
  // order of the written rows (default: stored order, new ids appended in their incoming order)
  sort?: (a: T, b: T) => number;
}

export class SheetsClient {
  private readonly opts: SheetsClientOptions;
  // the tab list of this run (null until the first listTabs)
  private tabsCache: TabInfo[] | null = null;

  constructor(opts: SheetsClientOptions) {
    this.opts = opts;
  }

  get spreadsheetId(): string {
    return this.opts.spreadsheetId;
  }

  /** One Sheets call; a 401 renews the token and repeats once. Errors carry the status and Google's message. */
  async call<T>(method: string, path: string, body?: unknown, what?: string): Promise<T> {
    let token = await this.opts.getToken(false);
    let res = await this.send(method, path, token, body);
    if (res.status === 401) {
      token = await this.opts.getToken(true);
      res = await this.send(method, path, token, body);
    }
    const textBody = await res.text();
    let json: unknown = null;
    try { json = textBody ? JSON.parse(textBody) : null; } catch { /* not json */ }
    if (!res.ok) {
      const err = json as { error?: { message?: string } } | null;
      const msg = (err && err.error && err.error.message) || textBody.slice(0, 200) || 'HTTP ' + res.status;
      const hint = res.status === 401 ? ' (sign in to Google again)'
        : res.status === 403 ? ' (no access to this spreadsheet with this Google account)'
        : res.status === 404 ? ' (spreadsheet not found: check its URL)'
        : '';
      throw new SheetsError('Google Sheets ' + res.status + ' on ' + (what || method + ' ' + path.split('?')[0]) + ': ' + msg + hint, res.status);
    }
    return json as T;
  }

  private send(method: string, path: string, token: string, body: unknown): Promise<Response> {
    const headers: Record<string, string> = { Authorization: 'Bearer ' + token };
    const init: RequestInit = { method, headers };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    return this.opts.fetch(API + path, init);
  }

  private get base(): string {
    const id = this.opts.spreadsheetId.trim();
    if (!id) throw new SheetsError('No spreadsheet: attach one in Setup first', 0);
    return '/spreadsheets/' + encodeURIComponent(id);
  }

  /** The spreadsheet title and its tabs (Attach checks access with it). */
  async listTabs(): Promise<{ title: string; tabs: TabInfo[] }> {
    const m = await this.call<Meta>('GET', this.base + '?fields=properties.title,sheets.properties(title,sheetId,gridProperties(rowCount,frozenRowCount))', undefined, 'list tabs');
    const tabs = (m && m.sheets ? m.sheets : []).map((s) => toInfo(s.properties)).filter((t) => !!t.title);
    this.tabsCache = tabs.slice();
    return { title: (m && m.properties && m.properties.title) || '', tabs };
  }

  // the tabs as this run knows them: listed once, then kept up to date by remember()
  private async knownTabs(): Promise<TabInfo[]> {
    return this.tabsCache ?? (await this.listTabs()).tabs;
  }

  private remember(tab: TabInfo): void {
    if (!this.tabsCache) return;
    this.tabsCache = this.tabsCache.filter((t) => t.title !== tab.title).concat([tab]);
  }

  /** A new spreadsheet (Create in Setup); does not need the bound spreadsheet id. */
  async createSpreadsheet(title: string): Promise<{ id: string; url: string }> {
    const res = await this.call<{ spreadsheetId?: string; spreadsheetUrl?: string }>('POST', '/spreadsheets', {
      properties: { title: title.trim() || 'fidelity-accounts' },
    }, 'create spreadsheet');
    if (!res || !res.spreadsheetId) throw new SheetsError('Google Sheets did not return the new spreadsheet id', 0);
    return { id: res.spreadsheetId, url: res.spreadsheetUrl || 'https://docs.google.com/spreadsheets/d/' + res.spreadsheetId + '/edit' };
  }

  /** The tab exists, row 1 holds the header and is frozen. Returns the tab with its grid size. */
  async ensureTab<T>(spec: TabSpec<T>): Promise<TabInfo> {
    return (await this.ensure(spec)).tab;
  }

  // `fresh`: the tab was not there when this run listed the tabs, or its header was empty, so nothing a caller kept
  // about its rows (chunk prints) describes it
  private async ensure<T>(spec: TabSpec<T>): Promise<{ tab: TabInfo; fresh: boolean }> {
    const tabs = await this.knownTabs();
    let tab: TabInfo | undefined = tabs.filter((t) => t.title === spec.name)[0];
    const fresh = !tab;
    if (!tab) {
      try {
        const r = await this.call<{ replies?: { addSheet?: { properties?: SheetProps } }[] }>('POST', this.base + ':batchUpdate', {
          requests: [{ addSheet: { properties: { title: spec.name, gridProperties: { frozenRowCount: 1 } } } }],
        }, 'create tab ' + spec.name);
        const added = r && r.replies && r.replies[0] && r.replies[0].addSheet ? r.replies[0].addSheet.properties : undefined;
        tab = added ? toInfo(added) : undefined;
      } catch (e) {
        // a concurrent writer (viewer and userscript) may have added it: 400 "already exists"; others surface
        if (statusOf(e) !== 400) throw e;
      }
      // the 400 path lists the tabs again (and so refreshes this run's list)
      if (!tab) tab = (await this.listTabs()).tabs.filter((t) => t.title === spec.name)[0];
      if (!tab) throw new SheetsError('Tab ' + spec.name + ' could not be created', 0);
      this.remember(tab);
    } else if (tab.frozenRows < 1 && tab.sheetId >= 0) {
      await this.call('POST', this.base + ':batchUpdate', {
        requests: [{ updateSheetProperties: { properties: { sheetId: tab.sheetId, gridProperties: { frozenRowCount: 1 } }, fields: 'gridProperties.frozenRowCount' } }],
      }, 'freeze header of ' + spec.name);
      tab = { title: tab.title, sheetId: tab.sheetId, rows: tab.rows, frozenRows: 1 };
      this.remember(tab);
    }
    // The header must start with this version's columns; extra columns on the right (the owner's notes, formulas)
    // are kept. A different layout is never cleared (review 2026-11-22: a hand-edited header or a viewer newer than
    // the installed script would wipe the tab): writing stops with a clear error instead
    const head = await this.call<{ values?: unknown[][] }>('GET', this.base + '/values/' + enc(spec.name, '1:1') + '?valueRenderOption=UNFORMATTED_VALUE', undefined, 'read header of ' + spec.name);
    const stored = (head && head.values && head.values[0] ? head.values[0] : []).map((v) => String(v));
    const current = stored.map((v) => v.trim());
    const ours = current.slice(0, spec.columns.length);
    const empty = ours.every((v) => v === '');
    // a header this tab had before (the same columns in the same places, renamed since) is ours: it gets the new names below
    const earlier = (spec.earlier ?? []).some((h) => h.join('\u0001') === ours.join('\u0001'));
    if (!empty && !earlier && ours.join('\u0001') !== spec.columns.join('\u0001')) {
      throw new SheetsError(`${spec.name}: its header differs from this version (${ours.slice(0, 4).join(', ')}…): update the script and the page to the same version, or rename the tab to start it fresh`, 409);
    }
    // the PUT would write exactly what is there: skipped only when the stored cells equal this version's columns
    // character for character (a cell with spaces around a name still gets rewritten, as before)
    const same = spec.columns.length > 0 && spec.columns.every((c, i) => stored[i] === c);
    if (!same) {
      const cells = 'A1:' + spec.lastCol + '1';
      await this.call('PUT', this.base + '/values/' + enc(spec.name, cells) + '?valueInputOption=RAW', {
        range: a1(spec.name, cells),
        majorDimension: 'ROWS',
        values: [spec.columns.slice()],
      }, 'write header of ' + spec.name);
    }
    return { tab, fresh: fresh || empty };
  }

  /**
   * A tab whose header may grow (fidelity_positions_all): reads row 1, lets `grow` add the missing columns (appended,
   * never reordered) and writes it back when it changed. A missing tab is created later by writeAll with this header
   */
  async growTabHeader(name: string, keys: string[], grow: (stored: string[], keys: string[]) => string[]): Promise<string[]> {
    const tabs = await this.knownTabs();
    let stored: string[] = [];
    if (tabs.some((t) => t.title === name)) {
      const head = await this.call<{ values?: unknown[][] }>('GET', this.base + '/values/' + enc(name, '1:1') + '?valueRenderOption=UNFORMATTED_VALUE', undefined, 'read header of ' + name);
      stored = (head && head.values && head.values[0] ? head.values[0] : []).map((v) => String(v));
    }
    const header = grow(stored, keys);
    if (stored.length && header.join('\u0001') !== stored.join('\u0001')) {
      const cells = 'A1:' + columnLetter(header.length) + '1';
      await this.call('PUT', this.base + '/values/' + enc(name, cells) + '?valueInputOption=RAW', { range: a1(name, cells), majorDimension: 'ROWS', values: [header] }, 'grow header of ' + name);
    }
    return header;
  }

  /** Every record of a tab (rows 2..), rows without an id skipped. */
  async readRows<T>(spec: TabSpec<T>): Promise<T[]> {
    const r = await this.call<{ values?: unknown[][] }>('GET', this.base + '/values/' + enc(spec.name, 'A2:' + spec.lastCol) + '?valueRenderOption=UNFORMATTED_VALUE&majorDimension=ROWS', undefined, 'read ' + spec.name);
    const out: T[] = [];
    (r && r.values ? r.values : []).forEach((row) => {
      const rec = spec.fromRow(row);
      if (rec) out.push(rec);
    });
    return out;
  }

  /**
   * Replace the tab's rows with these records: header ensured, rows 2..n+1 in one PUT (the grid grows as
   * needed), then the old rows past n+1 cleared up to the grid row count. Duplicate ids: the last one wins.
   * `prev` (fidelity_transactions only): the chunk prints of the last successful write of this tab to this spreadsheet;
   * the parts before the first one that differs are not sent again, and the prints of this write come back in `chunks`.
   * Without `prev` every part is written, as always. The accepted limit, the same as the per-set prints have for whole
   * sets: rows changed by hand in the sheet are not repaired while their part is unchanged on our side. A tab created
   * in this run, an empty header or a grid shorter than the stored parts write everything
   */
  async writeAll<T>(spec: TabSpec<T>, records: T[], prev?: ChunkPrint[]): Promise<{ written: number; chunks?: ChunkPrint[] }> {
    const { tab, fresh } = await this.ensure(spec);
    return this.writeRows(spec, tab, records, prev ? (fresh ? [] : prev) : undefined);
  }

  private async writeRows<T>(spec: TabSpec<T>, tab: TabInfo, records: T[], prev?: ChunkPrint[]): Promise<{ written: number; chunks?: ChunkPrint[] }> {
    const rows = dedupe(spec, records).map(spec.toRow);
    const chunks: ChunkPrint[] | undefined = prev ? [] : undefined;
    // the stored parts are trusted only while the grid still reaches their last row (a shrunk tab writes everything)
    const lastPrev = prev && prev.length ? prev[prev.length - 1]! : null;
    let skipping = !!lastPrev && tab.rows >= lastPrev.start + lastPrev.count - 1;
    // A PUT grows the grid only when it starts inside it: a later part that starts past the last grid row is a 400
    // "exceeds grid limits" (seen live 2026-11-26: fidelity_transactions, part 2 at row 7037 of a 7036 row grid, its
    // unchanged part 1 not sent). So the grid gets the missing rows first
    if (rows.length + 1 > tab.rows && tab.sheetId >= 0) {
      await this.call('POST', this.base + ':batchUpdate', {
        requests: [{ appendDimension: { sheetId: tab.sheetId, dimension: 'ROWS', length: rows.length + 1 - tab.rows } }],
      }, 'add rows to ' + spec.name);
    }
    // big tabs go in parts (fidelity: ~1,100 positions with every field are a few MB), each PUT under about 1 MB
    let start = 0;
    let part = 0;
    while (start < rows.length) {
      let end = start;
      let size = 0;
      const json: string[] = [];
      while (end < rows.length && (end === start || size < CHUNK_CHARS)) { const j = JSON.stringify(rows[end]); json.push(j); size += j.length; end += 1; }
      const cells = 'A' + (start + 2) + ':' + spec.lastCol + (end + 1);
      let send = true;
      if (chunks) {
        const c: ChunkPrint = { start: start + 2, count: end - start, print: printOf('[' + json.join(',') + ']', end - start) };
        chunks.push(c);
        const old = prev![part];
        // the first part that differs and every part after it are written
        if (skipping && old && old.start === c.start && old.count === c.count && old.print === c.print) send = false;
        else skipping = false;
      }
      if (send) {
        await this.call('PUT', this.base + '/values/' + enc(spec.name, cells) + '?valueInputOption=RAW', {
          range: a1(spec.name, cells),
          majorDimension: 'ROWS',
          values: rows.slice(start, end) as Cell[][],
        }, 'write ' + spec.name);
      }
      start = end;
      part += 1;
    }
    // the PUT only adds grid rows up to n+1, so the grid size seen before it bounds the old tail
    if (tab.rows > rows.length + 1) {
      const tail = 'A' + (rows.length + 2) + ':' + spec.lastCol + tab.rows;
      await this.call('POST', this.base + '/values/' + enc(spec.name, tail) + ':clear', {}, 'clear the tail of ' + spec.name);
    }
    // a write past the grid grew it: a later write of this tab in the same run clears its tail up to the new size
    if (rows.length + 1 > tab.rows) this.remember({ title: tab.title, sheetId: tab.sheetId, rows: rows.length + 1, frozenRows: tab.frozenRows });
    return chunks ? { written: rows.length, chunks } : { written: rows.length };
  }

  /** Read the tab, merge the records in by id, write it back. */
  async upsertById<T>(spec: TabSpec<T>, records: T[], options?: UpsertOptions<T>): Promise<{ inserted: number; updated: number; total: number }> {
    const { tab } = await this.ensure(spec);
    const stored = await this.readRows(spec);
    const merge = options && options.merge;
    const order: string[] = [];
    const byId = new Map<string, T>();
    stored.forEach((r) => {
      const id = spec.idOf(r);
      if (!byId.has(id)) order.push(id);
      byId.set(id, r);
    });
    const storedIds = new Set<string>(order);
    const counted = new Set<string>();
    let inserted = 0;
    let updated = 0;
    records.forEach((r) => {
      const id = spec.idOf(r);
      const old = byId.get(id);
      if (old === undefined) order.push(id);
      if (!counted.has(id)) {
        counted.add(id);
        if (storedIds.has(id)) updated += 1;
        else inserted += 1;
      }
      byId.set(id, old !== undefined && merge ? merge(old, r) : r);
    });
    const all = order.map((id) => byId.get(id) as T);
    if (options && options.sort) all.sort(options.sort);
    await this.writeRows(spec, tab, all);
    return { inserted, updated, total: all.length };
  }
}

function dedupe<T>(spec: TabSpec<T>, records: T[]): T[] {
  if (spec.repeats) return records;
  const last = new Map<string, number>();
  records.forEach((r, i) => last.set(spec.idOf(r), i));
  return records.filter((r, i) => last.get(spec.idOf(r)) === i);
}
