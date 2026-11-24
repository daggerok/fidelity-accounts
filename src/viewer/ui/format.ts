/// <reference lib="esnext" />
// Money and percents the way the Fidelity pages show them: $1,234.56, +$12.30, -4.06%; "--" when unknown
const usdFmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const DASH = '--';
export const usd = (n: number | undefined | null): string => (typeof n === 'number' && Number.isFinite(n) ? usdFmt.format(n) : DASH);
const usd0Fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
/** whole dollars, where the room is short */
export const usd0 = (n: number | undefined | null): string => (typeof n === 'number' && Number.isFinite(n) ? usd0Fmt.format(n) : DASH);
export const signedUsd = (n: number | undefined | null): string => (typeof n === 'number' && Number.isFinite(n) ? `${n > 0 ? '+' : n < 0 ? '-' : ''}${usdFmt.format(Math.abs(n))}` : DASH);
export const pct = (n: number | undefined | null): string => (typeof n === 'number' && Number.isFinite(n) ? `${n.toFixed(2)}%` : DASH);
export const signedPct = (n: number | undefined | null): string => (typeof n === 'number' && Number.isFinite(n) ? `${n > 0 ? '+' : ''}${n.toFixed(2)}%` : DASH);
export const qty = (n: number | undefined | null): string => (typeof n === 'number' && Number.isFinite(n) ? String(Math.round(n * 1000) / 1000) : DASH);
export const tone = (n: number | undefined | null): string => (typeof n === 'number' && n > 0 ? 'gain' : typeof n === 'number' && n < 0 ? 'loss' : '');
/** "2026-12-12" -> "Dec-12-2026" (the site's own way) */
export const siteDate = (iso: string | undefined): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? '');
  return m ? `${'JanFebMarAprMayJunJulAugSepOctNovDec'.slice((Number(m[2]) - 1) * 3, Number(m[2]) * 3)}-${m[3]}-${m[1]}` : DASH;
};
/** $234.93B style for market caps */
export const bigUsd = (n: number | undefined | null): string => {
  if (typeof n !== 'number' || !Number.isFinite(n)) return DASH;
  const a = Math.abs(n);
  return a >= 1e12 ? `$${(n / 1e12).toFixed(2)}T` : a >= 1e9 ? `$${(n / 1e9).toFixed(2)}B` : a >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : usd(n);
};
