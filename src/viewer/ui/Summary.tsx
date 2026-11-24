import type { Account, Dataset, Position } from '../../shared/model';
import { combine } from '../../shared/history';
import { ACCOUNT_SORTS, allocation, estAnnualOf, movers, incomeIn, localToday, near52, ofKind, periodBounds, positionsIn, rangeRows, payoutParts, payoutTotal, sortAccounts, totalsOf, upcomingDividends, type AccountSort, type RangeRow, type Slice, type Upcoming } from '../app/derive';
import { BalanceChart, PeriodChangeRow } from './BalanceChart';
import { Donut } from './Donut';
import { Zoom } from './Zoom';
import { animate } from './animate';
import { useRef, useState } from 'react';
import { GainLoss } from './GainLoss';
import { RangeBar } from './RangeBar';
import { Toggle } from './Toggle';
import { KindFilter } from './KindFilter';
import { Pills } from './Pills';
import { CORNER_BUTTON, ExpandIcon } from './icons';
import { prefs, setPrefs } from '../app/prefs';
import { useStore } from './useStore';
import { t } from '../app/i18n';
import { pct, qty, signedPct, signedUsd, siteDate, tone, usd, usd0 } from './format';

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
      {/* always mounted: a list that empties under an open window (a pill switched) must not drop the window; it shows the card's own view then */}
      <Zoom open={open} title={title} tools={tools} origin={box} onClose={() => setOpen(false)}>{expand ?? children}</Zoom>
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

const Empty = ({ text }: { text: string }) => <p className="text-sm text-slate-500 dark:text-slate-400">{text}</p>;

function Allocation({ id, slices }: { id: string; slices: Slice[] }) {
  const pr = useStore(prefs);
  return viewOf(pr.views, id) === 'pie' ? <Donut slices={slices} otherName={t('Other')} /> : <Bars slices={slices} />;
}

function Bars({ slices, all }: { slices: Slice[]; all?: boolean }) {
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
              <td className="whitespace-nowrap py-1 pl-3 text-right align-baseline"><GainLoss usd={p.todayGl} pct={p.todayGlPct} /></td>
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
function AllocationBig({ id, slices }: { id: string; slices: Slice[] }) {
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

// the big ex-dividend table (owner 2026-11-24: every value on one line, wide, easy to read): the total on top, one row
// per symbol, and when it sits in several accounts one line per account under it, named, in the Accounts card order
function DividendsTable({ rows, ps, accounts }: { rows: Upcoming[]; ps: Position[]; accounts: Account[] }) {
  const th = 'sticky top-0 z-10 bg-[var(--card-bg)] px-3 py-2 font-medium';
  return (
    <div className="overflow-x-auto">
      <table className="w-full whitespace-nowrap text-sm [&_td]:px-3 [&_td]:py-1.5" data-dividends-table>
        <thead><tr className="text-left text-xs text-slate-500">
          <th className={th}>{t('Symbol')}</th><th className={th}>{t('Account')}</th><th className={th}>{t('Ex-date')}</th><th className={th}>{t('Pay date')}</th>
          <th className={`${th} text-right`}>{t('Per share')}</th><th className={`${th} text-right`}>{t('Shares')}</th><th className={`${th} text-right`}>{t('To you')}</th><th className={`${th} text-right`}>{t('Frequency')}</th>
        </tr></thead>
        <tbody>
          <tr className="border-t border-slate-200 font-semibold dark:border-slate-700"><td colSpan={6}>{t('Total')} <span className="text-xs font-normal text-slate-500">{t('{n} payouts', { n: rows.length })}</span></td><td className="num text-right">{usd(payoutTotal(rows))}</td><td /></tr>
        </tbody>
        {rows.map((r) => {
          const parts = payoutParts(ps, accounts, r);
          const one = parts.length === 1 ? parts[0]!.account : null;
          return (
            <tbody key={r.symbol} className="border-t border-slate-100 dark:border-slate-800">
              <tr>
                <td><span className="font-semibold">{r.symbol}</span> <span className="inline-block max-w-[22rem] truncate align-bottom text-xs text-slate-500" title={r.description}>{r.description}</span></td>
                <td className="text-slate-600 dark:text-slate-300">{one ? one.name : t('{n} accounts', { n: parts.length })}</td>
                <td className="num">{siteDate(r.exDate)}</td>
                <td className="num">{siteDate(r.payDate)}</td>
                <td className="num text-right">{usd(r.dividendAmount)}</td>
                <td className="num text-right">{qty(r.shares)}</td>
                <td className="num text-right font-medium">{usd(r.payout)}</td>
                <td className="text-right">{r.paymentFrequency ?? ''}</td>
              </tr>
              {!one && parts.map((p) => (
                <tr key={p.account.number} className="text-xs text-slate-500 dark:text-slate-400">
                  <td />
                  <td className="pl-6">{p.account.name} <span className="text-slate-400">···{p.account.number.slice(-4)}</span></td>
                  <td colSpan={3} />
                  <td className="num text-right">{qty(p.shares)}</td>
                  <td className="num text-right">{usd(p.payout)}</td>
                  <td />
                </tr>
              ))}
            </tbody>
          );
        })}
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
              <RangeBar pos={r.pos} color={high ? 'var(--gain)' : 'var(--loss)'} className="w-24 flex-none" title={pct(r.pos * 100)} />
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
  const moverPs = ofKind(ps, pr.moversOf);
  const m = movers(moverPs, 5, pr.moversBy);
  const mBig = movers(moverPs, 20, pr.moversBy);
  const sortName: Record<AccountSort, string> = { mine: t('My order'), value: t('Value'), todayUsd: t("Today's $"), todayPct: t("Today's %"), totalUsd: t('Total $'), totalPct: t('Total %') };
  const shownAccounts = sortAccounts(accounts, pr.accountSort);
  const today = localToday();
  const divPs = ofKind(ps, pr.dividendsOf);
  const divs = upcomingDividends(divPs, today);
  const n52 = near52(ps);
  const sectors = allocation(ps, (p) => p.sector || p.securityType);
  const types = allocation(ps, (p) => p.securityType);
  const balance = combine(ds.history, accounts.map((a) => a.number));
  const bounds = periodBounds(today);
  const incomePs = ofKind(ps, pr.incomeOf);
  const incQ = incomeIn(incomePs, bounds.quarter[0], bounds.quarter[1], today);
  const incM = incomeIn(incomePs, bounds.month[0], bounds.month[1], today);
  const incY = incomeIn(incomePs, bounds.year[0], bounds.year[1], today);
  // Fidelity's annual estimate: the accounts' own for All (cash interest in it), the positions' sum for ETFs or Stocks
  const estAnnual = estAnnualOf(pr.incomeOf, tot.estAnnualIncome, ps);

  return (
    <div className="gap-4 md:columns-2 xl:columns-3" data-summary>
      <Card id="balance" title={t('Balance')} expand={balance.length >= 2 ? <BalanceChart series={balance} big /> : undefined}>
        {/* the balance and today's change on the left, the other facts in a compact table on the right (owner 2026-11-24:
            "move that part to top right"); on a narrow card they wrap under */}
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
          <div className="min-w-0">
            <div className="num text-4xl font-semibold tracking-tight">{usd(tot.balance)}</div>
            {/* Today and the period's change as a table with no borders (owner 2026-11-24): values in one column, words in
                the next */}
            <table className="text-sm"><tbody>
              <tr><td className="whitespace-nowrap pr-3"><GainLoss usd={tot.todayGl} pct={tot.todayGlPct} /></td><td className="text-slate-500 dark:text-slate-400">{t('Today')}</td></tr>
              <PeriodChangeRow series={balance} />
            </tbody></table>
          </div>
          <table className="text-xs" data-balance-facts>
            <tbody className="[&_td]:py-0.5">
              <tr><td className="pr-4 text-slate-500 dark:text-slate-400">{t('Total gain/loss')}</td><td className="text-right font-medium"><GainLoss usd={tot.totalGl} pct={tot.totalGlPct} /></td></tr>
              <tr><td className="pr-4 text-slate-500 dark:text-slate-400">{t('Cost basis')}</td><td className="num text-right font-medium">{usd(tot.costBasis)}</td></tr>
              <tr><td className="pr-4 text-slate-500 dark:text-slate-400">{t('Cash (core)')}</td><td className="num text-right font-medium">{usd(tot.cash)}</td></tr>
              {tot.pending !== 0 && <tr><td className="pr-4 text-slate-500 dark:text-slate-400">{t('Pending activity')}</td><td className="num text-right font-medium" title={t('Not settled yet: buys, sells and transfers in progress')}>{signedUsd(tot.pending)}</td></tr>}
            </tbody>
          </table>
        </div>
        <BalanceChart series={balance} />
      </Card>

      <Card id="movers" title={t('Your top and bottom movers')} tools={(
        <span className="flex flex-wrap items-center justify-end gap-2">
        <KindFilter value={pr.moversOf} label={t('Movers of')} onChange={(v) => animate(() => setPrefs({ moversOf: v }))} />
        <Toggle value={pr.moversBy} label={t('Sort movers by')} a={{ value: 'pct', text: '%', title: t('Movers by %') }} b={{ value: 'usd', text: '$', title: t('Movers by $') }}
          onChange={(v) => animate(() => setPrefs({ moversBy: v }))} />
        </span>
      )} expand={mBig.top.length || mBig.bottom.length ? (
        <div className="grid gap-6 md:grid-cols-2"><div><h3 className="mb-1 text-sm font-semibold gain">{t('Top')}</h3><Movers lists={[mBig.top]} at="big" /></div><div><h3 className="mb-1 text-sm font-semibold loss">{t('Bottom')}</h3><Movers lists={[mBig.bottom]} at="big" /></div></div>
      ) : undefined}>
        {m.top.length || m.bottom.length ? <Movers lists={[m.top, m.bottom]} at="card" /> : <Empty text={t('No price changes yet today')} />}
      </Card>

      {/* the order as pills in one row on the right of the title row (owner 2026-11-24: buttons in line, like Fidelity's
          1M YTD 1Y 3Y; then "move to the right" for some air after the title); on a narrow card they wrap under it */}
      <Card id="accounts" title={t('Accounts')} tools={(
        <Pills items={ACCOUNT_SORTS} value={pr.accountSort} label={t('Sort accounts by')} labelOf={(k) => sortName[k]} className="justify-end"
          onChange={(k) => animate(() => setPrefs({ accountSort: k }))} />
      )}>
        <div className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800">
          {shownAccounts.map((a) => (
            <div key={a.number} className="flex items-center justify-between gap-3 py-2 text-sm">
              <div className="min-w-0"><div className="font-medium">{a.name}</div><div className="text-xs text-slate-500 dark:text-slate-400">{a.number} · {a.group}{a.type ? ` · ${a.type}` : ''}</div></div>
              <div className="text-right"><div className="num">{usd(a.balance)}</div><div className="text-xs"><GainLoss usd={a.todayGl} pct={a.todayGlPct} /></div></div>
            </div>
          ))}
        </div>
      </Card>

      <Card id="dividends" title={t('Upcoming ex-dividend dates (30 days)')} tools={<KindFilter value={pr.dividendsOf} label={t('Ex-dividend dates of')} onChange={(v) => animate(() => setPrefs({ dividendsOf: v }))} />}
        expand={divs.length ? <DividendsTable rows={divs} ps={divPs} accounts={shownAccounts} /> : undefined}>
        {divs.length ? (
          <div className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800">
            {/* the total on top, as the first row (owner 2026-11-24) */}
            <div className="flex items-center justify-between gap-3 py-1.5 text-sm" data-dividends-total>
              <div><span className="font-semibold">{t('Total')}</span> <span className="text-xs text-slate-500 dark:text-slate-400">{t('{n} payouts', { n: divs.length })}</span></div>
              <div className="num font-semibold">{usd(payoutTotal(divs))}</div>
            </div>
            {divs.slice(0, 8).map((p) => (
              <div key={p.symbol} className="flex items-center justify-between gap-3 py-1.5 text-sm">
                <div className="min-w-0"><div><span className="font-semibold">{p.symbol}</span> <span className="text-xs text-slate-500 dark:text-slate-400">{t('ex {date}', { date: siteDate(p.exDate) })}</span></div><div className="text-xs text-slate-500 dark:text-slate-400">{t('pay date {date}', { date: siteDate(p.payDate) })}</div></div>
                <div className="text-right">
                  <div className="num font-medium">{p.payout !== undefined ? usd(p.payout) : p.paymentFrequency ?? ''}</div>
                  {p.dividendAmount !== undefined && <div className="num text-xs text-slate-500">{t('{shares} × {amount}', { amount: usd(p.dividendAmount), shares: qty(p.shares) })}</div>}
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
      {/* YTD / Y | QTD / Q | MTD / M (owner 2026-11-24): each is meant to show received so far / the total of the current
          calendar year, quarter and month (received and still to come), with a bar of the received share. Received so far
          is `--` and the bar an empty track until the transactions history is read; the total is the dividends from each
          position's pay date stepped by its frequency (incomeIn); Fidelity's own annual estimate in the bottom line */}
      <Card id="income" title={t('Income')} tools={<KindFilter value={pr.incomeOf} label={t('Income of')} onChange={(v) => animate(() => setPrefs({ incomeOf: v }))} />}>
        {/* the tiles take the width their numbers need, never cut (owner 2026-11-24: "values without ...", the year wider);
            the total is in whole dollars; on a narrow card they wrap */}
        <div className="flex flex-wrap justify-between gap-x-6 gap-y-3" data-income>
          {[{ key: 'Y', v: incY }, { key: 'Q', v: incQ }, { key: 'M', v: incM }].map(({ key, v }) => (
            // received so far is a fact only the transactions history gives (owner 2026-11-24: the estimate from today's
            // shares overstated it): -- until it is read; the total is the plan at today's holdings
            <div key={key} className="flex-auto" data-income-period={key} title={t('planned {total} at today\'s holdings; still to come {coming}', { total: usd(v.total), coming: usd(v.coming) })}>
              <div className="text-xs text-slate-500 dark:text-slate-400">{key}TD / {key}</div>
              <div className="num whitespace-nowrap"><span className="text-xl font-semibold text-slate-400 sm:text-2xl" title={t('Needs the transactions history')}>--</span> <span className="text-sm text-slate-500 dark:text-slate-400">/ {usd0(v.total)}</span></div>
              <div className="mt-1 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800" />
              {/* On average first, then the share of the balance (owner 2026-11-24); the year has no average, an empty line
                  keeps its share level with the others */}
              <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{key === 'Y' ? '\u00a0' : <>{t('On average')} · <span className="num">{usd(estAnnual / (key === 'Q' ? 4 : 12))}</span></>}</div>
              <div className="text-xs text-slate-500 dark:text-slate-400">{tot.balance > 0 ? t('{pct} of the balance', { pct: pct((v.total / tot.balance) * 100) }) : ''}</div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
