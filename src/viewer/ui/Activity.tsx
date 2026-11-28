/// <reference lib="esnext" />
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import type { Account, Dataset } from '../../shared/model';
import type { TxnStore } from '../../shared/transactions';
import type { TypedColumn } from '../../shared/typed-columns';
import { ACTIVITY_PAGE, ACTIVITY_PERIODS, inPeriod, nextPage, payLines, payTotals, type PayLine } from '../app/activity';
import { choicesOf } from '../../shared/choice-filter';
import { t } from '../app/i18n';
import { prefs, setPrefs } from '../app/prefs';
import { animate } from './animate';
import { Pills } from './Pills';
import { NoMatch, TypedHead, type HeadColumn } from './TypedHead';
import { ZOOM_HEAD } from './ZoomTable';
import { maskAccount, qty, siteDate, usd } from './format';
import { useFill } from './useFill';
import { PHONE_QUERY, useMedia } from './useMedia';
import { useStore } from './useStore';
import { useTypedTable } from './useTypedTable';

// The Activity page (owner 2026-11-28): for now the dividends and the interest of the shown accounts, ONE line a
// payment: what was paid and, beside it, what it bought by DRIP (shares, price, dollars) or that it bought nothing. The
// lines of today are bold, older ones plain. Sorted and filtered like every table; the totals follow the filters
type Row = PayLine & { accountName: string };
const accountText = (r: Row): string => `${r.accountName} ${maskAccount(r.account)}`.trim();
const kindText = (r: Row): string => (r.pending ? t('Pending dividend') : r.kind === 'interest' ? t('Interest') : t('Dividend'));
// Symbol first (owner 2026-11-28: "symbol I want to see first"; the default order is still by date, the newest first).
// Account and Type can be picked from a list by their names: the values are the ones the lines hold
const COLS = (rows: Row[]): (TypedColumn<Row> & HeadColumn)[] => [
  { key: 'symbol', label: t('Symbol'), text: (r) => `${r.symbol} ${r.name}`.trim() },
  { key: 'account', label: t('Account'), text: accountText, choices: choicesOf(rows, accountText) },
  { key: 'date', label: t('Date'), text: (r) => siteDate(r.date) },
  { key: 'kind', label: t('Type'), text: kindText, choices: choicesOf(rows, kindText) },
  { key: 'amount', label: t('Paid'), hint: t('The dividend or the interest paid into the account'), text: (r) => usd(r.amount), value: (r) => r.amount },
  { key: 'dripShares', label: t('DRIP shares'), hint: t('The shares the payment bought by DRIP that day; empty: it bought none, the payment was too small or DRIP is off'), text: (r) => (r.drip ? qty(r.drip.shares) : ''), value: (r) => r.drip?.shares },
  { key: 'dripPrice', label: t('DRIP price'), hint: t('The price of a share in the DRIP buy, as Fidelity gives it; empty for an older small buy whose price cannot be worked out'), text: (r) => (r.drip ? usd(r.drip.price) : ''), value: (r) => r.drip?.price },
  { key: 'dripUsd', label: t('Reinvested'), hint: t('The dollars of the payment that bought shares by DRIP'), text: (r) => (r.drip ? usd(r.drip.usd) : ''), value: (r) => r.drip?.usd },
];
const RIGHT = ['amount', 'dripShares', 'dripPrice', 'dripUsd'];
const CARD_PAD = 22; // the card's bottom padding and its borders: the rows end that far above the footer, the card at it

export const Activity = memo(function Activity({ ds, accounts, store, today }: { ds: Dataset; accounts: Account[]; store: TxnStore | null; today: string }) {
  const pr = useStore(prefs);
  const phone = useMedia(PHONE_QUERY);
  const box = useRef<HTMLDivElement>(null);
  const { fill } = useFill(box, undefined, 240, !!store);
  const names = useMemo(() => new Map(ds.accounts.map((a) => [a.number, a.name] as [string, string])), [ds.accounts]);
  const all = useMemo(() => payLines(store?.rows ?? [], new Set(accounts.map((a) => a.number))), [store, accounts]);
  const rows = useMemo(() => inPeriod(all, pr.activityPeriod, today).map((l): Row => ({ ...l, accountName: names.get(l.account) ?? '' })), [all, pr.activityPeriod, today, names]);
  const cols = useMemo(() => COLS(rows), [rows]);
  const table = useTypedTable(cols, rows);
  // drawn a part at a time, more when the end comes into view (app/activity.ts nextPage): the search, the order and the
  // totals always cover every line, only the drawing is cut. A new search or order starts from the first part again
  const [drawn, setDrawn] = useState(ACTIVITY_PAGE);
  const found = table.rows.length;
  const key = `${pr.activityPeriod}|${JSON.stringify(table.control.filters)}|${table.control.sort?.key ?? ''}|${table.control.sort?.dir ?? ''}`;
  useEffect(() => { setDrawn(ACTIVITY_PAGE); box.current?.scrollTo?.({ top: 0 }); }, [key]);
  const more = useRef<HTMLTableRowElement>(null);
  useEffect(() => {
    const el = more.current;
    if (!el || typeof IntersectionObserver === 'undefined') return undefined;
    const io = new IntersectionObserver((seen) => { if (seen.some((e) => e.isIntersecting)) setDrawn((n) => nextPage(n, found)); }, { rootMargin: '600px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [found, drawn < found]);
  const totals = useMemo(() => payTotals(table.rows), [table.rows]);
  const cell = (key: string) => `px-2 py-1.5 ${RIGHT.indexOf(key) >= 0 ? 'num text-right' : 'text-left'}`;
  return (
    <section className="card flex min-h-0 flex-col gap-3" data-activity>
      <div className="card-head flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 className="text-lg font-semibold" style={{ color: 'var(--brand)' }}>{t('Dividends and interest')}</h2>
        <span className="card-tools -my-1 ml-auto flex items-center gap-2">
          <Pills items={ACTIVITY_PERIODS} value={pr.activityPeriod} label={t('Activity of the last')} labelOf={(p) => (p === 'All' ? t('All') : p)} className="justify-end"
            onChange={(p) => animate(() => setPrefs({ activityPeriod: p }))} />
        </span>
      </div>
      {!store ? (
        <p className="text-sm text-slate-500 dark:text-slate-400" data-activity-empty>{t('Needs the transactions history: update the script (the button in the navbar), then open Fidelity once')}</p>
      ) : (
        <>
          {/* what the lines left by the filters add up to */}
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 text-sm" data-activity-totals>
            <span><span className="text-slate-500 dark:text-slate-400">{t('Paid')}</span> <span className="num font-semibold">{usd(totals.paid)}</span></span>
            <span><span className="text-slate-500 dark:text-slate-400">{t('Reinvested')}</span> <span className="num font-semibold">{usd(totals.reinvested)}</span></span>
            <span><span className="text-slate-500 dark:text-slate-400">{t('Left as cash')}</span> <span className="num font-semibold">{usd(totals.cash)}</span></span>
            <span className="text-xs text-slate-500 dark:text-slate-400">{t('{n} payments', { n: table.rows.length })}</span>
          </div>
          {/* the rows scroll in their own box that reaches the footer; on a phone the whole page scrolls instead */}
          <div ref={box} className="-mx-2 min-h-0 overflow-auto" style={{ maxHeight: phone || fill === null ? undefined : fill - CARD_PAD }}>
            <table className="w-full text-sm" data-activity-table>
              <TypedHead cols={cols} control={table.control} className={`${ZOOM_HEAD} sticky top-0 z-[1]`} th="px-2 pt-2 pb-1 align-bottom font-medium" filterTh="min-w-[6.5rem] px-2 pb-2 font-normal" />
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {table.rows.slice(0, drawn).map((r) => (
                  // new ones stand out, as on Fidelity (owner 2026-11-28): paid today in bold; announced and not paid yet in
                  // bold on a tinted line, so they are seen at once ("not very pronounced" in bold alone)
                  <tr key={r.id} className={r.pending ? 'bg-amber-50 font-semibold dark:bg-amber-400/10' : r.date === today ? 'font-semibold' : ''} data-today={r.date === today ? 'yes' : undefined} data-pending={r.pending ? 'yes' : undefined}>
                    {/* a phone shows the ticker alone: the long name made every row four lines tall there */}
                    <td className={`${cell('symbol')} max-sm:whitespace-nowrap`}><span>{r.symbol}</span> <span className="text-xs font-normal text-slate-500 dark:text-slate-400 max-sm:hidden">{r.name}</span></td>
                    <td className={`${cell('account')} whitespace-nowrap`}>{r.accountName} <span className="text-xs font-normal text-slate-500 dark:text-slate-400" title={r.account}>{maskAccount(r.account)}</span></td>
                    <td className={`${cell('date')} whitespace-nowrap`}>{siteDate(r.date)}</td>
                    <td className={cell('kind')}>{kindText(r)}</td>
                    <td className={`${cell('amount')} text-[var(--gain)]`}>{r.amount === undefined ? '' : `+${usd(r.amount)}`}</td>
                    {r.drip ? (
                      <>
                        <td className={cell('dripShares')}>+{qty(r.drip.shares)}</td>
                        <td className={cell('dripPrice')}>{usd(r.drip.price)}</td>
                        <td className={cell('dripUsd')}>{usd(r.drip.usd)}</td>
                      </>
                    ) : (
                      // no DRIP: said once across the three cells, quietly
                      <td colSpan={3} className="px-2 py-1.5 text-right text-xs font-normal text-slate-500 dark:text-slate-400" data-no-drip>{r.pending ? t('pending: not paid yet') : t('no DRIP: left as cash')}</td>
                    )}
                  </tr>
                ))}
                {/* the end of what is drawn: coming into view it asks for the next part */}
                {drawn < found && <tr ref={more} data-more><td colSpan={cols.length} className="px-2 py-2 text-center text-xs text-slate-500 dark:text-slate-400">{t('{n} of {total} shown, more as you scroll', { n: drawn, total: found })}</td></tr>}
                {table.rows.length === 0 && <tr><NoMatch span={cols.length} /></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
});
