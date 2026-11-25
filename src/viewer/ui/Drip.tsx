/// <reference lib="esnext" />
import { t } from '../app/i18n';
import { signedQty, signedUsd } from './format';

// A DRIP number the same way everywhere (Positions columns, Upcoming dividends): plus = still to buy, plain; minus = the
// next payout already buys 0.001 share, green
export const DRIP_HINT = (): string => t('Shares to buy so the next dividend buys 0.001 share by DRIP; minus: it already does');
export const DRIP_USD_HINT = (): string => t('Dollars to buy at the last price so the next dividend buys 0.001 share by DRIP; minus: it already does');

export function DripValue({ value, as }: { value: number; as: 'shares' | 'usd' }) {
  return <span className={value <= 0 ? 'gain' : ''}>{as === 'shares' ? signedQty(value) : signedUsd(value)}</span>;
}
