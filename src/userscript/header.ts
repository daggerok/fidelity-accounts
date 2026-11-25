/// <reference lib="esnext" />
// Tampermonkey header of dist/fidelity-accounts-sync.user.js (scripts/build-userscript.ts puts it in front of the bundle)
export const PAGES_URL = 'https://daggerok.github.io/fidelity-accounts/';
export const PORTFOLIO_URL = 'https://digital.fidelity.com/ftgw/digital/portfolio/';
export const POSITIONS_URL = 'https://digital.fidelity.com/ftgw/digital/portfolio/positions';
export const LOGIN_URL = 'https://digital.fidelity.com/prgw/digital/login/';
export const DEV_PORT = 1237;
export const DEV_URL = `http://localhost:${DEV_PORT}/`;
export const USERSCRIPT_FILE = 'fidelity-accounts-sync.user.js';

// dev: the dev-server build also runs on localhost; the published script never does (mykplan-adp review 2026-11-22:
// any local app on that port would receive the data)
export function userscriptHeader(version: string, dev = false): string {
  return [
    '// ==UserScript==',
    '// @name         fidelity-accounts sync',
    '// @namespace    https://github.com/daggerok/fidelity-accounts', // never change: Tampermonkey tells scripts apart by name and namespace
    `// @version      ${version}`,
    '// @description  Reads your own Fidelity positions in your logged-in browser (read only) and hands them to the fidelity-accounts viewer and your Google Sheet',
    '// @author       daggerok',
    `// @homepageURL  ${PAGES_URL}`,
    ...(dev ? [] : [`// @updateURL    ${PAGES_URL}${USERSCRIPT_FILE}`, `// @downloadURL  ${PAGES_URL}${USERSCRIPT_FILE}`]),
    `// @match        ${PORTFOLIO_URL}*`,
    `// @match        ${LOGIN_URL}*`,
    `// @match        ${PAGES_URL}*`,
    ...(dev ? [`// @match        ${DEV_URL}*`] : []),
    '// @run-at       document-end',
    '// @noframes',
    '// @grant        GM_getValue',
    '// @grant        GM_setValue',
    '// @grant        GM_deleteValue',
    '// @grant        GM_addValueChangeListener',
    '// @grant        GM_notification',
    '// @grant        GM_xmlhttpRequest',
    '// @grant        GM_addElement',
    '// @connect      sheets.googleapis.com',
    // the beta of each holding (beta-sync.ts): Fidelity's screeners and price history, reads only
    '// @connect      research2.fidelity.com',
    '// @connect      fastquote.fidelity.com',
    '// ==/UserScript==',
    '',
  ].join('\n');
}
