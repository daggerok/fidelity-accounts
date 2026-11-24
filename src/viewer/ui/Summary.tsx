import type { Account, Dataset, Position } from '../../shared/model';
import { combine } from '../../shared/history';
import { ACCOUNT_SORTS, allocation, movers, near52, positionsIn, securities, sortAccounts, totalsOf, upcomingDividends, type AccountSort } from '../app/derive';
import { BalanceChart } from './BalanceChart';
import { Donut } from './Donut';
import { Zoom } from './Zoom';
import { animate } from './animate';
import { useState } from 'react';
import { prefs, setPrefs } from '../app/prefs';
import { useStore } from './useStore';
import { t } from '../app/i18n';
import { pct, qty, signedPct, signedUsd, siteDate, tone, usd } from './format';

// Summary: cards of information like the Fidelity summary page, for the chosen scope. Each card is as tall as its
// content and the cards pack into columns (owner 2026-11-23: plates sized by their content, a shorter page on desktop)
// `expand`: the card's full view, opened big over the page by ⤢ (owner 2026-11-23: maximize for every plate where it
// makes sense, more rows and details there)
function Card({ id, title, children, tools, expand }: { id: string; title: string; children: React.ReactNode; tools?: React.ReactNode; expand?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="card mb-4 flex w-full break-inside-avoid flex-col gap-3" style={{ viewTransitionName: `card-${id}` } as React.CSSProperties} data-card={id}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{title}</h2>
        <span className="flex items-center gap-1">{tools}{expand && <button type="button" className="tb" style={{ width: '1.75rem', height: '1.75rem' }} title={t('Open big')} onClick={() => setOpen(true)} data-expand>⤢</button>}</span>
      </div>
      {children}
      {expand && <Zoom open={open} title={title} onClose={() => setOpen(false)}>{tools && <div className="flex justify-end">{tools}</div>}{expand}</Zoom>}
    </section>
  );
}

// bars or a donut, each card its own choice (remembered by card id), switched with the morph animation
const viewOf = (views: Record<string, 'bars' | 'pie'>, id: string): 'bars' | 'pie' => views[id] ?? 'pie';
function ViewSwitch({ id }: { id: string }) {
  const pr = useStore(prefs);
  const now = viewOf(pr.views, id);
  const b = (v: 'bars' | 'pie', label: string, icon: string) => (
    <button type="button" title={label} aria-pressed={now === v} onClick={() => animate(() => setPrefs({ views: { ...prefs.get().views, [id]: v } }))}
      className={`rounded px-1.5 py-0.5 text-xs ${now === v ? 'bg-slate-200 dark:bg-slate-700' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>{icon}</button>
  );
  return <span className="flex gap-0.5">{b('pie', t('Donut'), '◔')}{b('bars', t('Bars'), '☰')}</span>;
}

const Row = ({ label, value, cls = '' }: { label: string; value: string; cls?: string }) => (
  <div className="flex items-baseline justify-between gap-3 text-sm"><span className="text-slate-500 dark:text-slate-400">{label}</span><span className={`num whitespace-nowrap text-right font-medium ${cls}`}>{value}</span></div>
);

const Empty = ({ text }: { text: string }) => <p className="text-sm text-slate-500 dark:text-slate-400">{text}</p>;

function Allocation({ id, slices }: { id: string; slices: { name: string; value: number; pct: number }[] }) {
  const pr = useStore(prefs);
  return viewOf(pr.views, id) === 'pie' ? <Donut slices={slices} otherName={t('Other')} /> : <Bars slices={slices} />;
}

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
        <div key={p.symbol} className="flex items-center justify-between gap-3 py-1.5 text-sm">
          <div className="min-w-0"><span className="font-semibold">{p.symbol}</span> <span className="truncate text-xs text-slate-500 dark:text-slate-400">{p.description}</span></div>
          <div className={`num whitespace-nowrap text-right ${tone(p.todayGl)}`}>{signedUsd(p.todayGl)} ({signedPct(p.todayGlPct)})</div>
        </div>
      ))}
    </div>
  );
}

// the big views of the cards
function AllocationBig({ slices }: { slices: { name: string; value: number; pct: number }[] }) {
  return (
    <div className="grid items-start gap-6 md:grid-cols-2">
      <Donut slices={slices} otherName={t('Other')} />
      <table className="w-full text-sm [&_td]:px-2 [&_th]:px-2"><tbody>
        {slices.map((s) => <tr key={s.name} className="border-b border-slate-100 dark:border-slate-800"><td className="py-1.5">{s.name}</td><td className="num py-1.5 text-right">{usd(s.value)}</td><td className="num py-1.5 text-right text-slate-500">{pct(s.pct)}</td></tr>)}
      </tbody></table>
    </div>
  );
}

function DividendsTable({ ps, today }: { ps: Position[]; today: string }) {
  const rows = upcomingDividends(ps, today, 30);
  const byAccount = (symbol: string) => securities(ps).filter((p) => p.symbol === symbol && p.exDate && p.exDate >= today);
  return (
    <div className="overflow-auto">
      <table className="w-full text-sm [&_td]:px-2 [&_th]:px-2">
        <thead><tr className="text-left text-xs text-slate-500"><th className="py-1.5">{t('Symbol')}</th><th>{t('Ex-date')}</th><th>{t('Pay date')}</th><th className="text-right">{t('Per share')}</th><th className="text-right">{t('Shares')}</th><th className="text-right">{t('To you')}</th><th>{t('Payment frequency')}</th><th>{t('Accounts')}</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.symbol} className="border-t border-slate-100 align-top dark:border-slate-800">
              <td className="py-1.5"><div className="font-semibold">{r.symbol}</div><div className="max-w-[16rem] truncate text-xs text-slate-500">{r.description}</div></td>
              <td className="num py-1.5">{siteDate(r.exDate)}</td>
              <td className="num py-1.5">{siteDate(r.payDate)}</td>
              <td className="num py-1.5 text-right">{usd(r.dividendAmount)}</td>
              <td className="num py-1.5 text-right">{qty(r.shares)}</td>
              <td className="num py-1.5 text-right font-medium">{usd(r.payout)}</td>
              <td className="py-1.5">{r.paymentFrequency ?? ''}</td>
              <td className="py-1.5 text-xs text-slate-500">{byAccount(r.symbol).map((p) => `${p.account.slice(-4)}: ${qty(p.quantity)}`).join(', ')}</td>
            </tr>
          ))}
        </tbody>
        <tfoot><tr className="border-t border-slate-200 font-semibold dark:border-slate-700"><td className="py-1.5" colSpan={5}>{t('Total')}</td><td className="num py-1.5 text-right">{usd(rows.reduce((x, r) => x + (r.payout ?? 0), 0))}</td><td colSpan={2} /></tr></tfoot>
      </table>
    </div>
  );
}

function RangeTable({ list }: { list: Position[] }) {
  const seen = new Set<string>();
  const rows = list.filter((p) => (seen.has(p.symbol) ? false : (seen.add(p.symbol), true)));
  return (
    <table className="w-full text-sm [&_td]:px-2 [&_th]:px-2">
      <thead><tr className="text-left text-xs text-slate-500"><th className="py-1.5">{t('Symbol')}</th><th className="text-right">{t('52-week low')}</th><th className="text-right">{t('Last price')}</th><th className="text-right">{t('52-week high')}</th></tr></thead>
      <tbody>{rows.map((p) => <tr key={p.symbol} className="border-t border-slate-100 dark:border-slate-800"><td className="py-1.5"><span className="font-semibold">{p.symbol}</span> <span className="text-xs text-slate-500">{p.description}</span></td><td className="num text-right">{usd(p.low52)}</td><td className="num text-right font-medium">{usd(p.lastPrice)}</td><td className="num text-right">{usd(p.high52)}</td></tr>)}</tbody>
    </table>
  );
}

export function Summary({ ds, accounts }: { ds: Dataset; accounts: Account[] }) {
  const tot = totalsOf(accounts);
  const ps = positionsIn(ds, accounts);
  const pr = useStore(prefs);
  const m = movers(ps, 5, pr.moversBy);
  const mBig = movers(ps, 20, pr.moversBy);
  const sortName: Record<AccountSort, string> = { value: t('Value'), todayUsd: t("Today's $"), todayPct: t("Today's %"), totalUsd: t('Total $'), totalPct: t('Total %') };
  const seg = (on: boolean) => `rounded px-1.5 py-0.5 text-xs ${on ? 'bg-slate-200 dark:bg-slate-700' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'}`;
  const today = new Date().toISOString().slice(0, 10);
  const divs = upcomingDividends(ps, today);
  const n52 = near52(ps);
  const sectors = allocation(ps, (p) => p.sector || p.securityType);
  const types = allocation(ps, (p) => p.securityType);
  const yieldOnValue = tot.balance > 0 ? (tot.estAnnualIncome / tot.balance) * 100 : null;

  return (
    <div className="gap-4 md:columns-2 xl:columns-3" data-summary>
      <Card id="balance" title={t('Balance')}>
        <div className="num text-4xl font-semibold tracking-tight">{usd(tot.balance)}</div>
        <div className={`num text-sm ${tone(tot.todayGl)}`}>{signedUsd(tot.todayGl)} ({signedPct(tot.todayGlPct)}) <span className="text-slate-500 dark:text-slate-400">{t("Today's gain/loss")}</span></div>
        <BalanceChart series={combine(ds.history, accounts.map((a) => a.number))} />
        <div className="mt-2 flex flex-col gap-1.5">
          <Row label={t('Total gain/loss')} value={`${signedUsd(tot.totalGl)} (${signedPct(tot.totalGlPct)})`} cls={tone(tot.totalGl)} />
          <Row label={t('Cost basis')} value={usd(tot.costBasis)} />
          <Row label={t('Cash (core)')} value={usd(tot.cash)} />
          {tot.pending !== 0 && <Row label={t('Pending activity')} value={signedUsd(tot.pending)} cls={tone(tot.pending)} />}
        </div>
      </Card>

      <Card id="movers" title={t('Your top and bottom movers')} tools={(
        <span className="flex gap-0.5" role="group" aria-label={t('Sort movers by')}>
          <button type="button" className={seg(pr.moversBy === 'pct')} aria-pressed={pr.moversBy === 'pct'} onClick={() => animate(() => setPrefs({ moversBy: 'pct' }))}>%</button>
          <button type="button" className={seg(pr.moversBy === 'usd')} aria-pressed={pr.moversBy === 'usd'} onClick={() => animate(() => setPrefs({ moversBy: 'usd' }))}>$</button>
        </span>
      )} expand={mBig.top.length || mBig.bottom.length ? (
        <div className="grid gap-6 md:grid-cols-2"><div><h3 className="mb-1 text-sm font-semibold gain">{t('Top')}</h3><Movers list={mBig.top} /></div><div><h3 className="mb-1 text-sm font-semibold loss">{t('Bottom')}</h3><Movers list={mBig.bottom} /></div></div>
      ) : undefined}>
        {m.top.length || m.bottom.length ? <><Movers list={m.top} /><Movers list={m.bottom} /></> : <Empty text={t('No price changes yet today')} />}
      </Card>

      <Card id="accounts" title={t('Accounts')} tools={(
        <select className="rounded border border-slate-200 bg-transparent px-1 py-0.5 text-xs dark:border-slate-700" value={pr.accountSort} aria-label={t('Sort accounts by')}
          onChange={(e) => { const v = e.target.value as AccountSort; animate(() => setPrefs({ accountSort: v })); }}>
          {ACCOUNT_SORTS.map((k) => <option key={k} value={k}>{sortName[k]}</option>)}
        </select>
      )}>
        <div className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800">
          {sortAccounts(accounts, pr.accountSort).map((a) => (
            <div key={a.number} className="flex items-center justify-between gap-3 py-2 text-sm">
              <div className="min-w-0"><div className="font-medium">{a.name}</div><div className="text-xs text-slate-500 dark:text-slate-400">{a.number} · {a.group}{a.type ? ` · ${a.type}` : ''}</div></div>
              <div className="text-right"><div className="num">{usd(a.balance)}</div><div className={`num text-xs ${tone(a.todayGl)}`}>{signedUsd(a.todayGl)} ({signedPct(a.todayGlPct)})</div></div>
            </div>
          ))}
        </div>
      </Card>

      <Card id="income" title={t('Income')}>
        <div className="num text-3xl font-semibold">{usd(tot.estAnnualIncome)}</div>
        <div className="text-sm text-slate-500 dark:text-slate-400">{t('Estimated annual income')}{yieldOnValue !== null ? ` · ${t('{pct} of the balance', { pct: pct(yieldOnValue) })}` : ''}</div>
        <Row label={t('Per month, on average')} value={usd(tot.estAnnualIncome / 12)} />
      </Card>

      <Card id="dividends" title={t('Upcoming ex-dividend dates (30 days)')} expand={divs.length ? <DividendsTable ps={ps} today={today} /> : undefined}>
        {divs.length > 0 && <div className="text-sm text-slate-500 dark:text-slate-400">{t('About {sum} to you from {n} payouts', { sum: usd(divs.reduce((x, d) => x + (d.payout ?? 0), 0)), n: divs.length })}</div>}
        {divs.length ? (
          <div className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800">
            {divs.slice(0, 8).map((p) => (
              <div key={p.symbol} className="flex items-center justify-between gap-3 py-1.5 text-sm">
                <div className="min-w-0"><div><span className="font-semibold">{p.symbol}</span> <span className="text-xs text-slate-500 dark:text-slate-400">{t('ex {date}', { date: siteDate(p.exDate) })}</span></div><div className="text-xs text-slate-500 dark:text-slate-400">{t('pay date {date}', { date: siteDate(p.payDate) })}</div></div>
                <div className="text-right">
                  <div className="num font-medium">{p.payout !== undefined ? usd(p.payout) : p.paymentFrequency ?? ''}</div>
                  {p.dividendAmount !== undefined && <div className="num text-xs text-slate-500">{t('{amount} × {shares} shares', { amount: usd(p.dividendAmount), shares: qty(p.shares) })}</div>}
                </div>
              </div>
            ))}
          </div>
        ) : <Empty text={t('No ex-dividend dates in the next 30 days')} />}
      </Card>

      <Card id="near52" title={t('Near a 52-week high or low')} expand={n52.highs.length || n52.lows.length ? <RangeTable list={n52.highs.concat(n52.lows)} /> : undefined}>
        {n52.highs.length || n52.lows.length ? (
          <div className="flex flex-col gap-2 text-sm">
            {n52.highs.length > 0 && <div><span className="gain font-medium">{t('High')}: </span>{Array.from(new Set(n52.highs.map((p) => p.symbol))).join(', ')}</div>}
            {n52.lows.length > 0 && <div><span className="loss font-medium">{t('Low')}: </span>{Array.from(new Set(n52.lows.map((p) => p.symbol))).join(', ')}</div>}
          </div>
        ) : <Empty text={t('Nothing within 3% of its 52-week high or low')} />}
      </Card>

      <Card id="sector" title={t('Allocation by sector')} tools={<ViewSwitch id="sector" />} expand={<AllocationBig slices={sectors} />}><Allocation id="sector" slices={sectors} /></Card>
      <Card id="type" title={t('Allocation by security type')} tools={<ViewSwitch id="type" />} expand={<AllocationBig slices={types} />}><Allocation id="type" slices={types} /></Card>
    </div>
  );
}
