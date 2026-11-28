/// <reference lib="esnext" />
// The Activity page (owner 2026-11-28): what happened in the accounts, read from the transactions history the script
// keeps (shared/transactions). First the dividends and the interest. Fidelity lists a dividend and its reinvestment
// (DRIP) as two rows; here they are ONE line: what was paid, and beside it what the payment bought, or nothing when it
// was too small to buy 0.001 share. More kinds of activity (trades, transfers, contributions) come later
import { addDays, addMonths } from '../../shared/dates';
import type { Txn } from '../../shared/transactions';

export type PayKind = 'dividend' | 'interest';
/** one payment and what it bought. `amount`: the money paid; `drip`: the reinvestment of that day, or null */
export interface PayLine {
  id: string;
  account: string;
  date: string;
  symbol: string;
  name: string;
  kind: PayKind;
  amount: number | undefined;
  drip: { shares: number; usd: number; price: number | undefined } | null;
  // announced, not paid yet: Fidelity lists it as "DIV OF $0.08 PENDING REINVESTMENT" with no amount. Once it is paid
  // the next read brings the real rows instead and the line becomes a plain one
  pending: boolean;
}

// DV = dividend or interest (Fidelity's category), paid in (D) or spent on the reinvestment buy (W, RIN or sub RN)
const isPay = (t: Txn): boolean => t.cat === 'DV' && t.dir === 'D';
const isReinvest = (t: Txn): boolean => t.mnemonic === 'RIN' || t.sub === 'RN' || (t.cat === 'DV' && t.dir === 'W');
const isInterest = (t: Txn): boolean => t.mnemonic === 'INT' || /^\s*INTEREST\b/i.test(t.desc);
// "DIV OF $0.08 PENDING REINVESTMENT as of 2026-11-27 EATON CORPORATION PLC (ETN) (Cash)": the amount is in the words
const PENDING = /^\s*DIV OF \$([\d,]*\.?\d+) PENDING\b/i;
const pendingAmount = (t: Txn): number | undefined => { const m = PENDING.exec(t.desc); return m ? Number(m[1]!.replace(/,/g, '')) : undefined; };

/** "DIVIDEND RECEIVED WISDOMTREE TR US QUALITY DIVID GROWTH FD (DGRW) (Cash)" -> "WISDOMTREE TR US QUALITY DIVID GROWTH FD" */
export function securityName(desc: string, symbol: string): string {
  let s = desc.replace(/^\s*(DIV OF \$[\d,.]+ PENDING REINVESTMENT|DIVIDEND RECEIVED|REINVESTMENT|INTEREST EARNED|INTEREST)\s+/i, '').replace(/^as of \d{4}-\d\d-\d\d\s+/i, '');
  // the tail in brackets: the account type, then the ticker
  s = s.replace(/\s*\((Cash|Margin|Short)\)\s*$/i, '');
  if (symbol) s = s.replace(new RegExp(`\\s*\\(${symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)\\s*$`, 'i'), '');
  return s.trim();
}

const cents = (x: number): number => Math.round(x * 100) / 100;
/**
 * The price of a share in a reinvestment: Fidelity's own when the row has it (read since 0.1.40). For an older row it
 * is worked out from the dollars and the shares, but only for a buy of 0.05 share or more: the shares are rounded to
 * 0.001, so for a tiny buy the division says $50.00 where the price was $92.34 (seen live 2026-11-28). No price is
 * better than a wrong one
 */
export const WORKED_PRICE_FROM = 0.05;
function dripPrice(buy: Txn, shares: number, usd: number): number | undefined {
  if (buy.price && buy.price > 0) return cents(buy.price);
  return shares >= WORKED_PRICE_FROM ? cents(usd / shares) : undefined;
}

/**
 * The dividends and the interest of some accounts, the newest first: every payment with the reinvestment of the same
 * account, day and ticker beside it. Several payments of one ticker on one day (a regular and a special one) pair in
 * the order Fidelity lists them; a reinvestment with no payment that day keeps a line of its own. Cancelled rows are out
 */
export function payLines(rows: Txn[], accounts: Set<string>): PayLine[] {
  const groups = new Map<string, { pays: Txn[]; buys: Txn[] }>();
  rows.forEach((t) => {
    if (t.cancelled || !accounts.has(t.account)) return;
    const pay = isPay(t);
    if (!pay && !isReinvest(t)) return;
    const key = `${t.account}|${t.date}|${t.symbol}`;
    let g = groups.get(key);
    if (!g) { g = { pays: [], buys: [] }; groups.set(key, g); }
    (pay ? g.pays : g.buys).push(t);
  });
  const out: PayLine[] = [];
  groups.forEach((g, key) => {
    const n = Math.max(g.pays.length, g.buys.length);
    for (let i = 0; i < n; i++) {
      const pay = g.pays[i];
      const buy = g.buys[i];
      const of = (pay ?? buy)!;
      const usd = buy ? cents(Math.abs(buy.net)) : 0;
      const shares = buy ? Math.abs(buy.qty) : 0;
      out.push({
        id: `${key}|${i}`,
        account: of.account,
        date: of.date,
        symbol: of.symbol,
        name: securityName(of.desc, of.symbol),
        kind: isInterest(of) ? 'interest' : 'dividend',
        amount: pay ? cents(pendingAmount(pay) ?? pay.net) : undefined,
        drip: buy ? { shares, usd, price: dripPrice(buy, shares, usd) } : null,
        pending: !!pay && pendingAmount(pay) !== undefined,
      });
    }
  });
  return out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** how far back the page looks; everything by default (owner 2026-11-28: "default selector should be All") */
export const ACTIVITY_PERIODS = ['1M', '3M', 'YTD', '1Y', 'All'] as const;
export type ActivityPeriod = typeof ACTIVITY_PERIODS[number];
export const DEFAULT_ACTIVITY_PERIOD: ActivityPeriod = 'All';
export const asActivityPeriod = (v: unknown): ActivityPeriod => ((ACTIVITY_PERIODS as readonly unknown[]).indexOf(v) >= 0 ? (v as ActivityPeriod) : DEFAULT_ACTIVITY_PERIOD);

/**
 * The page draws its lines a part at a time and more as it is scrolled (owner 2026-11-28: "pagination ... when we
 * scroll"): the search and the order always work over every line, only the drawing is cut. How many lines to draw after
 * one more part was asked for
 */
export const ACTIVITY_PAGE = 200;
export const nextPage = (drawn: number, total: number): number => Math.min(total, drawn + ACTIVITY_PAGE);
/** the first day of a period that ends today; '' for all of it */
export function periodStart(period: ActivityPeriod, today: string): string {
  if (period === 'All') return '';
  if (period === 'YTD') return `${today.slice(0, 4)}-01-01`;
  return addDays(addMonths(today, period === '1M' ? -1 : period === '3M' ? -3 : -12), 1);
}
export const inPeriod = (lines: PayLine[], period: ActivityPeriod, today: string): PayLine[] => {
  const from = periodStart(period, today);
  return from ? lines.filter((l) => l.date >= from) : lines;
};

/** what the lines add up to: paid, reinvested, and left as cash (paid with no reinvestment) */
export function payTotals(lines: PayLine[]): { paid: number; reinvested: number; cash: number } {
  let paid = 0, reinvested = 0, cash = 0;
  // a pending payment counts as paid (it is on its way) but as neither reinvested nor left as cash: that is not known yet
  lines.forEach((l) => { paid += l.amount ?? 0; reinvested += l.drip?.usd ?? 0; if (!l.drip && !l.pending) cash += l.amount ?? 0; });
  return { paid: cents(paid), reinvested: cents(reinvested), cash: cents(cash) };
}
