/// <reference lib="esnext" />
// What the content side reads from the Fidelity page DOM (read only): the account list on the left and the
// "As of ..." line. Class names seen live on 2026-11-23 (acct-selector__*); a missing piece gives an empty list,
// the grid rows still carry the accounts then
import { money, type SidebarAccount } from '../shared/parse';

const text = (el: Element | null | undefined): string => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

export function readSidebar(doc: Document): SidebarAccount[] {
  const out: SidebarAccount[] = [];
  doc.querySelectorAll('.acct-selector__group').forEach((g) => {
    const group = text(g.querySelector('.acct-selector__group-name')) || 'Other';
    g.querySelectorAll('.acct-selector__acct-wrapper').forEach((a) => {
      const number = text(a.querySelector('.acct-selector__acct-num'));
      const nameEl = a.querySelector('.acct-selector__acct-name');
      const name = text(nameEl).replace(number, '').trim();
      if (!number) return;
      const balanceWrap = a.querySelector('.acct-selector__balance-wrapper');
      // balance: the first span with a $ that is not a gain or loss; gains: the --gain / --loss spans
      const spans = Array.from(balanceWrap?.querySelectorAll('span') ?? []).filter((s) => !s.classList.contains('sr-only') && s.children.length === 0);
      const balance = spans.map((s) => text(s)).find((t, i) => /^\$/.test(t) && !/money--(gain|loss)/.test(spans[i]!.className));
      const moves = spans.filter((s) => /money--(gain|loss)/.test(s.className)).map((s) => text(s));
      out.push({
        group, name, number,
        balance: money(balance),
        todayGl: money(moves.find((m) => !/%/.test(m))),
        todayGlPct: money(moves.find((m) => /%/.test(m))),
      });
    });
  });
  return out;
}

/** "As of Nov-23-2026 9:37 p.m. ET" from the page, or null */
export function readAsOf(doc: Document): string | null {
  const m = /As of [A-Z][a-z]{2}-\d{2}-\d{4}[^\n]{0,20}?(a\.m\.|p\.m\.) ET/.exec(doc.body?.innerText ?? doc.body?.textContent ?? '');
  return m ? m[0] : null;
}
