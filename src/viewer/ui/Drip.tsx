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
// each hint says the whole thing by itself (owner 2026-11-27: "each column should be self descriptive and not expect that
// some other column needs to be read"): what the number is, for what, and how it is rounded
export const DRIP_HINT = (): string => nonAdj(t('Shares to buy so the next dividend buys 0.001 share by DRIP, the plain calculation: it may be worth under $1, which Fidelity does not sell; minus: the dividend already buys 0.001 share'));
export const DRIP_USD_HINT = (): string => nonAdj(t('Dollars to buy at the last price so the next dividend buys 0.001 share by DRIP, the plain calculation: it may be under $1, which Fidelity does not sell; minus: the dividend already buys 0.001 share'));

export const DRIP_MIN_HINT = (): string => nonAdj(t('The fewest shares to hold so the next dividend buys 0.001 share by DRIP, the plain calculation from the last price and the dividend: it may be worth under $1, which Fidelity does not sell; the same in every account'));
export const DRIP_MIN_USD_HINT = (): string => nonAdj(t('Dollars, at the last price, of the fewest shares to hold so the next dividend buys 0.001 share by DRIP, the plain calculation: it may be under $1, which Fidelity does not sell'));

export const DRIP_ADJ_HINT = (): string => adj(t('Shares to buy so the next dividend buys 0.001 share by DRIP, as an order Fidelity takes: shares worth under $1 are raised to the fewest shares worth $1 or more; minus: the dividend already buys 0.001 share'));
export const DRIP_ADJ_USD_HINT = (): string => adj(t('Dollars to type into a buy order so the next dividend buys 0.001 share by DRIP: the shares needed at the last price, rounded up to a cent so the order is not short, never under $1, the least Fidelity sells; minus: the dividend already buys 0.001 share'));
export const DRIP_MIN_ADJ_HINT = (): string => adj(t('The fewest shares to hold so the next dividend buys 0.001 share by DRIP, as an order Fidelity takes when bought from nothing: never shares worth under $1; the same in every account'));
export const DRIP_MIN_ADJ_USD_HINT = (): string => adj(t('Dollars to type into a buy order, from nothing, for the fewest shares to hold so the next dividend buys 0.001 share by DRIP: those shares at the last price, rounded up to a cent so the order is not short, never under $1'));

/** `min`: Min. DRIP and Min. DRIP $, a threshold to hold, plain with no sign */
export function DripValue({ value, as, min = false }: { value: number; as: 'shares' | 'usd'; min?: boolean }) {
  if (min) return <span>{as === 'shares' ? qty(value) : usd(value)}</span>;
  return <span className={value <= 0 ? 'gain' : ''}>{as === 'shares' ? signedQty(value) : signedUsd(value)}</span>;
}
