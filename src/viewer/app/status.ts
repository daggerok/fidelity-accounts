/// <reference lib="esnext" />
// The userscript marks the viewer page with <html data-fidelity-accounts-userscript="<version>"> (userscript/src/main.ts)
export const USERSCRIPT_MARK = 'fidelityAccountsUserscript';
export const USERSCRIPT_ATTR = 'data-fidelity-accounts-userscript';

export function userscriptVersion(root: { dataset: DOMStringMap }): string | null {
  return root.dataset[USERSCRIPT_MARK] ?? null;
}
