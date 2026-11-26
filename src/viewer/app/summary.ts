/// <reference lib="esnext" />
// The numbers of the Summary cards, each part over only what it reads, so the screen (ui/Summary.tsx, under useMemo)
// works a part out again only when its own inputs change: the % and $ switch of the movers redoes the movers, a dividends
// window the dividends, a status message of the script nothing (it took ~20 ms on every draw of App with ~1100 positions
// and ~18k transactions, most of it in the three Income periods)
import type { Account, Dataset, Position } from '../../shared/model';
import type { TxnStore } from '../../shared/transactions';
import { accountBreakdown, type BetaBreakdown } from '../../shared/beta';
import { combine, type Point } from '../../shared/history';
import { allocation, estAnnualOf, incomeFacts, near52, ofKind, periodBounds, positionsIn, totalsOf, upcomingDividends, windowEnd, type DivWindow, type IncomeFacts, type Kind, type Slice, type Totals, type Upcoming } from './derive';

/** the most movers a list shows: the ⤢ window, and the most rows a card grows to (useFitRows) */
export const MOVERS_MAX = 20;

/** what depends on the dataset and the accounts shown only */
export interface SummaryBase { tot: Totals; ps: Position[]; n52: { highs: Position[]; lows: Position[] }; sectors: Slice[]; types: Slice[]; balance: Point[] }
export function summaryBase(ds: Dataset, accounts: Account[]): SummaryBase {
  const ps = positionsIn(ds, accounts);
  return {
    tot: totalsOf(accounts),
    ps,
    n52: near52(ps),
    sectors: allocation(ps, (p) => p.sector || p.securityType),
    types: allocation(ps, (p) => p.securityType),
    balance: combine(ds.history, accounts.map((a) => a.number)),
  };
}

/** the Upcoming dividends card: the positions of the chosen kind, the last day of the window and the payouts in it */
export interface DividendsView { ps: Position[]; until: string; divs: Upcoming[] }
export function dividendsView(ps: Position[], kind: Kind, window: DivWindow, today: string): DividendsView {
  const kept = ofKind(ps, kind);
  const until = windowEnd(today, window);
  return { ps: kept, until, divs: upcomingDividends(kept, today, until) };
}

/** the Income card: the year, the quarter and the month, and Fidelity's annual estimate for the kind chosen */
export interface IncomeView { Y: IncomeFacts; Q: IncomeFacts; M: IncomeFacts; estAnnual: number }
export function incomeView(txns: TxnStore | null, accounts: Account[], ps: Position[], kind: Kind, today: string, accountsEstimate: number): IncomeView {
  const bounds = periodBounds(today);
  const facts = (b: [string, string]) => incomeFacts(txns, accounts, ps, kind, b[0], b[1], today);
  return { Y: facts(bounds.year), Q: facts(bounds.quarter), M: facts(bounds.month), estAnnual: estAnnualOf(kind, accountsEstimate, ps) };
}

/** each account's beta from its positions' sizes with the positions behind it, by account number (the Accounts card) */
export function accountBetas(ps: Position[], accounts: Account[], betas: Dataset['betas']): Map<string, BetaBreakdown> {
  return new Map(accounts.map((a) => [a.number, accountBreakdown(ps, a.number, betas)] as [string, BetaBreakdown]));
}
