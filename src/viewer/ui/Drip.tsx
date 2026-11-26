/// <reference lib="esnext" />
import { t } from '../app/i18n';
import { qty, signedQty, signedUsd, usd } from './format';

// A DRIP number the same way everywhere (Positions columns, Upcoming dividends): plus = still to buy, plain; minus = the
// next payout already buys 0.001 share, green; the Min. DRIP columns plain
export const DRIP_HINT = (): string => t('Shares to buy so the next dividend buys 0.001 share by DRIP; minus: it already does');
export const DRIP_USD_HINT = (): string => t('Dollars to buy at the last price so the next dividend buys 0.001 share by DRIP; minus: it already does');

export const DRIP_MIN_HINT = (): string => t('The fewest shares to hold so the next dividend buys 0.001 share by DRIP: from the last price and the dividend, the same in every account');
export const DRIP_MIN_USD_HINT = (): string => t('The fewest shares to hold for DRIP, in dollars at the last price');

export const DRIP_ADJ_USD_HINT = (): string => t('DRIP $ as an order Fidelity takes: an amount to buy under $1 is shown as $1, the least Fidelity sells');
export const DRIP_MIN_ADJ_USD_HINT = (): string => t('Min. DRIP $ as an order Fidelity takes: an amount under $1 is shown as $1, the least Fidelity sells');

/** `min`: Min. DRIP and Min. DRIP $, a threshold to hold, plain with no sign */
export function DripValue({ value, as, min = false }: { value: number; as: 'shares' | 'usd'; min?: boolean }) {
  if (min) return <span>{as === 'shares' ? qty(value) : usd(value)}</span>;
  return <span className={value <= 0 ? 'gain' : ''}>{as === 'shares' ? signedQty(value) : signedUsd(value)}</span>;
}
