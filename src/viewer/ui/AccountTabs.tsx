import { useEffect, useRef, useState } from 'react';
import type { Account, Dataset } from '../../shared/model';
import { accountsIn, groupsOf, scopeOf, toggleAccount, totalsOf } from '../app/derive';
import { t } from '../app/i18n';
import type { Scope } from '../app/prefs';
import { signedPct, tone, usd } from './format';

// The accounts bar (owner 2026-11-23): one line per chip, so the bar stays low. Accounts are the solid, bold chips and
// the groups (All accounts, Investment, Retirement) light outlined ones (owner 2026-11-24: accounts look more permanent
// than groups), so a section never looks like an account. A click on a
// chip shows only it; its checkbox adds or removes it, so any set of accounts can be shown (Elena + Elena ROTH IRA)
function Check({ checked, mixed, label, onChange }: { checked: boolean; mixed?: boolean; label: string; onChange: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = !!mixed && !checked; }, [mixed, checked]);
  return (
    <input ref={ref} type="checkbox" className="size-3.5 flex-none cursor-pointer accent-[var(--brand)]" checked={checked} aria-label={label}
      onClick={(e) => e.stopPropagation()} onChange={onChange} />
  );
}

export function AccountTabs({ ds, scope, onScope, onMove, onMoveGroup }: { ds: Dataset; scope: Scope; onScope: (s: Scope) => void; onMove: (moved: string, target: string) => void; onMoveGroup: (moved: string, target: string) => void }) {
  // drag an account chip onto another account of its group to put it there (owner 2026-11-24: my own order)
  const [dragged, setDragged] = useState<{ number: string; group: string } | null>(null);
  // a group chip is dragged as a whole (with its accounts) onto another group; All accounts stays first
  const [draggedGroup, setDraggedGroup] = useState<string | null>(null);
  const [overGroup, setOverGroup] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const shown = new Set(accountsIn(ds, scope).map((a) => a.number));
  const all = totalsOf(ds.accounts);
  const chip = (kind: 'all' | 'group' | 'account', active: boolean) =>
    `flex h-8 flex-none cursor-pointer items-center gap-2 whitespace-nowrap rounded-lg px-2.5 text-sm transition-colors ${
      kind === 'account'
        ? 'bg-slate-200 font-semibold text-slate-900 hover:bg-slate-300 dark:bg-slate-700 dark:text-white dark:hover:bg-slate-600'
        : 'border border-slate-200 bg-white font-normal text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'
    } ${active ? 'ring-2 ring-[var(--brand)]' : ''}`;
  const money = (value: number | undefined, gl: number | undefined, pctv: number | null | undefined) => (
    <>
      <span className="num">{usd(value)}</span>
      {gl !== undefined && <span className={`num text-xs ${tone(gl)}`}>{signedPct(pctv ?? null)}</span>}
    </>
  );
  const accountChip = (a: Account) => (
    <div key={a.number} role="button" tabIndex={0} className={`${chip('account', scope === `account:${a.number}`)} ${over === a.number ? 'outline-2 outline-dashed outline-[var(--brand)]' : ''} ${dragged?.number === a.number ? 'opacity-50' : ''}`}
      title={t('{name} {number}: drag to move', { name: a.name, number: a.number })} style={{ viewTransitionName: `chip-${a.number}` } as React.CSSProperties}
      draggable onDragStart={(e) => { setDragged({ number: a.number, group: a.group }); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', a.number); }}
      onDragEnd={() => { setDragged(null); setOver(null); }}
      onDragOver={(e) => { if (dragged && dragged.group === a.group && dragged.number !== a.number) { e.preventDefault(); setOver(a.number); } }}
      onDragLeave={() => setOver((o) => (o === a.number ? null : o))}
      onDrop={(e) => { e.preventDefault(); if (dragged && dragged.group === a.group && dragged.number !== a.number) onMove(dragged.number, a.number); setDragged(null); setOver(null); }}
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
        {/* like the groups (owner 2026-11-24): ticked = every account, partly = some; a click ticks all or clears all */}
        <Check checked={shown.size === ds.accounts.length} mixed={shown.size > 0} label={t('Show {name}', { name: t('All accounts') })}
          onChange={() => onScope(shown.size === ds.accounts.length ? 'none' : 'all')} />
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
          <div key={g.name} className={`flex flex-none items-center gap-1.5 border-l border-slate-200 pl-1.5 dark:border-slate-700 ${overGroup === g.name ? 'rounded-lg outline-2 outline-dashed outline-[var(--brand)]' : ''} ${draggedGroup === g.name ? 'opacity-50' : ''}`}
            style={{ viewTransitionName: `group-${g.name.replace(/\W/g, '')}` } as React.CSSProperties}
            onDragOver={(e) => { if (draggedGroup && draggedGroup !== g.name) { e.preventDefault(); setOverGroup(g.name); } }}
            onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOverGroup((o) => (o === g.name ? null : o)); }}
            onDrop={(e) => { if (draggedGroup && draggedGroup !== g.name) { e.preventDefault(); onMoveGroup(draggedGroup, g.name); } setDraggedGroup(null); setOverGroup(null); }}>
            <div role="button" tabIndex={0} className={chip('group', scope === `group:${g.name}`)} onClick={() => onScope(`group:${g.name}`)}
              title={t('{name}: drag to move the group', { name: g.name })} draggable
              onDragStart={(e) => { e.stopPropagation(); setDraggedGroup(g.name); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', g.name); }}
              onDragEnd={() => { setDraggedGroup(null); setOverGroup(null); }}
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
