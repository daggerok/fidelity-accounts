// A settings section whose header slides it open and shut (owner 2026-11-23): Get started opens while something needs
// setup and is squashed once done; every other section starts expanded
export function Section({ title, note, open, onToggle, children, id }: { title: React.ReactNode; note?: React.ReactNode; open: boolean; onToggle: () => void; children: React.ReactNode; id: string }) {
  return (
    <section className="min-w-0 rounded-xl border border-slate-200 dark:border-slate-700" data-section={id} data-open={open ? 'yes' : 'no'}>
      <button type="button" className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold" aria-expanded={open} onClick={onToggle}>
        <span className="inline-block transition-transform duration-200" style={{ transform: open ? 'rotate(90deg)' : 'none' }}>▸</span>
        {title}
        {note !== undefined && <span className="ml-auto text-xs font-normal text-slate-500">{note}</span>}
      </button>
      <div className={`slide-wrap ${open ? 'open' : ''}`}>
        <div className="slide-inner"><div className="px-4 pb-4">{children}</div></div>
      </div>
    </section>
  );
}
