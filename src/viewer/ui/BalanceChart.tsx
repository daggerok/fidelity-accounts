import { ALL_PERIODS, PERIODS, changeOf, periodSlice, type Period, type Point } from '../../shared/history';
import { t } from '../app/i18n';
import { prefs, setPrefs } from '../app/prefs';
import { LineChart } from './LineChart';
import { signedPct, signedUsd, tone } from './format';
import { useStore } from './useStore';

// The value of the chosen accounts over a period (Fidelity's own daily values), the period chips under it. `big` is the
// zoomed copy (the card's ⤢, top right like on every card): taller, with every period.
// The change is the balance change: deposits and withdrawals are in it, it is not a return
export function BalanceChart({ series, big }: { series: Point[]; big?: boolean }) {
  const pr = useStore(prefs);
  if (series.length < 2) return null;
  const period = pr.period;
  const slice = periodSlice(series, period);
  const ch = changeOf(slice);
  const up = (ch?.change ?? 0) >= 0;
  // the card keeps the short list (plus the one picked in the zoom), the zoom shows every period
  const chips = (all: boolean) => (
    <div className="flex flex-wrap gap-1" role="tablist" aria-label={t('Period')}>
      {ALL_PERIODS.filter((p) => all || p === period || (PERIODS as readonly string[]).includes(p)).map((p) => (
        <button key={p} type="button" role="tab" aria-selected={p === period} onClick={() => setPrefs({ period: p as Period })}
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${p === period ? 'text-white' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`}
          style={p === period ? { background: 'var(--brand)' } : undefined}>{p}</button>
      ))}
    </div>
  );
  const head = ch && <div className={`num text-sm ${tone(ch.change)}`}>{signedUsd(ch.change)} ({signedPct(ch.pct)}) <span className="text-slate-500 dark:text-slate-400">{t('balance change, {period}', { period })}</span></div>;
  const height = big ? Math.round(Math.min(560, (typeof window === 'undefined' ? 800 : window.innerHeight) * 0.6)) : 180;
  return (
    <div className="flex flex-col gap-2" data-balance-chart={big ? 'big' : 'card'}>
      {head}
      <LineChart points={slice} up={up} height={height} />
      {chips(!!big)}
    </div>
  );
}
