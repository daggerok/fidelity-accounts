/// <reference lib="esnext" />
import { useEffect } from 'react';
import { NOTICE_OK_MS, type Notice } from '../../shared/notice';
import { closeNotice, notices } from '../app/data';
import { t } from '../app/i18n';
import { useStore } from './useStore';

// The popups of 🔔 (shared/notice.ts; owner 2026-11-25: "success color - our theme, red color - error"): bottom right
// above the footer, a success in the palette's color closes by itself, an error in red stays until ✕
function Popup({ n }: { n: Notice }) {
  useEffect(() => {
    if (n.level !== 'ok') return undefined;
    const id = setTimeout(() => closeNotice(n), NOTICE_OK_MS);
    return () => clearTimeout(id);
  }, [n]);
  const error = n.level === 'error';
  return (
    <div role={error ? 'alert' : 'status'} data-notice={n.level}
      className="pointer-events-auto flex items-start gap-3 rounded-xl px-4 py-3 text-sm text-white shadow-lg"
      style={{ background: error ? 'var(--loss)' : 'var(--brand-btn)' }}>
      <span className="min-w-0 flex-1 break-words">{n.text}</span>
      <button type="button" className="flex-none opacity-80 hover:opacity-100" aria-label={t('Close')} onClick={() => closeNotice(n)}>✕</button>
    </div>
  );
}

export function Notices() {
  const list = useStore(notices);
  if (!list.length) return null;
  return (
    <div className="pointer-events-none fixed bottom-8 right-4 z-50 flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2 lg:right-6" data-notices>
      {list.map((n) => <Popup key={`${n.at}:${n.text}`} n={n} />)}
    </div>
  );
}
