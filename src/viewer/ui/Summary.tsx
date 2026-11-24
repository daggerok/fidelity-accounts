import type { Account, Dataset, Position } from '../../shared/model';
import { combine } from '../../shared/history';
import { ACCOUNT_SORTS, allocation, movers, incomeIn, near52, periodBounds, positionsIn, rangeRows, securities, sortAccounts, totalsOf, upcomingDividends, type AccountSort, type RangeRow } from '../app/derive';
import { BalanceChart } from './BalanceChart';
import { Donut } from './Donut';
import { Zoom } from './Zoom';
import { animate } from './animate';
import { useRef, useState } from 'react';
import { Toggle } from './Toggle';
import { CORNER_BUTTON, ExpandIcon } from './icons';
import { prefs, setPrefs } from '../app/prefs';
import { useStore } from './useStore';
import { t } from '../app/i18n';
import { pct, qty, signedPct, signedUsd, siteDate, tone, usd } from './format';

// Summary: cards of information like the Fidelity summary page, for the chosen scope. Each card is as tall as its
// content and the cards pack into columns (owner 2026-11-23: plates sized by their content, a shorter page on desktop)
// `expand`: the card's full view, opened big over the page by ⤢ (owner 2026-11-23: maximize for every plate where it
// makes sense, more rows and details there)
// `lead` sits right after the title, `tools` at the top right corner
function Card({ id, title, children, tools, lead, expand }: { id: string; title: string; children: React.ReactNode; tools?: React.ReactNode; lead?: React.ReactNode; expand?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLElement>(null);
  return (
    <section ref={box} className="card mb-4 flex w-full break-inside-avoid flex-col gap-3" style={{ viewTransitionName: `card-${id}` } as React.CSSProperties} data-card={id}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 className="text-lg font-semibold">{title}</h2>
        {lead}
        {/* the expand icon sits as far from the top right corner as the title from the top left (owner 2026-11-24) */}
        <span className="-my-1 ml-auto flex items-center gap-2">{tools}{expand && <button type="button" className={CORNER_BUTTON} title={t('Open big')} onClick={() => setOpen(true)} data-expand><ExpandIcon /></button>}</span>
      </div>
      {children}
      {expand && <Zoom open={open} title={title} tools={tools} origin={box} onClose={() => setOpen(false)}>{expand}</Zoom>}
    </section>
  );
}

// bars or a donut, each card its own choice (remembered by card id), switched with the morph animation
const viewOf = (views: Record<string, 'bars' | 'pie'>, id: string): 'bars' | 'pie' => views[id] ?? 'pie';
function ViewSwitch({ id }: { id: string }) {
  const pr = useStore(prefs);
  return (
    <Toggle value={viewOf(pr.views, id)} label={t('Chart view')} a={{ value: 'pie', text: '◔', title: t('Show as donut') }} b={{ value: 'bars', text: '☰', title: t('Show as bars') }}
      onChange={(v) => animate(() => setPrefs({ views: { ...prefs.get().views, [id]: v } }))} />
  );
}

const Row = ({ label, value, cls = '' }: { label: string; value: string; cls?: string }) => (
  <div className="flex items-baseline justify-between gap-3 text-sm"><span className="text-slate-500 dark:text-slate-400">{label}</span><span className={`num whitespace-nowrap text-right font-medium ${cls}`}>{value}</span></div>
);

const Empty = ({ text }: { text: string }) => <p className="text-sm text-slate-500 dark:text-slate-400">{text}</p>;

function Allocation({ id, slices }: { id: string; slices: { name: string; value: number; pct: number }[] }) {
  const pr = useStore(prefs);
  return viewOf(pr.views, id) === 'pie' ? <Donut slices={slices} otherName={t('Other')} /> : <Bars slices={slices} />;
}

function Bars({ slices, all }: { slices: { name: string; value: number; pct: number }[]; all?: boolean }) {
  return (
    <div className={all ? 'gap-8 md:columns-2 [&>div]:mb-2 [&>div]:break-inside-avoid' : 'flex flex-col gap-2'}>
      {(all ? slices : slices.slice(0, 8)).map((s) => (
        <div key={s.name} className="text-sm">
          <div className="flex justify-between gap-3"><span className="truncate">{s.name}</span><span className="num text-slate-500 dark:text-slate-400">{usd(s.value)} · {pct(s.pct)}</span></div>
          <div className="mt-1 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800"><div className="h-1.5 rounded-full" style={{ width: `${Math.max(1, s.pct)}%`, background: 'var(--brand)' }} /></div>
        </div>
      ))}
    </div>
  );
}

// each row has its own transition name, so on % and $ the rows glide to their new places; `at` keeps the card's and
// the big window's names apart (a name used twice cancels the whole transition). A table with no borders (owner
// 2026-11-24): tickers, names and values ("$ (%)" as one column) each aligned; the lists share one table so the top and
// the bottom line up too
function Movers({ lists, at }: { lists: Position[][]; at: 'card' | 'big' }) {
  return (
    <table className="w-full text-sm" data-movers>
      {lists.map((list, i) => (
        <tbody key={i}>
          {i > 0 && list.length > 0 && <tr aria-hidden><td colSpan={3} className="h-3" /></tr>}
          {list.map((p) => (
            <tr key={p.symbol} style={{ viewTransitionName: `mv-${at}-${p.symbol.replace(/\W/g, '_')}` } as React.CSSProperties}>
              <td className="whitespace-nowrap py-1 pr-2 align-baseline font-semibold">{p.symbol}</td>
              <td className="w-full max-w-0 truncate py-1 align-baseline text-xs text-slate-500 dark:text-slate-400" title={p.description}>{p.description}</td>
              <td className={`num whitespace-nowrap py-1 pl-3 text-right align-baseline ${tone(p.todayGl)}`}>{signedUsd(p.todayGl)} ({signedPct(p.todayGlPct)})</td>
            </tr>
          ))}
        </tbody>
      ))}
    </table>
  );
}

// the big views of the cards
// the zoomed card follows its own toggle (owner 2026-11-24 bug: bars had no effect in the big window): bars = every
// slice as a bar, donut = the donut and the full table
function AllocationBig({ id, slices }: { id: string; slices: { name: string; value: number; pct: number }[] }) {
  const pr = useStore(prefs);
  if (viewOf(pr.views, id) !== 'pie') return <Bars slices={slices} all />;
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

// the big 52-week table (owner 2026-11-24: "more info here"): highs and lows apart, where the price sits in its range,
// how far from the high and the low, today's move and what is held in the shown accounts
function RangeTable({ highs, lows }: { highs: Position[]; lows: Position[] }) {
  const th = 'px-2 py-1.5 text-right font-medium';
  const section = (title: string, cls: string, rows: RangeRow[], high: boolean) => rows.length > 0 && (
    <tbody>
      <tr><td colSpan={8} className={`px-2 pt-4 pb-1 text-sm font-semibold ${cls}`}>{title}</td></tr>
      {rows.map((r) => (
        <tr key={r.symbol} className="border-t border-slate-100 dark:border-slate-800 [&>td]:px-2 [&>td]:py-1.5">
          <td className="max-w-[18rem]"><div><span className="font-semibold">{r.symbol}</span> <span className="text-xs text-slate-500">{r.sector ?? ''}</span></div><div className="truncate text-xs text-slate-500" title={r.description}>{r.description}</div></td>
          <td>
            <div className="flex items-center justify-end gap-2 num text-xs text-slate-500">
              <span>{usd(r.low52)}</span>
              <span className="relative h-1.5 w-24 flex-none rounded-full bg-slate-200 dark:bg-slate-700" title={pct(r.pos * 100)}>
                <span className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ left: `${r.pos * 100}%`, background: high ? 'var(--gain)' : 'var(--loss)' }} />
              </span>
              <span>{usd(r.high52)}</span>
            </div>
          </td>
          <td className="num text-right"><div className="font-medium">{usd(r.lastPrice)}</div><div className={`text-xs ${tone(r.dayPct)}`}>{signedPct(r.dayPct)}</div></td>
          <td className="num text-right">{signedPct(r.fromHigh)}</td>
          <td className="num text-right">{signedPct(r.fromLow)}</td>
          <td className="num text-right">{qty(r.shares)}</td>
          <td className="num text-right">{usd(r.value)}</td>
          <td className={`num text-right ${tone(r.totalGl)}`}><div>{signedUsd(r.totalGl)}</div><div className="text-xs">{signedPct(r.totalGlPct)}</div></td>
        </tr>
      ))}
    </tbody>
  );
  return (
    <div className="overflow-x-auto">
      <table className="w-full whitespace-nowrap text-sm">
        <thead><tr className="text-xs text-slate-500"><th className={`${th} text-left`}>{t('Symbol')}</th><th className={th}>{t('52-week range')}</th><th className={th}>{t('Last price')}</th><th className={th}>{t('From the high')}</th><th className={th}>{t('From the low')}</th><th className={th}>{t('Shares')}</th><th className={th}>{t('Value')}</th><th className={th}>{t('Total gain/loss')}</th></tr></thead>
        {section(t('Near the high'), 'gain', rangeRows(highs).sort((a, b) => b.pos - a.pos), true)}
        {section(t('Near the low'), 'loss', rangeRows(lows).sort((a, b) => a.pos - b.pos), false)}
      </table>
    </div>
  );
}

export function Summary({ ds, accounts }: { ds: Dataset; accounts: Account[] }) {
  const tot = totalsOf(accounts);
  const ps = positionsIn(ds, accounts);
  const pr = useStore(prefs);
  const m = movers(ps, 5, pr.moversBy);
  const mBig = movers(ps, 20, pr.moversBy);
  const sortName: Record<AccountSort, string> = { mine: t('My order'), value: t('Value'), todayUsd: t("Today's $"), todayPct: t("Today's %"), totalUsd: t('Total $'), totalPct: t('Total %') };
  const today = new Date().toISOString().slice(0, 10);
  const divs = upcomingDividends(ps, today);
  const n52 = near52(ps);
  const sectors = allocation(ps, (p) => p.sector || p.securityType);
  const types = allocation(ps, (p) => p.securityType);
  const balance = combine(ds.history, accounts.map((a) => a.number));
  const bounds = periodBounds(today);
  const incQ = incomeIn(ps, bounds.quarter[0], bounds.quarter[1], today);
  const incM = incomeIn(ps, bounds.month[0], bounds.month[1], today);
  const incY = incomeIn(ps, bounds.year[0], bounds.year[1], today);
  const yieldOnValue = tot.balance > 0 ? (tot.estAnnualIncome / tot.balance) * 100 : null;

  return (
    <div className="gap-4 md:columns-2 xl:columns-3" data-summary>
      <Card id="balance" title={t('Balance')} expand={balance.length >= 2 ? <BalanceChart series={balance} big /> : undefined}>
        <div className="num text-4xl font-semibold tracking-tight">{usd(tot.balance)}</div>
        <div className={`num text-sm ${tone(tot.todayGl)}`}>{signedUsd(tot.todayGl)} ({signedPct(tot.todayGlPct)}) <span className="text-slate-500 dark:text-slate-400">{t("Today's gain/loss")}</span></div>
        <BalanceChart series={balance} />
        <div className="mt-2 flex flex-col gap-1.5">
          <Row label={t('Total gain/loss')} value={`${signedUsd(tot.totalGl)} (${signedPct(tot.totalGlPct)})`} cls={tone(tot.totalGl)} />
          <Row label={t('Cost basis')} value={usd(tot.costBasis)} />
          <Row label={t('Cash (core)')} value={usd(tot.cash)} />
          {tot.pending !== 0 && <Row label={t('Pending activity')} value={signedUsd(tot.pending)} cls={tone(tot.pending)} />}
        </div>
      </Card>

      <Card id="movers" title={t('Your top and bottom movers')} tools={(
        <Toggle value={pr.moversBy} label={t('Sort movers by')} a={{ value: 'pct', text: '%', title: t('Movers by %') }} b={{ value: 'usd', text: '$', title: t('Movers by $') }}
          onChange={(v) => animate(() => setPrefs({ moversBy: v }))} />
      )} expand={mBig.top.length || mBig.bottom.length ? (
        <div className="grid gap-6 md:grid-cols-2"><div><h3 className="mb-1 text-sm font-semibold gain">{t('Top')}</h3><Movers lists={[mBig.top]} at="big" /></div><div><h3 className="mb-1 text-sm font-semibold loss">{t('Bottom')}</h3><Movers lists={[mBig.bottom]} at="big" /></div></div>
      ) : undefined}>
        {m.top.length || m.bottom.length ? <Movers lists={[m.top, m.bottom]} at="card" /> : <Empty text={t('No price changes yet today')} />}
      </Card>

      {/* the order as pills in one row right after the title (owner 2026-11-24: buttons in line, like Fidelity's 1M YTD
          1Y 3Y; "not below accounts word, but after it to the right"); on a narrow card they wrap under it */}
      <Card id="accounts" title={t('Accounts')} lead={(
        <div className="flex flex-wrap gap-1" role="group" aria-label={t('Sort accounts by')}>
          {ACCOUNT_SORTS.map((k) => (
            <button key={k} type="button" aria-pressed={pr.accountSort === k} onClick={() => animate(() => setPrefs({ accountSort: k }))}
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${pr.accountSort === k ? 'text-white' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`}
              style={pr.accountSort === k ? { background: 'var(--brand)' } : undefined}>{sortName[k]}</button>
          ))}
        </div>
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

      <Card id="near52" title={t('Near a 52-week high or low')} expand={n52.highs.length || n52.lows.length ? <RangeTable highs={n52.highs} lows={n52.lows} /> : undefined}>
        {n52.highs.length || n52.lows.length ? (
          <div className="flex flex-col gap-2 text-sm">
            {n52.highs.length > 0 && <div><span className="gain font-medium">{t('High')}: </span>{Array.from(new Set(n52.highs.map((p) => p.symbol))).join(', ')}</div>}
            {n52.lows.length > 0 && <div><span className="loss font-medium">{t('Low')}: </span>{Array.from(new Set(n52.lows.map((p) => p.symbol))).join(', ')}</div>}
          </div>
        ) : <Empty text={t('Nothing within 3% of its 52-week high or low')} />}
      </Card>

      <Card id="sector" title={t('Allocation by sector')} tools={<ViewSwitch id="sector" />} expand={<AllocationBig id="sector" slices={sectors} />}><Allocation id="sector" slices={sectors} /></Card>
      <Card id="type" title={t('Allocation by security type')} tools={<ViewSwitch id="type" />} expand={<AllocationBig id="type" slices={types} />}><Allocation id="type" slices={types} /></Card>
      {/* Income Y | Q | M (owner 2026-11-24): each shows received so far / the total of the current calendar year, quarter
          and month (received and still to come), with a bar of the received share. Dividends from each position's pay
          date stepped by its frequency (incomeIn); Fidelity's own annual estimate in the bottom line */}
      <Card id="income" title={t('Income')}>
        <div className="grid grid-cols-3 gap-3" data-income>
          {[{ key: 'Y', v: incY }, { key: 'Q', v: incQ }, { key: 'M', v: incM }].map(({ key, v }) => (
            <div key={key} className="min-w-0" data-income-period={key} title={t('received {paid} of {total}; coming {coming}', { paid: usd(v.paid), total: usd(v.total), coming: usd(v.coming) })}>
              <div className="text-xs text-slate-500 dark:text-slate-400">{t('Income {period}', { period: key })}</div>
              <div className="num truncate"><span className="text-xl font-semibold sm:text-2xl">{usd(v.paid)}</span> <span className="text-sm text-slate-500 dark:text-slate-400">/ {usd(v.total)}</span></div>
              <div className="mt-1 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800"><div className="h-1.5 rounded-full transition-[width] duration-300" style={{ width: `${v.total > 0 ? (v.paid / v.total) * 100 : 0}%`, background: 'var(--brand)' }} /></div>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 border-t border-slate-100 pt-2 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
          <span>{t('Estimated annual income')} · <span className="num">{usd(tot.estAnnualIncome)}</span>{yieldOnValue !== null ? ` · ${t('{pct} of the balance', { pct: pct(yieldOnValue) })}` : ''}</span>
          <span>{t('Per month, on average')} · <span className="num">{usd(tot.estAnnualIncome / 12)}</span></span>
        </div>
      </Card>
    </div>
  );
}
