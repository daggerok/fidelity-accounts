import { t } from '../app/i18n';
import { kindOn, toggleKind, type Kind } from '../app/derive';

// All | ETFs | Stocks for any card (owner 2026-11-24: movers, income, ex-dividend dates). ETFs and Stocks switch on and
// off on their own: both on or both off is all, one off leaves the other; All turns both on. The chips light up as
// they are on, so with all shown every chip is lit
export function KindFilter({ value, label, onChange }: { value: Kind; label: string; onChange: (k: Kind) => void }) {
  const chip = (on: boolean) => `h-full cursor-pointer whitespace-nowrap rounded-md px-2.5 text-sm transition-colors duration-200 ${on ? 'bg-white font-semibold text-slate-900 shadow-sm dark:bg-slate-600 dark:text-white' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`;
  return (
    <div role="group" aria-label={label} data-kind-filter={value} className="inline-flex h-9 flex-none items-center gap-0.5 rounded-lg bg-slate-100 p-0.5 dark:bg-slate-800">
      <button type="button" aria-pressed={value === 'all'} title={t('Every security')} className={chip(value === 'all')} onClick={() => onChange('all')}>{t('All')}</button>
      <button type="button" aria-pressed={kindOn(value, 'etf')} title={t('ETFs on or off')} className={chip(kindOn(value, 'etf'))} onClick={() => onChange(toggleKind(value, 'etf'))}>{t('ETFs')}</button>
      <button type="button" aria-pressed={kindOn(value, 'stock')} title={t('Stocks on or off')} className={chip(kindOn(value, 'stock'))} onClick={() => onChange(toggleKind(value, 'stock'))}>{t('Stocks')}</button>
    </div>
  );
}
