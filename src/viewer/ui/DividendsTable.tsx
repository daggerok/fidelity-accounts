/// <reference lib="esnext" />
import { useMemo } from 'react';
import type { Account, Position } from '../../shared/model';
import type { TypedColumn } from '../../shared/typed-columns';
import { payoutParts, payoutTotal, securitiesBySymbol, symbolDrip, dripToBuy, type Drip, type PayoutPart, type Upcoming } from '../app/derive';
import { t } from '../app/i18n';
import { DRIP_HINT, DRIP_USD_HINT, DripValue } from './Drip';
import type { HeadColumn } from './TypedHead';
import { ZOOM_HEAD, ZoomTable } from './ZoomTable';
import { maskAccount, qty, signedQty, signedUsd, siteDate, usd } from './format';

// the big ex-dividend table (owner 2026-11-24: every value on one line, wide, easy to read): the total on top, one row
// per symbol, and when it sits in several accounts one line per account under it, named, in the Accounts card order;
// To you is the last column, on the right (owner 2026-11-24)
// The total follows the filters: it sums the rows left
interface DivRow { u: Upcoming; parts: PayoutPart[]; drip: Drip | null; one: Account | null }
const DIV_COLS = (): (TypedColumn<DivRow> & HeadColumn)[] => [
  { key: 'symbol', label: t('Symbol'), text: (r) => `${r.u.symbol} ${r.u.description}` },
  // every account that holds it, so an account's name finds its symbols
  { key: 'account', label: t('Account'), text: (r) => r.parts.map((p) => p.account.name).join(' ') },
  { key: 'exDate', label: t('Ex-date'), text: (r) => siteDate(r.u.exDate) },
  { key: 'payDate', label: t('Pay date'), text: (r) => siteDate(r.u.payDate) },
  { key: 'perShare', label: t('Per share'), text: (r) => usd(r.u.dividendAmount), value: (r) => r.u.dividendAmount },
  { key: 'shares', label: t('Shares'), text: (r) => qty(r.u.shares), value: (r) => r.u.shares },
  { key: 'drip', label: 'DRIP', hint: DRIP_HINT(), text: (r) => signedQty(r.drip?.shares), value: (r) => r.drip?.shares },
  { key: 'dripUsd', label: 'DRIP $', hint: DRIP_USD_HINT(), text: (r) => signedUsd(r.drip?.usd), value: (r) => r.drip?.usd },
  { key: 'frequency', label: t('Frequency'), text: (r) => r.u.paymentFrequency ?? '' },
  { key: 'payout', label: t('To you'), text: (r) => usd(r.u.payout), value: (r) => r.u.payout },
];

export function DividendsTable({ rows, ps, accounts }: { rows: Upcoming[]; ps: Position[]; accounts: Account[] }) {
  // the rows are split by account once per list, not on every filter keystroke, over one symbol map (500 rows times
  // every account filtered all the securities again, ~30 ms a keystroke)
  const bySymbol = useMemo(() => securitiesBySymbol(ps), [ps]);
  const all = useMemo(() => rows.map((u): DivRow => { const parts = payoutParts(bySymbol, accounts, u); return { u, parts, drip: symbolDrip(parts), one: parts.length === 1 ? parts[0]!.account : null }; }), [rows, bySymbol, accounts]);
  // its cells are padded wider than the other ⤢ tables (px-3), the head too, and the head stays on top while it scrolls
  return (
    <ZoomTable cols={DIV_COLS()} rows={all} name="dividends-table" className="w-full whitespace-nowrap text-sm [&_td]:px-3 [&_td]:py-1.5"
      head={`sticky top-0 z-10 ${ZOOM_HEAD}`} th="px-3 pt-2 pb-1 align-bottom font-medium" filterTh="min-w-[6.5rem] px-3 pb-2 font-normal"
      body={(shown, noMatch) => {
        const toBuy = dripToBuy(shown.map((r) => r.drip));
        return (
          <>
            <tbody>
              <tr className="border-t border-slate-200 font-semibold dark:border-slate-700"><td colSpan={6}>{t('Total')} <span className="text-xs font-normal text-slate-500 dark:text-slate-400">{t('{n} payouts', { n: shown.length })}</span></td><td /><td className="num text-right" title={t('to buy so every listed dividend reinvests')}>{toBuy ? <DripValue value={toBuy} as="usd" /> : ''}</td><td /><td className="num text-right">{usd(payoutTotal(shown.map((r) => r.u)))}</td></tr>
              {noMatch}
            </tbody>
            {shown.map(({ u: r, parts, drip, one }) => (
              <tbody key={r.symbol} className="border-t border-slate-100 dark:border-slate-800">
                <tr>
                  <td><span className="font-semibold">{r.symbol}</span> <span className="inline-block max-w-[22rem] truncate align-bottom text-xs text-slate-500 dark:text-slate-400" title={r.description}>{r.description}</span></td>
                  <td className="text-slate-600 dark:text-slate-300">{one ? one.name : t('{n} accounts', { n: parts.length })}</td>
                  <td className="num">{siteDate(r.exDate)}</td>
                  <td className="num">{siteDate(r.payDate)}</td>
                  <td className="num text-right">{usd(r.dividendAmount)}</td>
                  <td className="num text-right">{qty(r.shares)}</td>
                  <td className="num text-right">{drip ? <DripValue value={drip.shares} as="shares" /> : '--'}</td>
                  <td className="num text-right">{drip ? <DripValue value={drip.usd} as="usd" /> : '--'}</td>
                  <td className="text-right">{r.paymentFrequency ?? ''}</td>
                  <td className="num text-right font-medium">{usd(r.payout)}</td>
                </tr>
                {!one && parts.map((p) => (
                  <tr key={p.account.number} className="text-xs text-slate-500 dark:text-slate-400">
                    <td />
                    <td className="pl-6">{p.account.name} <span title={p.account.number}>{maskAccount(p.account.number)}</span></td>
                    <td colSpan={3} />
                    <td className="num text-right">{qty(p.shares)}</td>
                    <td className="num text-right">{p.drip ? <DripValue value={p.drip.shares} as="shares" /> : ''}</td>
                    <td className="num text-right">{p.drip ? <DripValue value={p.drip.usd} as="usd" /> : ''}</td>
                    <td />
                    <td className="num text-right">{usd(p.payout)}</td>
                  </tr>
                ))}
              </tbody>
            ))}
          </>
        );
      }} />
  );
}
