import { useEffect, useState } from 'react';
import { t } from '../app/i18n';

// A card or a chart drawn big on top of the page (owner 2026-11-23: maximize and minimize for every plate where it makes
// sense; ✕, a click anywhere outside or Esc puts it back, smooth and fast): fades and scales in over 150 ms, out the same
// way, then unmounts
export function Zoom({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: React.ReactNode }) {
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (open) {
      setMounted(true);
      const id = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
      return () => cancelAnimationFrame(id);
    }
    setShown(false);
    const timer = setTimeout(() => setMounted(false), 160);
    return () => clearTimeout(timer);
  }, [open]);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!mounted) return null;
  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 transition-opacity duration-150 ease-out ${shown ? 'opacity-100' : 'opacity-0'}`}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }} role="dialog" aria-modal="true" aria-label={title} data-chart-zoom>
      <div className={`card flex max-h-full w-full max-w-6xl flex-col gap-3 overflow-auto transition-transform duration-150 ease-out ${shown ? 'scale-100' : 'scale-95'}`}>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button type="button" className="tb" title={t('Close')} onClick={onClose}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
