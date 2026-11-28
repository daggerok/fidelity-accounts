import type { MainTab } from '../app/prefs';

// The pages as ONE thin line cut in pieces, a piece a page, the lit piece the open one (owner 2026-11-27: "one line with
// separations ... squashed panel with pages tabs in form of lines"). The phone shows it in place of the tabs panel:
// over the scrolled Summary and above the scrolled Positions rows (ui/App.tsx)
export function TabLine({ tabs, open, name, onPick }: { tabs: readonly MainTab[]; open: MainTab; name: (tab: MainTab) => string; onPick: (tab: MainTab) => void }) {
  return (
    <div className="flex gap-2" data-tab-stripes>
      {tabs.map((tab) => (
        <button key={tab} type="button" className="block min-w-0 flex-1 py-2" title={name(tab)} aria-label={name(tab)} aria-current={open === tab ? 'page' : undefined} data-tab-stripe={tab} onClick={() => onPick(tab)}>
          <span className={`block h-1.5 rounded-full ${open === tab ? 'bg-[var(--brand)]' : 'bg-slate-300 dark:bg-slate-700'}`} />
        </button>
      ))}
    </div>
  );
}
