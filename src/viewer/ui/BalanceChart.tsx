import { ALL_PERIODS, cardPeriods, changeOf, periodLabel, periodSlice, type Period, type Point } from '../../shared/history';
import { t } from '../app/i18n';
import { prefs, setPrefs } from '../app/prefs';
import { LineChart } from './LineChart';
import { Pills } from './Pills';
import { signedPct, signedUsd, tone } from './format';
import { useStore } from './useStore';

// The value of the chosen accounts over a period (Fidelity's own daily values), the period chips under it. `big` is the
// zoomed copy (the card's ⤢, top right like on every card): taller, with every period.
// The change is the balance change: deposits and withdrawals are in it, it is not a return
/** the chosen period's balance change as a row of the card's Today table (owner 2026-11-24: under Today, aligned) */
export function PeriodChangeRow({ series }: { series: Point[] }) {
  const pr = useStore(prefs);
  const ch = series.length < 2 ? null : changeOf(periodSlice(series, pr.period));
  if (!ch) return null;
  return (
    <tr data-period-change>
      <td className={`num whitespace-nowrap pr-3 ${tone(ch.change)}`}>{signedUsd(ch.change)} ({signedPct(ch.pct)})</td>
      <td className="text-slate-500 dark:text-slate-400">{t('{period} balance change', { period: pr.period })}</td>
    </tr>
  );
}

// `big` shows the change line above the chart; the card shows it under the balance (PeriodChangeRow)
export function BalanceChart({ series, big }: { series: Point[]; big?: boolean }) {
  const pr = useStore(prefs);
  if (series.length < 2) return null;
  const period = pr.period;
  const slice = periodSlice(series, period);
  const ch = changeOf(slice);
  const up = (ch?.change ?? 0) >= 0;
  // the card keeps the short list (plus the one picked in the zoom), the zoom shows every period
  const chips = (all: boolean) => (
    <Pills items={(all ? [...ALL_PERIODS] : cardPeriods(period)) as Period[]} value={period} label={t('Period')}
      labelOf={(p) => periodLabel(p, !all)} dense={!all} onChange={(p) => setPrefs({ period: p })} />
  );
  const head = ch && <div className={`num text-sm ${tone(ch.change)}`}>{signedUsd(ch.change)} ({signedPct(ch.pct)}) <span className="text-slate-500 dark:text-slate-400">{t('{period} balance change', { period })}</span></div>;
  const height = big ? Math.round(Math.min(560, (typeof window === 'undefined' ? 800 : window.innerHeight) * 0.6)) : 180;
  return (
    <div className="flex flex-col gap-2" data-balance-chart={big ? 'big' : 'card'}>
      {big && head}
      <LineChart points={slice} up={up} height={height} />
      {chips(!!big)}
    </div>
  );
}
