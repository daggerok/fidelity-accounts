/// <reference lib="esnext" />
import type { Beta, BetaMix, BetaSource } from '../../shared/beta';
import { t } from '../app/i18n';
import { DASH, pct } from './format';

// The beta of some positions (shared/beta.ts mixBeta): two decimals with the Greek letter right after them (owner
// 2026-11-26: "i want to see 1.17(Beta symbol) like 1.17b but beta, not b"), "--" when none is known; the hint says what
// it is, where its parts came from and how much of the value it covers when that is not all
export const betaNumber = (beta: number | null): string => (beta === null ? DASH : beta.toFixed(2));
const betaText = (beta: number | null): string => (beta === null ? DASH : `${beta.toFixed(2)}β`);

// under this share of the value with a beta the coverage is shown (0.9995 rounds to 100.00%)
const FULL = 0.9995;
const partial = (mix: BetaMix): boolean => mix.beta !== null && mix.coverage < FULL;

const sourceName = (s: BetaSource): string => ({
  stock5y: t('stocks 5Y'), stock3y: t('stocks 3Y'), stock1y: t('stocks 1Y'), etf3y: t('ETFs 3Y'),
  calcMonthly: t('computed monthly'), calcDaily: t('computed daily'), cash: t('cash'),
} as Record<BetaSource, string>)[s];

/** the source of one beta in words, with the months (or days) behind a computed one */
export function sourceText(b: Beta): string {
  if (b.source === 'calcMonthly' && b.months) return t('computed monthly, {n} months', { n: b.months });
  if (b.source === 'calcDaily' && b.months) return t('computed daily, {n} days', { n: b.months });
  return sourceName(b.source);
}

// the fallback is the one number not measured by us against the S&P 500 (owner 2026-11-26 review: Morningstar measures
// a fund against its category index), so wherever it is named it says so
export const etf3yHint = (): string => t('Morningstar\'s 3-year beta from Fidelity\'s ETF screener, used only when the price history is too short for our own: it may be measured against another index than the S&P 500');

export function betaHint(mix: BetaMix): string {
  const lines = [t('Beta: how the value moves with the S&P 500 (1 = like it, 0 = cash), the average of the positions\' betas weighted by their value. Stocks: Fidelity\'s 5Y beta (else 3Y, 1Y); ETFs, funds and the rest: computed by us from Fidelity\'s prices against SPY over up to 36 months (daily when the history is shorter); only when the history is too short for both, Morningstar\'s 3Y ETF beta, which may be measured against another index; cash 0')];
  if (mix.sources.length) lines.push(t('Here: {sources}', { sources: mix.sources.map(sourceName).join(', ') }));
  if (partial(mix)) lines.push(t('Covers {pct} of the value, the rest has no beta yet', { pct: pct(mix.coverage * 100) }));
  return lines.join('\n');
}

/** the number with β; screen readers hear "Beta 1.17"; `more`: a line added to the hint (what a click does) */
export function BetaValue({ mix, more }: { mix: BetaMix; more?: string }) {
  const name = mix.beta === null ? t('Beta not known') : t('Beta {beta}', { beta: betaNumber(mix.beta) });
  return (
    <span className="num whitespace-nowrap" title={more ? `${betaHint(mix)}\n${more}` : betaHint(mix)} data-beta>
      <span className="sr-only">{name}</span>
      <span aria-hidden="true">{betaText(mix.beta)}</span>
    </span>
  );
}

/**
 * The line under the number: the share of the value the beta covers, small and grey, when it is not all; an empty line
 * of the same height otherwise, so the rows keep one height from account to account
 */
export function BetaCoverage({ mix }: { mix: BetaMix }) {
  const shown = partial(mix);
  // rounded down, so a share short of all never reads 100%
  const share = `${Math.floor(mix.coverage * 100)}%`;
  return (
    <div className="num whitespace-nowrap text-xs text-slate-500 dark:text-slate-400" title={shown ? t('The beta covers {pct} of the account\'s value, the rest has no beta', { pct: share }) : undefined} data-beta-coverage={shown ? 'partial' : 'full'}>
      {shown ? share : ' '}
    </div>
  );
}
