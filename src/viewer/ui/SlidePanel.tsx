import { t } from '../app/i18n';

// A panel that slides down under the toolbar and back up (twitter's settings and log panels); `tools` sit right after
// the title (the Settings resets, owner 2026-11-24)
export function SlidePanel({ open, title, onClose, id, children, tools }: { open: boolean; title: string; onClose: () => void; id: string; children: React.ReactNode; tools?: React.ReactNode }) {
  return (
    // the gap above is padding inside the sliding part, so it opens and closes with the panel in one motion (owner
    // 2026-11-23: the gap vanished first and the panel slid up after it, a visible jump)
    // closed it is inert, like the folded accounts strip: its fields leave the Tab order and the screen reader (aria-hidden
    // alone hid them from the reader and kept them focusable)
    <div id={id} className={`slide-wrap shrink-0 ${open ? 'open' : ''}`} inert={!open}>
      <div className="slide-inner">
        <div className="pt-4 lg:pt-6">
        {/* the look of the navbar and the tabs panel it sits between (owner 2026-11-27): the same background, border and corner */}
        <section className="rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
          <div className="panel-head">
            <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
              <h2 className="text-sm font-semibold">{title}</h2>
              {tools}
            </div>
            <button type="button" className="tb self-start" title={t('Close')} aria-label={t('Close')} onClick={onClose}>✕</button>
          </div>
          <div className="px-6 py-4">{children}</div>
        </section>
        </div>
      </div>
    </div>
  );
}
