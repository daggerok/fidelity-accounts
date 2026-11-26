/// <reference lib="esnext" />
import { useEffect, useRef, useState } from 'react';
import { NOTICE_OK_MS, clickCloses, type Notice } from '../../shared/notice';
import { lines } from '../../shared/notice-words';
import { closeNotice, notices } from '../app/data';
import { lang, t } from '../app/i18n';
import { useStore } from './useStore';

// The popups of 🔔 (shared/notice.ts; owner 2026-11-25: "success color - our theme, red color - error"): a success closes
// by itself, an error stays until ✕. Where and how (owner 2026-11-25: "toast should appears on top right", "it should
// fade in / fade out and has form like our navbar on the right", then "put the popup over the right end of the
// navbar"): it lies over the right end of the navbar, in the navbar's shape (its corner, border, padding and height),
// about as wide as the navbar's buttons, and covers them until it goes or ✕ is pressed; it fades in when it comes and
// out before it goes (index.css .notice, none with reduced motion). App places the list inside the navbar's box.
// Colours (owner 2026-11-25: "popups also should be in agreement with our colored theme"): the navbar's own surface in
// the light or the dark theme, the border, the dot and the ✕ hover in the palette's accent for a success (--brand-ring,
// --brand-strong) and in the loss red for an error. Words (owner: "they should support i18n"): a notice of the script
// carries its sentences as keys (shared/notice-words.ts), said here in the app's language
// as long as the way out in index.css (.notice.out): the popup leaves the list when it has faded
export const NOTICE_FADE_MS = 300;

function Popup({ n }: { n: Notice }) {
  // leaving: the popup fades out first, then leaves the list
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    if (n.level !== 'ok') return undefined;
    const id = setTimeout(() => setLeaving(true), NOTICE_OK_MS);
    return () => clearTimeout(id);
  }, [n]);
  useEffect(() => {
    if (!leaving) return undefined;
    const id = setTimeout(() => closeNotice(n), NOTICE_FADE_MS);
    return () => clearTimeout(id);
  }, [leaving, n]);
  // a click anywhere else on the page closes it once it has been shown for 2 s (shared/notice.ts clickCloses), a success
  // and an error alike; it goes the same way as by ✕, with the fade
  const box = useRef<HTMLDivElement>(null);
  const shownAt = useRef(Date.now());
  useEffect(() => {
    const onDown = (e: Event) => { if (clickCloses(!!box.current && e.target instanceof Node && box.current.contains(e.target), Date.now() - shownAt.current)) setLeaving(true); };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, []);
  const language = useStore(lang);
  const error = n.level === 'error';
  const accent = error ? 'var(--loss)' : 'var(--brand-ring)';
  // one item a line (owner 2026-11-25: "toast should contain 1 line per item"): the operation first, in bold (owner: "make
  // operation in bold"), the numbers or the error details under it
  const rows = n.words ? lines(n.words, (key) => t(key), language === 'ru' ? 'ru-RU' : 'en-US') : [n.text];
  return (
    <div ref={box} role={error ? 'alert' : 'status'} data-notice={n.level} data-leaving={leaving || undefined}
      className={`notice pointer-events-auto flex min-h-[3.375rem] items-start gap-3 rounded-2xl border bg-white px-6 py-2 text-sm text-slate-800 shadow-lg dark:bg-slate-900 dark:text-slate-100 ${leaving ? 'out' : ''}`}
      style={{ borderColor: accent }}>
      <span aria-hidden className="mt-1.5 size-2 flex-none rounded-full" style={{ background: accent }} />
      <span className="flex min-w-0 flex-1 flex-col break-words" data-notice-lines>
        {rows.map((row, i) => <span key={i} className={i === 0 && n.words ? 'font-bold' : undefined}>{row}</span>)}
      </span>
      <button type="button" className="hit flex-none text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white" aria-label={t('Close')} onClick={() => setLeaving(true)}>✕</button>
    </div>
  );
}

export function Notices() {
  const list = useStore(notices);
  if (!list.length) return null;
  return (
    <div className="pointer-events-none absolute right-0 top-0 z-50 flex w-[min(26rem,100%)] flex-col gap-2" data-notices>
      {list.map((n) => <Popup key={`${n.at}:${n.text}`} n={n} />)}
    </div>
  );
}
