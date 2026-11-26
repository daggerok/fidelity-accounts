/// <reference lib="esnext" />
import { useRef, useState } from 'react';
import type { BetaBreakdown, BetaRow } from '../../shared/beta';
import type { TypedColumn } from '../../shared/typed-columns';
import { t } from '../app/i18n';
import { BetaCoverage, BetaValue, betaNumber, etf3yHint, sourceText } from './Beta';
import type { HeadColumn } from './TypedHead';
import { Zoom } from './Zoom';
import { ZoomTable } from './ZoomTable';
import { DASH, pct, siteDate, usd } from './format';

// Where an account's beta comes from (owner 2026-11-26: "check if we did good because I have a feeling that my beta
// numbers are not so low", then "yes, do all three"): every position of the account with its value, its share, its beta
// and source and what it adds to the account's beta, so the Contribution column sums to the number on the card. The
// rules are shared/beta.ts betaBreakdown, the same numbers mixBeta gives; this only draws them

const fixed = (n: number | null | undefined, digits: number): string => (typeof n === 'number' ? n.toFixed(digits) : DASH);
// the day the beta was read (an ISO time; cash has none)
const asOfDay = (r: BetaRow): string => (r.beta?.asOf ? siteDate(r.beta.asOf.slice(0, 10)) : DASH);

const COLS = (): (TypedColumn<BetaRow> & HeadColumn)[] => [
  { key: 'symbol', label: t('Symbol'), text: (r) => r.symbol },
  { key: 'name', label: t('Name'), text: (r) => r.description },
  { key: 'value', label: t('Value'), text: (r) => usd(r.value), value: (r) => r.value },
  { key: 'weight', label: t('Weight'), hint: t('Its share of the account\'s value'), text: (r) => (r.weight === null ? DASH : pct(r.weight * 100)), value: (r) => (r.weight === null ? null : r.weight * 100) },
  { key: 'beta', label: t('Beta'), text: (r) => fixed(r.beta?.beta, 2), value: (r) => r.beta?.beta },
  { key: 'source', label: t('Source'), hint: t('Stocks: Fidelity\'s stock screener; the rest computed by us from Fidelity\'s prices against SPY; ETFs 3Y: Morningstar, only when the history is too short'), text: (r) => (r.beta ? sourceText(r.beta) : DASH) },
  { key: 'contribution', label: t('Contribution'), hint: t('What the position adds to the account\'s beta: its value × its beta ÷ the value with a beta; the column sums to the beta'), text: (r) => fixed(r.contribution, 3), value: (r) => r.contribution },
  { key: 'asOf', label: t('As of'), text: asOfDay },
];

/** the table of the window: totals in words on top, then one row per position (those without a beta last) */
export function BetaBreakdownTable({ breakdown }: { breakdown: BetaBreakdown }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-slate-500 dark:text-slate-400" data-beta-totals>
        {t('Beta {beta}, covers {pct} of the value; positions without a beta: {n}', { beta: betaNumber(breakdown.beta), pct: pct(breakdown.coverage * 100), n: breakdown.missing })}
      </p>
      <ZoomTable cols={COLS()} rows={breakdown.rows} name="beta-breakdown" className="w-full whitespace-nowrap text-sm" row={(r) => (
        <tr key={`${r.symbol}|${r.value}`} className="border-t border-slate-100 dark:border-slate-800 [&>td]:px-2 [&>td]:py-1.5" data-beta-row={r.beta ? r.beta.source : 'none'}>
          <td className="font-semibold">{r.symbol}</td>
          <td className="max-w-[18rem] truncate text-xs text-slate-500 dark:text-slate-400" title={r.description}>{r.description}</td>
          <td className="num text-right">{usd(r.value)}</td>
          <td className="num text-right">{r.weight === null ? DASH : pct(r.weight * 100)}</td>
          <td className="num text-right">{fixed(r.beta?.beta, 2)}</td>
          <td>{r.beta?.source === 'etf3y'
            ? <span className="cursor-help underline decoration-dotted underline-offset-2" title={etf3yHint()}>{sourceText(r.beta)}</span>
            : r.beta ? sourceText(r.beta) : DASH}</td>
          <td className="num text-right">{fixed(r.contribution, 3)}</td>
          <td className="num">{asOfDay(r)}</td>
        </tr>
      )} />
    </div>
  );
}

/**
 * An account's beta on the Accounts card: the number is a button that opens the breakdown in a ⤢ window grown out of
 * it (the focus comes back to it on close, Zoom), the covered share on the line under it
 */
export function AccountBeta({ name, breakdown }: { name: string; breakdown: BetaBreakdown }) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  return (
    <>
      <div>
        <button ref={button} type="button" aria-haspopup="dialog" className="hit rounded transition-colors hover:text-[var(--brand)]" onClick={() => setOpen(true)} data-beta-button>
          <BetaValue mix={breakdown} more={t('Click for the positions behind it')} />
        </button>
      </div>
      <BetaCoverage mix={breakdown} />
      <Zoom open={open} title={t('{account}, beta {beta}', { account: name, beta: betaNumber(breakdown.beta) })} origin={button} onClose={() => setOpen(false)}>
        <BetaBreakdownTable breakdown={breakdown} />
      </Zoom>
    </>
  );
}
