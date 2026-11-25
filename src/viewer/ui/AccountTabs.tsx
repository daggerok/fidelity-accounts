import { useState } from 'react';
import type { Account, Dataset } from '../../shared/model';
import { ALL_FOLD, accountsIn, groupsOf, scopeOf, toggleAccount } from '../app/derive';
import { t } from '../app/i18n';
import type { Scope } from '../app/prefs';
import { Check } from './Check';
import { EdgeScrollRow } from './EdgeScrollRow';

// The accounts strip (owner 2026-11-23): one line per chip. No view-transition names here (owner 2026-11-24 glitch): a
// named chip leaves the strip's clip during a card transition and flashes past its right edge. It lives in the navbar between the logo and the buttons and
// scrolls sideways with fading edges and ‹ › (owner 2026-11-24: like the gex Expirations panel). Accounts are the solid, bold chips and
// the groups (All accounts, Investment, Retirement) light outlined ones (owner 2026-11-24: accounts look more permanent
// than groups), so a section never looks like an account. A click on All accounts or a group folds or unfolds it (All
// accounts unfolds every group); a click on an account shows only it. Checkboxes alone choose: All accounts ticks or
// clears every account, a group its accounts, an account itself, so any set can be shown (Elena + Elena ROTH IRA).
// Names only, no balances, changes or account numbers (owner 2026-11-24: the Balance card shows the numbers; the
// number stays in the chip's tooltip)

export function AccountTabs({ ds, scope, collapsed, className, onScope, onFold, onMove, onMoveGroup }: { ds: Dataset; scope: Scope; collapsed: string[]; className?: string; onScope: (s: Scope) => void; onFold: (name: string) => void; onMove: (moved: string, target: string) => void; onMoveGroup: (moved: string, target: string) => void }) {
  // drag an account chip onto another account of its group to put it there (owner 2026-11-24: my own order)
  const [dragged, setDragged] = useState<{ number: string; group: string } | null>(null);
  // a group chip is dragged as a whole (with its accounts) onto another group; All accounts stays first
  const [draggedGroup, setDraggedGroup] = useState<string | null>(null);
  const [overGroup, setOverGroup] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const shown = new Set(accountsIn(ds, scope).map((a) => a.number));
  const chip = (kind: 'all' | 'group' | 'account', active: boolean) =>
    `flex h-8 flex-none cursor-pointer items-center gap-2 whitespace-nowrap rounded-lg px-2.5 text-sm transition-colors ${
      kind === 'account'
        ? 'bg-slate-200 font-semibold text-slate-900 hover:bg-slate-300 dark:bg-slate-700 dark:text-white dark:hover:bg-slate-600'
        : 'border border-slate-200 bg-white font-normal text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'
    } ${active ? 'ring-2 ring-[var(--brand)]' : ''}`;
  const allFolded = collapsed.includes(ALL_FOLD);
  const chev = (open: boolean) => <span className={`inline-block text-[0.6rem] text-slate-400 transition-transform ${open ? 'rotate-90' : ''}`} aria-hidden>▶</span>;
  const accountChip = (a: Account) => (
    <div key={a.number} role="button" tabIndex={0} className={`${chip('account', scope === `account:${a.number}`)} ${over === a.number ? 'outline-2 outline-dashed outline-[var(--brand)]' : ''} ${dragged?.number === a.number ? 'opacity-50' : ''}`}
      title={t('{name} {number}: drag to move', { name: a.name, number: a.number })}
      draggable onDragStart={(e) => { setDragged({ number: a.number, group: a.group }); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', a.number); }}
      onDragEnd={() => { setDragged(null); setOver(null); }}
      onDragOver={(e) => { if (dragged && dragged.group === a.group && dragged.number !== a.number) { e.preventDefault(); setOver(a.number); } }}
      onDragLeave={() => setOver((o) => (o === a.number ? null : o))}
      onDrop={(e) => { e.preventDefault(); if (dragged && dragged.group === a.group && dragged.number !== a.number) onMove(dragged.number, a.number); setDragged(null); setOver(null); }}
      onClick={() => onScope(`account:${a.number}`)} onKeyDown={(e) => { if (e.key === 'Enter') onScope(`account:${a.number}`); }} data-scope={`account:${a.number}`}>
      <Check checked={shown.has(a.number)} label={t('Show {name}', { name: a.name })} onChange={() => onScope(toggleAccount(ds, scope, a.number))} />
      <span>{a.name}</span>
    </div>
  );
  return (
    // All accounts stays on the very left, the groups and accounts after it scroll (owner 2026-11-24); the strip is as
    // wide as its chips and sits in the middle between the logo and the buttons when they all fit (owner 2026-11-24)
    <div className={`flex min-w-0 items-center justify-center ${className ?? ''}`} data-accounts-bar>
      <div role="button" tabIndex={0} aria-expanded={!allFolded} className={chip('all', scope === 'all')} title={t('Click to fold or unfold all groups')}
        onClick={() => onFold(ALL_FOLD)} onKeyDown={(e) => { if (e.key === 'Enter') onFold(ALL_FOLD); }} data-scope="all">
        {chev(!allFolded)}
        {/* like the groups (owner 2026-11-24): ticked = every account, partly = some; a click ticks all or clears all */}
        <Check checked={shown.size === ds.accounts.length} mixed={shown.size > 0} label={t('Show {name}', { name: t('All accounts') })}
          onChange={() => onScope(shown.size === ds.accounts.length ? 'none' : 'all')} />
        <span>{t('All accounts')}</span>
      </div>
      <div className={`hslide min-w-0 ${allFolded ? '' : 'open'}`} inert={allFolded}><div>
      <EdgeScrollRow label={t('Accounts')} items="[data-scope]" storeKey="fidelity-accounts.strip-scroll" prevLabel={t('Previous accounts')} nextLabel={t('Next accounts')} className="flex-auto">
      {groupsOf(ds).map((g) => {
        const open = !collapsed.includes(g.name);
        const inGroup = g.accounts.filter((a) => shown.has(a.number)).length;
        const toggleGroup = () => {
          const others = Array.from(shown).filter((n) => !g.accounts.some((a) => a.number === n));
          onScope(scopeOf(ds, inGroup === g.accounts.length ? others : others.concat(g.accounts.map((a) => a.number))));
        };
        return (
          <div key={g.name} className={`flex flex-none items-center border-l border-slate-200 pl-1.5 dark:border-slate-700 ${overGroup === g.name ? 'rounded-lg outline-2 outline-dashed outline-[var(--brand)]' : ''} ${draggedGroup === g.name ? 'opacity-50' : ''}`}
            onDragOver={(e) => { if (draggedGroup && draggedGroup !== g.name) { e.preventDefault(); setOverGroup(g.name); } }}
            onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOverGroup((o) => (o === g.name ? null : o)); }}
            onDrop={(e) => { if (draggedGroup && draggedGroup !== g.name) { e.preventDefault(); onMoveGroup(draggedGroup, g.name); } setDraggedGroup(null); setOverGroup(null); }}>
            <div role="button" tabIndex={0} aria-expanded={open} className={chip('group', scope === `group:${g.name}`)} onClick={() => onFold(g.name)}
              title={t('{name}: click to fold or unfold, drag to move the group', { name: g.name })} draggable
              onDragStart={(e) => { e.stopPropagation(); setDraggedGroup(g.name); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', g.name); }}
              onDragEnd={() => { setDraggedGroup(null); setOverGroup(null); }}
              onKeyDown={(e) => { if (e.key === 'Enter') onFold(g.name); }} data-scope={`group:${g.name}`}>
              {chev(open)}
              <Check checked={inGroup === g.accounts.length} mixed={inGroup > 0} label={t('Show {name}', { name: g.name })} onChange={toggleGroup} />
              <span>{g.name}</span>
            </div>
            <div className={`hslide ${open ? 'open' : ''}`} inert={!open}><div>{g.accounts.map(accountChip)}</div></div>
          </div>
        );
      })}
      </EdgeScrollRow>
      </div></div>
    </div>
  );
}
