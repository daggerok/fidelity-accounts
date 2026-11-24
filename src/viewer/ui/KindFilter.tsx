import { t } from '../app/i18n';
import { kindOn, toggleKind, type Kind } from '../app/derive';
import { PILL_GAP, pillClass, pillStyle } from './Pills';

// ETFs and Stocks for any card (owner 2026-11-24: movers, income, ex-dividend dates; no All; the pills of the Accounts
// order): each pill switches on and off on its own, both on or both off shows every security
export function KindFilter({ value, label, onChange }: { value: Kind; label: string; onChange: (k: Kind) => void }) {
  const pill = (k: 'etf' | 'stock', text: string) => (
    <button type="button" aria-pressed={kindOn(value, k)} className={pillClass(kindOn(value, k))} style={pillStyle(kindOn(value, k))} onClick={() => onChange(toggleKind(value, k))}>{text}</button>
  );
  return (
    <div role="group" aria-label={label} data-kind-filter={value} className={`flex flex-none items-center ${PILL_GAP}`} title={t('Both on or both off: every security')}>
      {pill('etf', t('ETFs'))}
      {pill('stock', t('Stocks'))}
    </div>
  );
}
