import type { Dataset } from '../../shared/model';
import { groupsOf, totalsOf } from '../app/derive';
import { t } from '../app/i18n';
import type { Scope } from '../app/prefs';
import { signedPct, signedUsd, tone, usd } from './format';

// The second bar: every account as a horizontal tab (Fidelity keeps them in a column on the left), with All accounts
// and each group (Investment, Retirement) as tabs of their own. The choice is remembered (prefs.scope)
export function AccountTabs({ ds, scope, onScope }: { ds: Dataset; scope: Scope; onScope: (s: Scope) => void }) {
  const all = totalsOf(ds.accounts);
  const Tab = ({ id, title, sub, value, gl, glPct, strong }: { id: Scope; title: string; sub?: string; value: number | undefined; gl?: number; glPct?: number | null; strong?: boolean }) => (
    <button type="button" className={`acct-tab ${scope === id ? 'on' : ''}`} onClick={() => onScope(id)} aria-pressed={scope === id} data-scope={id}>
      <span className={`flex w-full items-baseline justify-between gap-3 text-sm ${strong ? 'font-semibold' : 'font-medium'}`}>
        <span className="truncate">{title}</span>
        <span className="num">{usd(value)}</span>
      </span>
      <span className="flex w-full items-baseline justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
        <span>{sub ?? ''}</span>
        {gl !== undefined && <span className={`num ${tone(gl)}`}>{signedUsd(gl)} ({signedPct(glPct)})</span>}
      </span>
    </button>
  );
  return (
    <nav className="flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 p-1.5 [scrollbar-width:thin] dark:border-slate-700 dark:bg-slate-900" aria-label={t('Accounts')}>
      <Tab id="all" title={t('All accounts')} value={all.balance} gl={all.todayGl} glPct={all.todayGlPct} strong />
      {groupsOf(ds).map((g) => {
        const gt = totalsOf(g.accounts);
        return (
          <div key={g.name} className="flex gap-1 border-l border-slate-200 pl-1 dark:border-slate-700">
            <Tab id={`group:${g.name}`} title={g.name} sub={t('{n} accounts', { n: g.accounts.length })} value={gt.balance} gl={gt.todayGl} glPct={gt.todayGlPct} strong />
            {g.accounts.map((a) => (
              <Tab key={a.number} id={`account:${a.number}`} title={a.name} sub={a.number} value={a.balance} gl={a.todayGl} glPct={a.todayGlPct} />
            ))}
          </div>
        );
      })}
    </nav>
  );
}
