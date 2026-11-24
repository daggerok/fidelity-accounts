/// <reference lib="esnext" />
// The positions grid (ag-grid) keeps the raw row objects of Fidelity's own positions answer in the page's JavaScript
// world, not in the DOM, so a tiny reader runs in the page: it only READS the grid's row data (forEachNode) and posts
// a copy to the content side when it changed and stayed the same for one more tick (quotes columns fill a little
// after the rows), or at once when asked. It sends no request and touches nothing on the page.
// GM_addElement puts it in the page past the site's CSP (twitter 2.2.4 lesson); GM_* through typeof in try/catch
export const PAGE_TAG = 'fidelity-accounts-page';

declare const GM_addElement: ((tag: string, attrs: Record<string, string>) => HTMLElement) | undefined;

// runs in the page: keep it self-contained (no imports, no closures over the bundle). A cheap signature (row count,
// summed values, filled quote columns) decides "changed" and "stable"; the 5 MB copy is made only to post it
export function pageReader(tag: string): void {
  let posted = '';
  let seen = '';
  type Cell = { val?: unknown } | undefined;
  const read = (): Array<Record<string, Cell>> | null => {
    const row = document.querySelector('.ag-row');
    if (!row) return null;
    const key = Object.getOwnPropertyNames(row).filter((k) => k.indexOf('__AG_') === 0)[0];
    const comp = key ? (row as unknown as Record<string, { renderedRow?: { beans?: { gridApi?: { forEachNode?: (fn: (n: { data?: Record<string, Cell> }) => void) => void } } } }>)[key] : undefined;
    const api = comp && comp.renderedRow && comp.renderedRow.beans && comp.renderedRow.beans.gridApi;
    if (!api || typeof api.forEachNode !== 'function') return null;
    const rows: Array<Record<string, Cell>> = [];
    api.forEachNode((n) => { if (n && n.data) rows.push(n.data); });
    return rows;
  };
  const filled = (c: Cell) => !!c && c.val !== undefined && c.val !== null && c.val !== '--';
  const signature = (rows: Array<Record<string, Cell>>): string => {
    let value = 0;
    let quotes = 0;
    rows.forEach((r) => {
      const v = r.curVal && typeof r.curVal.val === 'number' ? r.curVal.val : 0;
      value += v;
      if (filled(r.marketCap)) quotes += 1;
      if (filled(r.exDvDte)) quotes += 1;
    });
    return `${rows.length}|${value.toFixed(2)}|${quotes}`;
  };
  const tick = (force: boolean) => {
    try {
      const rows = read();
      if (!rows || !rows.length) return;
      const sig = signature(rows);
      // post once the copy is stable for two ticks, and again only when it changes
      if (!force && (sig !== seen || sig === posted)) { seen = sig; return; }
      seen = sig;
      posted = sig;
      window.postMessage({ source: tag, type: 'grid', json: JSON.stringify(rows), forced: force }, location.origin);
    } catch (e) {
      window.postMessage({ source: tag, type: 'error', message: String(e).slice(0, 300) }, location.origin);
    }
  };
  window.addEventListener('message', (e) => {
    if (e.origin === location.origin && e.data && e.data.source === `${tag}-ask`) tick(true);
  });
  setInterval(() => tick(false), 3000);
}

export function injectPageReader(doc: Document = document): 'gm' | 'script' | 'failed' {
  const code = `(${pageReader.toString()})(${JSON.stringify(PAGE_TAG)});`;
  try {
    if (typeof GM_addElement === 'function') { GM_addElement('script', { textContent: code }); return 'gm'; }
  } catch { /* fall back below */ }
  try {
    const s = doc.createElement('script');
    s.textContent = code;
    (doc.head ?? doc.documentElement).appendChild(s);
    s.remove();
    return 'script';
  } catch {
    return 'failed';
  }
}

/** ask the page reader for a copy now (after a click on ⬇ in the panel) */
export const askGrid = (): void => window.postMessage({ source: `${PAGE_TAG}-ask` }, location.origin);
