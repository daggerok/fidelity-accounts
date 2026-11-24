import { signedUsdPct, tone } from './format';

// "+$12.30 (+1.25%)" in the gain or loss colour: the one way every card writes a change in $ and %
export function GainLoss({ usd, pct, className = '' }: { usd: number | undefined | null; pct: number | undefined | null; className?: string }) {
  return <span className={`num ${tone(usd)} ${className}`}>{signedUsdPct(usd, pct)}</span>;
}
