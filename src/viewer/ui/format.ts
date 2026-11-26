/// <reference lib="esnext" />
// Money and percents the way the Fidelity pages show them: $1,234.56, +$12.30, -4.06%; "--" when unknown
import type { Lang } from '../app/i18n';

const usdFmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const DASH = '--';
export const usd = (n: number | undefined | null): string => (typeof n === 'number' && Number.isFinite(n) ? usdFmt.format(n) : DASH);
const usd0Fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
/** whole dollars, where the room is short */
export const usd0 = (n: number | undefined | null): string => (typeof n === 'number' && Number.isFinite(n) ? usd0Fmt.format(n) : DASH);
export const signedUsd = (n: number | undefined | null): string => (typeof n === 'number' && Number.isFinite(n) ? `${n > 0 ? '+' : n < 0 ? '-' : ''}${usdFmt.format(Math.abs(n))}` : DASH);
export const pct = (n: number | undefined | null): string => (typeof n === 'number' && Number.isFinite(n) ? `${n.toFixed(2)}%` : DASH);
export const signedPct = (n: number | undefined | null): string => (typeof n === 'number' && Number.isFinite(n) ? `${n > 0 ? '+' : ''}${n.toFixed(2)}%` : DASH);
/** "+$12.30 (+1.25%)" */
export const signedUsdPct = (usd: number | undefined | null, pct: number | undefined | null): string => `${signedUsd(usd)} (${signedPct(pct)})`;
export const qty = (n: number | undefined | null): string => (typeof n === 'number' && Number.isFinite(n) ? String(Math.round(n * 1000) / 1000) : DASH);
/** "+0.14", "-0.76", "0": a number of shares with its sign */
export const signedQty = (n: number | undefined | null): string => (typeof n === 'number' && Number.isFinite(n) ? `${n > 0 ? '+' : ''}${qty(n)}` : DASH);
export const tone = (n: number | undefined | null): string => (typeof n === 'number' && n > 0 ? 'gain' : typeof n === 'number' && n < 0 ? 'loss' : '');
/** "2026-12-12" -> "Dec-12-2026" (the site's own way) */
export const siteDate = (iso: string | undefined): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? '');
  return m ? `${'JanFebMarAprMayJunJulAugSepOctNovDec'.slice((Number(m[2]) - 1) * 3, Number(m[2]) * 3)}-${m[3]}-${m[1]}` : DASH;
};
/** 12.35M style for big counts (volume, shares outstanding) */
export const bigNum = (n: number | undefined | null): string => {
  if (typeof n !== 'number' || !Number.isFinite(n)) return DASH;
  const a = Math.abs(n);
  return a >= 1e12 ? `${(n / 1e12).toFixed(2)}T` : a >= 1e9 ? `${(n / 1e9).toFixed(2)}B` : a >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : a >= 1e3 ? `${(n / 1e3).toFixed(2)}K` : String(Math.round(n));
};
/** the value levels of a chart: $850.0K below a million, $1.25M from it ($1234.5K was hard to read) */
export const shortUsd = (n: number): string => {
  const a = Math.abs(n);
  return a >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : a >= 1000 ? `$${(n / 1000).toFixed(1)}K` : usd(n);
};
/** "···1234": an account number shown on screen keeps its last four, the full one goes into the hint */
export const maskAccount = (number: string): string => (number ? `···${number.slice(-4)}` : '');
const LOCALES: Record<Lang, string> = { en: 'en-US', ru: 'ru-RU' };
/** our read time in the app's language and the browser's time zone ("Dec 12, 09:41 AM"): As of and the read in Get started */
export const readTime = (iso: string | number, lang: Lang): string =>
  new Date(iso).toLocaleString(LOCALES[lang], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
/** the hour and minute alone in the app's language (the last read of 👀) */
export const clockTime = (iso: string | number, lang: Lang): string =>
  new Date(iso).toLocaleTimeString(LOCALES[lang], { hour: '2-digit', minute: '2-digit' });
/** $234.93B style for market caps */
export const bigUsd = (n: number | undefined | null): string => {
  if (typeof n !== 'number' || !Number.isFinite(n)) return DASH;
  const a = Math.abs(n);
  return a >= 1e12 ? `$${(n / 1e12).toFixed(2)}T` : a >= 1e9 ? `$${(n / 1e9).toFixed(2)}B` : a >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : usd(n);
};
