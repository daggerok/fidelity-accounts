import type { Account, Dataset, Position } from '../../shared/model';
import { allocation, movers, near52, positionsIn, totalsOf, upcomingDividends } from '../app/derive';
import { t } from '../app/i18n';
import { pct, signedPct, signedUsd, siteDate, tone, usd } from './format';

// Summary: squares of information like the Fidelity summary page, for the chosen scope
const Card = ({ title, children, wide }: { title: string; children: React.ReactNode; wide?: boolean }) => (
  <section className={`card flex flex-col gap-3 ${wide ? 'md:col-span-2' : ''}`}>
    <h2 className="text-lg font-semibold">{title}</h2>
    {children}
  </section>
);

const Row = ({ label, value, cls = '' }: { label: string; value: string; cls?: string }) => (
  <div className="flex items-baseline justify-between gap-3 text-sm"><span className="text-slate-500 dark:text-slate-400">{label}</span><span className={`num whitespace-nowrap text-right font-medium ${cls}`}>{value}</span></div>
);

const Empty = ({ text }: { text: string }) => <p className="text-sm text-slate-500 dark:text-slate-400">{text}</p>;

function Bars({ slices }: { slices: { name: string; value: number; pct: number }[] }) {
  return (
    <div className="flex flex-col gap-2">
      {slices.slice(0, 8).map((s) => (
        <div key={s.name} className="text-sm">
          <div className="flex justify-between gap-3"><span className="truncate">{s.name}</span><span className="num text-slate-500 dark:text-slate-400">{usd(s.value)} · {pct(s.pct)}</span></div>
          <div className="mt-1 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800"><div className="h-1.5 rounded-full" style={{ width: `${Math.max(1, s.pct)}%`, background: 'var(--brand)' }} /></div>
        </div>
      ))}
    </div>
  );
}

function Movers({ list }: { list: Position[] }) {
  return (
    <div className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800">
      {list.map((p) => (
        <div key={p.symbol} className="flex items-center justify-between gap-3 py-2 text-sm">
          <div className="min-w-0"><div className="font-semibold">{p.symbol}</div><div className="truncate text-xs text-slate-500 dark:text-slate-400">{p.description}</div></div>
          <div className="text-right"><div className={`num ${tone(p.todayGl)}`}>{signedUsd(p.todayGl)} ({signedPct(p.todayGlPct)})</div><div className="num text-xs text-slate-500">{usd(p.lastPrice)}</div></div>
        </div>
      ))}
    </div>
  );
}

export function Summary({ ds, accounts }: { ds: Dataset; accounts: Account[] }) {
  const tot = totalsOf(accounts);
  const ps = positionsIn(ds, accounts);
  const m = movers(ps);
  const today = new Date().toISOString().slice(0, 10);
  const divs = upcomingDividends(ps, today);
  const n52 = near52(ps);
  const sectors = allocation(ps, (p) => p.sector || p.securityType);
  const types = allocation(ps, (p) => p.securityType);
  const yieldOnValue = tot.balance > 0 ? (tot.estAnnualIncome / tot.balance) * 100 : null;

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" data-summary>
      <Card title={t('Balance')}>
        <div className="num text-4xl font-semibold tracking-tight">{usd(tot.balance)}</div>
        <div className={`num text-sm ${tone(tot.todayGl)}`}>{signedUsd(tot.todayGl)} ({signedPct(tot.todayGlPct)}) <span className="text-slate-500 dark:text-slate-400">{t("Today's gain/loss")}</span></div>
        <div className="mt-2 flex flex-col gap-1.5">
          <Row label={t('Total gain/loss')} value={`${signedUsd(tot.totalGl)} (${signedPct(tot.totalGlPct)})`} cls={tone(tot.totalGl)} />
          <Row label={t('Cost basis')} value={usd(tot.costBasis)} />
          <Row label={t('Cash (core)')} value={usd(tot.cash)} />
          {tot.pending !== 0 && <Row label={t('Pending activity')} value={signedUsd(tot.pending)} cls={tone(tot.pending)} />}
        </div>
      </Card>

      <Card title={t('Your top and bottom movers')}>
        {m.top.length || m.bottom.length ? <><Movers list={m.top} /><Movers list={m.bottom} /></> : <Empty text={t('No price changes yet today')} />}
      </Card>

      <Card title={t('Accounts')}>
        <div className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800">
          {accounts.map((a) => (
            <div key={a.number} className="flex items-center justify-between gap-3 py-2 text-sm">
              <div className="min-w-0"><div className="font-medium">{a.name}</div><div className="text-xs text-slate-500 dark:text-slate-400">{a.number} · {a.group}{a.type ? ` · ${a.type}` : ''}</div></div>
              <div className="text-right"><div className="num">{usd(a.balance)}</div><div className={`num text-xs ${tone(a.todayGl)}`}>{signedUsd(a.todayGl)} ({signedPct(a.todayGlPct)})</div></div>
            </div>
          ))}
        </div>
      </Card>

      <Card title={t('Income')}>
        <div className="num text-3xl font-semibold">{usd(tot.estAnnualIncome)}</div>
        <div className="text-sm text-slate-500 dark:text-slate-400">{t('Estimated annual income')}{yieldOnValue !== null ? ` · ${t('{pct} of the balance', { pct: pct(yieldOnValue) })}` : ''}</div>
        <Row label={t('Per month, on average')} value={usd(tot.estAnnualIncome / 12)} />
      </Card>

      <Card title={t('Upcoming ex-dividend dates (30 days)')}>
        {divs.length ? (
          <div className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800">
            {divs.slice(0, 8).map((p) => (
              <div key={`${p.account}-${p.symbol}`} className="flex items-center justify-between gap-3 py-2 text-sm">
                <div className="min-w-0"><div className="font-semibold">{p.symbol}</div><div className="truncate text-xs text-slate-500 dark:text-slate-400">{t('pay date {date}', { date: siteDate(p.payDate) })}</div></div>
                <div className="text-right"><div className="num">{siteDate(p.exDate)}</div><div className="num text-xs text-slate-500">{p.dividendAmount !== undefined ? t('{amount} per share', { amount: usd(p.dividendAmount) }) : p.paymentFrequency ?? ''}</div></div>
              </div>
            ))}
          </div>
        ) : <Empty text={t('No ex-dividend dates in the next 30 days')} />}
      </Card>

      <Card title={t('Near a 52-week high or low')}>
        {n52.highs.length || n52.lows.length ? (
          <div className="flex flex-col gap-2 text-sm">
            {n52.highs.length > 0 && <div><span className="gain font-medium">{t('High')}: </span>{Array.from(new Set(n52.highs.map((p) => p.symbol))).join(', ')}</div>}
            {n52.lows.length > 0 && <div><span className="loss font-medium">{t('Low')}: </span>{Array.from(new Set(n52.lows.map((p) => p.symbol))).join(', ')}</div>}
          </div>
        ) : <Empty text={t('Nothing within 3% of its 52-week high or low')} />}
      </Card>

      <Card title={t('Allocation by sector')}><Bars slices={sectors} /></Card>
      <Card title={t('Allocation by security type')}><Bars slices={types} /></Card>
    </div>
  );
}
