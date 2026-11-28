/// <reference lib="esnext" />
import { t } from '../app/i18n';
import { qty, signedQty, signedUsd, usd } from './format';

// A DRIP number the same way everywhere (Positions columns, Upcoming dividends): plus = still to buy, plain; minus = the
// next payout already buys 0.001 share, green; the Min. DRIP columns plain
// The DRIP columns come in pairs (owner 2026-11-27): the regular one is adjusted to an order Fidelity takes (worth at
// least $1) and carries the plain name; its plain calculation is the "Non-adj." one, off unless turned on. Every hint
// says which of the two it is
const adj = (hint: string): string => t('Adj.: {hint}', { hint });
const nonAdj = (hint: string): string => t('Non-adj.: {hint}', { hint });
export const DRIP_HINT = (): string => nonAdj(t('Shares to buy so the next dividend buys 0.001 share by DRIP; minus: it already does'));
export const DRIP_USD_HINT = (): string => nonAdj(t('Dollars to buy at the last price so the next dividend buys 0.001 share by DRIP; minus: it already does'));

export const DRIP_MIN_HINT = (): string => nonAdj(t('The fewest shares to hold so the next dividend buys 0.001 share by DRIP: from the last price and the dividend, the same in every account'));
export const DRIP_MIN_USD_HINT = (): string => nonAdj(t('The fewest shares to hold for DRIP, in dollars at the last price'));

export const DRIP_ADJ_HINT = (): string => adj(t('Shares to buy for DRIP as an order Fidelity takes: shares worth under $1 are raised to the fewest shares worth $1 or more; minus: the dividend already buys 0.001 share'));
export const DRIP_ADJ_USD_HINT = (): string => adj(t('The dollars of that order: those shares at the last price, never under $1'));
export const DRIP_MIN_ADJ_HINT = (): string => adj(t('The fewest shares to hold for DRIP as an order Fidelity takes, to buy from nothing: never shares worth under $1'));
export const DRIP_MIN_ADJ_USD_HINT = (): string => adj(t('The dollars of that threshold: those shares at the last price, never under $1'));

/** `min`: Min. DRIP and Min. DRIP $, a threshold to hold, plain with no sign */
export function DripValue({ value, as, min = false }: { value: number; as: 'shares' | 'usd'; min?: boolean }) {
  if (min) return <span>{as === 'shares' ? qty(value) : usd(value)}</span>;
  return <span className={value <= 0 ? 'gain' : ''}>{as === 'shares' ? signedQty(value) : signedUsd(value)}</span>;
}
