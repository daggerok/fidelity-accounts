/// <reference lib="esnext" />
import type { BetaMix, BetaSource } from '../../shared/beta';
import { t } from '../app/i18n';
import { DASH, pct } from './format';

// The beta of some positions (shared/beta.ts mixBeta): two decimals, "--" when none is known; the hint says what it is,
// where its parts came from and how much of the value it covers when that is not all
const sourceName = (s: BetaSource): string => ({
  stock5y: t('stocks 5Y'), stock3y: t('stocks 3Y'), stock1y: t('stocks 1Y'), etf3y: t('ETFs 3Y'),
  calcMonthly: t('computed monthly'), calcDaily: t('computed daily'), cash: t('cash'),
} as Record<BetaSource, string>)[s];

export function betaHint(mix: BetaMix): string {
  const lines = [t('Beta: how the value moves with the S&P 500 (1 = like it, 0 = cash), the average of the positions\' betas weighted by their value. From Fidelity: stocks 5Y (else 3Y, 1Y), ETFs 3Y (Morningstar); the rest computed from Fidelity\'s prices against SPY over up to 36 months (daily when the history is shorter); cash 0')];
  if (mix.sources.length) lines.push(t('Here: {sources}', { sources: mix.sources.map(sourceName).join(', ') }));
  if (mix.beta !== null && mix.coverage < 0.9995) lines.push(t('Covers {pct} of the value, the rest has no beta yet', { pct: pct(mix.coverage * 100) }));
  return lines.join('\n');
}

export function BetaValue({ mix }: { mix: BetaMix }) {
  return <span className="num" title={betaHint(mix)} data-beta>{mix.beta === null ? DASH : mix.beta.toFixed(2)}</span>;
}
