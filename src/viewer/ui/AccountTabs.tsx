import { useEffect, useRef } from 'react';
import type { Account, Dataset } from '../../shared/model';
import { accountsIn, groupsOf, scopeOf, toggleAccount, totalsOf } from '../app/derive';
import { t } from '../app/i18n';
import type { Scope } from '../app/prefs';
import { signedPct, tone, usd } from './format';

// The accounts bar (owner 2026-11-23): one line per chip, so the bar stays low; a group (All accounts, Investment,
// Retirement) is a dark, bold chip and an account a light one, so a section never looks like an account. A click on a
// chip shows only it; its checkbox adds or removes it, so any set of accounts can be shown (Elena + Elena ROTH IRA)
function Check({ checked, mixed, label, onChange }: { checked: boolean; mixed?: boolean; label: string; onChange: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = !!mixed && !checked; }, [mixed, checked]);
  return (
    <input ref={ref} type="checkbox" className="size-3.5 flex-none cursor-pointer accent-[var(--brand)]" checked={checked} aria-label={label}
      onClick={(e) => e.stopPropagation()} onChange={onChange} />
  );
}

export function AccountTabs({ ds, scope, onScope }: { ds: Dataset; scope: Scope; onScope: (s: Scope) => void }) {
  const shown = new Set(accountsIn(ds, scope).map((a) => a.number));
  const all = totalsOf(ds.accounts);
  const chip = (kind: 'all' | 'group' | 'account', active: boolean) =>
    `flex h-8 flex-none cursor-pointer items-center gap-2 whitespace-nowrap rounded-lg px-2.5 text-sm transition-colors ${
      kind === 'account'
        ? 'border border-slate-200 bg-white font-normal text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'
        : 'bg-slate-200 font-semibold text-slate-900 hover:bg-slate-300 dark:bg-slate-700 dark:text-white dark:hover:bg-slate-600'
    } ${active ? 'ring-2 ring-[var(--brand)]' : ''}`;
  const money = (value: number | undefined, gl: number | undefined, pctv: number | null | undefined) => (
    <>
      <span className="num">{usd(value)}</span>
      {gl !== undefined && <span className={`num text-xs ${tone(gl)}`}>{signedPct(pctv ?? null)}</span>}
    </>
  );
  const accountChip = (a: Account) => (
    <div key={a.number} role="button" tabIndex={0} className={chip('account', scope === `account:${a.number}`)} title={`${a.name} ${a.number}`}
      onClick={() => onScope(`account:${a.number}`)} onKeyDown={(e) => { if (e.key === 'Enter') onScope(`account:${a.number}`); }} data-scope={`account:${a.number}`}>
      <Check checked={shown.has(a.number)} label={t('Show {name}', { name: a.name })} onChange={() => onScope(toggleAccount(ds, scope, a.number))} />
      <span>{a.name}</span>
      <span className="text-xs text-slate-400">···{a.number.slice(-4)}</span>
      {money(a.balance, a.todayGl, a.todayGlPct)}
    </div>
  );
  return (
    <nav className="flex items-center gap-1.5 overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 p-1.5 [scrollbar-width:thin] dark:border-slate-700 dark:bg-slate-950" aria-label={t('Accounts')}>
      <div role="button" tabIndex={0} className={chip('all', scope === 'all')} onClick={() => onScope('all')} onKeyDown={(e) => { if (e.key === 'Enter') onScope('all'); }} data-scope="all">
        <span>{t('All accounts')}</span>
        {money(all.balance, all.todayGl, all.todayGlPct)}
      </div>
      {groupsOf(ds).map((g) => {
        const gt = totalsOf(g.accounts);
        const inGroup = g.accounts.filter((a) => shown.has(a.number)).length;
        const toggleGroup = () => {
          const others = Array.from(shown).filter((n) => !g.accounts.some((a) => a.number === n));
          onScope(scopeOf(ds, inGroup === g.accounts.length ? others : others.concat(g.accounts.map((a) => a.number))));
        };
        return (
          <div key={g.name} className="flex flex-none items-center gap-1.5 border-l border-slate-200 pl-1.5 dark:border-slate-700">
            <div role="button" tabIndex={0} className={chip('group', scope === `group:${g.name}`)} onClick={() => onScope(`group:${g.name}`)}
              onKeyDown={(e) => { if (e.key === 'Enter') onScope(`group:${g.name}`); }} data-scope={`group:${g.name}`}>
              <Check checked={inGroup === g.accounts.length} mixed={inGroup > 0} label={t('Show {name}', { name: g.name })} onChange={toggleGroup} />
              <span>{g.name}</span>
              {money(gt.balance, gt.todayGl, gt.todayGlPct)}
            </div>
            {g.accounts.map(accountChip)}
          </div>
        );
      })}
    </nav>
  );
}
