/// <reference lib="esnext" />
import type { Account, Dataset } from '../../shared/model';
import { ACCOUNT_SORTS, movers, ofKind, payoutTotal, sortAccounts, DIV_WINDOWS, type AccountSort } from '../app/derive';
import { MOVERS_MAX, accountBetas, dividendsView, incomeView, summaryBase } from '../app/summary';
import { BalanceChart, PeriodChangeRow } from './BalanceChart';
import { animate } from './animate';
import { memo, useMemo } from 'react';
import { GainLoss } from './GainLoss';
import { Toggle } from './Toggle';
import { KindFilter } from './KindFilter';
import { Pills } from './Pills';
import { useFitRows } from './useFitRows';
import { AccountBeta } from './BetaBreakdown';
import { Card } from './Card';
import { Movers, MoversBig } from './Movers';
import { Allocation, AllocationBig, ViewSwitch } from './Allocation';
import { DividendsTable } from './DividendsTable';
import { RangeTable } from './RangeTable';
import { prefs, setPrefs } from '../app/prefs';
import { useStore } from './useStore';
import { transactions } from '../app/data';
import { lang, t } from '../app/i18n';
import { maskAccount, pct, qty, signedUsd, siteDate, usd, usd0 } from './format';

// a line of tickers in one colour, the commas plain
function Tickers({ symbols, tone, title }: { symbols: string[]; tone: 'gain' | 'loss'; title: string }) {
  return (
    <div title={title} data-tickers={tone}>
      {Array.from(new Set(symbols)).map((s, i) => <span key={s}>{i > 0 && <span className="text-slate-400">, </span>}<span className={`${tone} font-medium`}>{s}</span></span>)}
    </div>
  );
}

const Empty = ({ text }: { text: string }) => <p className="text-sm text-slate-500 dark:text-slate-400">{text}</p>;

// Summary: cards of information like the Fidelity summary page, for the chosen scope, each card a Card (Card.tsx)
// `title`: the name of what is shown (All accounts, a group, the accounts chosen), the Balance card's title; `today`: the
// owner's date (localToday) from App, so the numbers move to the next day on App's first draw after midnight, as before
// Memoised with stable props from App (the accounts under useMemo, the rest strings), so a status message of the script
// or a line of the Sheets log, which draw App again, do not draw the cards again; each part of the numbers is worked out
// again only when its own inputs change (app/summary.ts)
export const Summary = memo(function Summary({ ds, accounts, title, titleHint, today }: { ds: Dataset; accounts: Account[]; title: string; titleHint?: string; today: string }) {
  // the words follow the language on their own: App drawing again no longer draws this
  useStore(lang);
  const pr = useStore(prefs);
  const txns = useStore(transactions);
  const { tot, ps, n52, sectors, types, balance } = useMemo(() => summaryBase(ds, accounts), [ds, accounts]);
  const moverPs = useMemo(() => ofKind(ps, pr.moversOf), [ps, pr.moversOf]);
  // on a big screen the movers and the dividends show as many rows as fit above the footer (useFitRows)
  const [moversBox, moversN] = useFitRows(5, MOVERS_MAX, 2, `${pr.moversBy}-${pr.moversOf}-${moverPs.length}`);
  const m = useMemo(() => movers(moverPs, moversN, pr.moversBy), [moverPs, moversN, pr.moversBy]);
  const mBig = useMemo(() => movers(moverPs, MOVERS_MAX, pr.moversBy), [moverPs, pr.moversBy]);
  const sortName: Record<AccountSort, string> = { mine: t('My order'), value: t('Value'), todayUsd: t("Today's $"), todayPct: t("Today's %"), totalUsd: t('Total $'), totalPct: t('Total %') };
  const shownAccounts = useMemo(() => sortAccounts(accounts, pr.accountSort), [accounts, pr.accountSort]);
  const betas = useMemo(() => accountBetas(ps, accounts, ds.betas), [ps, accounts, ds.betas]);
  // sorted by Total $ or Total %: each account shows its total gain or loss, not today's (owner 2026-11-25)
  const totalView = pr.accountSort === 'totalUsd' || pr.accountSort === 'totalPct';
  const { ps: divPs, until: divsUntil, divs } = useMemo(() => dividendsView(ps, pr.dividendsOf, pr.dividendsWindow, today), [ps, pr.dividendsOf, pr.dividendsWindow, today]);
  const [divsBox, divsN] = useFitRows(8, divs.length, 1, `${pr.dividendsWindow}-${pr.dividendsOf}-${divs.length}`);
  // Fidelity's annual estimate: the accounts' own for All (cash interest in it), the positions' sum for ETFs or Stocks
  const { Y: incY, Q: incQ, M: incM, estAnnual } = useMemo(() => incomeView(txns, accounts, ps, pr.incomeOf, today, tot.estAnnualIncome), [txns, accounts, ps, pr.incomeOf, today, tot.estAnnualIncome]);

  return (
    // the space between cards equals the space from the screen edge to the navbar: 16 px, 24 px from lg (owner 2026-11-24)
    <div className="gap-4 md:columns-2 lg:gap-6 xl:columns-3" data-summary>
      <Card id="balance" title={title} titleHint={titleHint} expand={balance.length >= 2 ? <BalanceChart series={balance} big /> : undefined}>
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
        <div className="grid gap-6 md:grid-cols-2"><div><h3 className="mb-1 text-sm font-semibold gain">{t('Top')}</h3><MoversBig list={mBig.top} by={pr.moversBy} /></div><div><h3 className="mb-1 text-sm font-semibold loss">{t('Bottom')}</h3><MoversBig list={mBig.bottom} by={pr.moversBy} /></div></div>
      ) : undefined}>
        <div ref={moversBox}>{m.top.length || m.bottom.length ? <Movers lists={[m.top, m.bottom]} at="card" /> : <Empty text={t('No price changes yet today')} />}</div>
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
              <div className="min-w-0 flex-1"><div className="font-medium">{a.name}</div><div className="text-xs text-slate-500 dark:text-slate-400"><span title={a.number}>{maskAccount(a.number)}</span> · {a.group}{a.type ? ` · ${a.type}` : ''}</div></div>
              <div className="text-right"><div className="num">{usd(a.balance)}</div><div className="text-xs" title={totalView ? t('Total gain/loss') : t("Today's gain/loss")}>{totalView ? <GainLoss usd={a.totalGl} pct={a.totalGlPct} /> : <GainLoss usd={a.todayGl} pct={a.todayGlPct} />}</div></div>
              {/* the account's beta from its positions' sizes, the right-most column (owner 2026-11-25); 1.17β with the
                  covered share under it instead of the word Beta (owner 2026-11-26), a click opens where it comes from.
                  A fixed width keeps the amounts column aligned from row to row */}
              <div className="w-11 shrink-0 text-right" data-beta-cell><AccountBeta name={a.name} breakdown={betas.get(a.number)!} /></div>
            </div>
          ))}
        </div>
      </Card>

      {/* how far ahead, on the right before the ETFs and Stocks chips (owner 2026-11-24: like the Balance periods, MTD by
          default; then "align periods to the right") */}
      <Card id="dividends" title={t('Upcoming dividends')} tools={(
        <span className="flex flex-wrap items-center justify-end gap-2">
          <Pills items={DIV_WINDOWS} value={pr.dividendsWindow} label={t('Ex-dividend dates until')} labelOf={(w) => w}
            onChange={(w) => animate(() => setPrefs({ dividendsWindow: w }))} />
          <KindFilter value={pr.dividendsOf} label={t('Ex-dividend dates of')} onChange={(v) => animate(() => setPrefs({ dividendsOf: v }))} />
        </span>
      )}
        expand={divs.length ? <DividendsTable rows={divs} ps={divPs} accounts={shownAccounts} /> : undefined}>
        {divs.length ? (
          <div ref={divsBox} className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800">
            {/* the total on top, as the first row (owner 2026-11-24) */}
            {/* DRIP only in the ⤢ table (owner 2026-11-24: "hide DRIP on plate and show only in zoomed view") */}
            <div className="flex items-center justify-between gap-3 py-1.5 text-sm" data-dividends-total>
              <div><span className="font-semibold">{t('Total')}</span> <span className="text-xs text-slate-500 dark:text-slate-400">{t('{n} payouts', { n: divs.length })}</span></div>
              <div className="num font-semibold">{usd(payoutTotal(divs))}</div>
            </div>
            {divs.slice(0, divsN).map((p) => (
              <div key={p.symbol} className="flex items-center justify-between gap-3 py-1.5 text-sm" data-fit-row>
                {/* the ticker alone, both dates on the line under it (owner 2026-11-24) */}
                <div className="min-w-0"><div className="font-semibold">{p.symbol}</div><div className="text-xs text-slate-500 dark:text-slate-400">{t('ex date: {ex} pay date: {pay}', { ex: siteDate(p.exDate), pay: siteDate(p.payDate) })}</div></div>
                <div className="text-right">
                  <div className="num font-medium">{p.payout !== undefined ? usd(p.payout) : p.paymentFrequency ?? ''}</div>
                  {p.dividendAmount !== undefined && <div className="num text-xs text-slate-500 dark:text-slate-400">{t('{shares} × {amount}', { amount: usd(p.dividendAmount), shares: qty(p.shares) })}</div>}
                </div>
              </div>
            ))}
          </div>
        ) : <Empty text={t('No ex-dividend dates until {date}', { date: siteDate(divsUntil) })} />}
      </Card>

      <Card id="near52" title={t('Near a 52-week high or low')} expand={n52.highs.length || n52.lows.length ? <RangeTable highs={n52.highs} lows={n52.lows} /> : undefined}>
        {n52.highs.length || n52.lows.length ? (
          <div className="flex flex-col gap-2 text-sm">
            {/* no High: and Low: words (owner 2026-11-24): the tickers near a high are green, near a low red */}
            {n52.highs.length > 0 && <Tickers symbols={n52.highs.map((p) => p.symbol)} tone="gain" title={t('Near its 52-week high')} />}
            {n52.lows.length > 0 && <Tickers symbols={n52.lows.map((p) => p.symbol)} tone="loss" title={t('Near its 52-week low')} />}
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
          {[{ key: 'Y', name: t('YTD / Y'), v: incY }, { key: 'Q', name: t('QTD / Q'), v: incQ }, { key: 'M', name: t('MTD / M'), v: incM }].map(({ key, name, v }) => (
            // received so far is a fact only the transactions history gives (owner 2026-11-24: the estimate from today's
            // shares overstated it): -- until it is read; the total is the plan at today's holdings
            <div key={key} className="flex-auto" data-income-period={key} title={v.received === null ? t('planned {total} at today\'s holdings; still to come {coming}', { total: usd(v.planned), coming: usd(v.coming) }) : t('received {received} of the planned {total}; still to come {coming}', { received: usd(v.received), total: usd(v.planned), coming: usd(v.coming) })}>
              <div className="text-xs text-slate-500 dark:text-slate-400">{name}</div>
              <div className="num whitespace-nowrap">{v.received === null
                ? <span className="text-xl font-semibold text-slate-400 sm:text-2xl" title={t('Needs the transactions history: update the script (the button in the navbar), then open Fidelity once')}>--</span>
                : <span className="text-xl font-semibold sm:text-2xl">{usd(v.received)}</span>} <span className="text-sm text-slate-500 dark:text-slate-400">/ {usd0(v.planned)}</span></div>
              {/* progress of the facts towards the plan */}
              <div className="mt-1 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800"><div className="h-1.5 rounded-full transition-[width] duration-300" style={{ width: `${v.received !== null && v.planned > 0 ? Math.min(100, (v.received / v.planned) * 100) : 0}%`, background: 'var(--brand)' }} /></div>
              {/* On average first, then the share of the balance (owner 2026-11-24); the year has no average, an empty line
                  keeps its share level with the others */}
              <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{key === 'Y' ? '\u00a0' : <>{t('On average')}: <span className="num">{usd(estAnnual / (key === 'Q' ? 4 : 12))}</span></>}</div>
              <div className="text-xs text-slate-500 dark:text-slate-400">{tot.balance > 0 ? t('{pct} of the balance', { pct: pct((v.planned / tot.balance) * 100) }) : ''}</div>
            </div>
          ))}
        </div>
        {/* with no fact in any period the reason and the next step show once under the tiles: the tooltip of -- is
            invisible on a touch screen */}
        {incY.received === null && incQ.received === null && incM.received === null && (
          <p className="text-xs text-slate-500 dark:text-slate-400" data-income-hint>{t('Needs the transactions history: update the script (the button in the navbar), then open Fidelity once')}</p>
        )}
      </Card>
    </div>
  );
});
