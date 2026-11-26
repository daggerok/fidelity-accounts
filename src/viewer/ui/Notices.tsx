/// <reference lib="esnext" />
import { useCallback, useEffect, useRef, useState } from 'react';
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

// `leaving`: the popup fades out first, then leaves the list; the list (Notices) keeps that, so one Esc can send every
// popup away and knows whether any is still there to take the key
function Popup({ n, leaving, onLeave }: { n: Notice; leaving: boolean; onLeave: () => void }) {
  // The pointer over a popup, or the keyboard focus on its ✕, holds it (owner 2026-11-25: "pause on hover too"): a
  // success does not close by itself meanwhile, and gets its whole time again when the pointer leaves
  const [held, setHeld] = useState(false);
  useEffect(() => {
    if (n.level !== 'ok' || held || leaving) return undefined;
    const id = setTimeout(onLeave, NOTICE_OK_MS);
    return () => clearTimeout(id);
  }, [n, held, leaving, onLeave]);
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
    const onDown = (e: Event) => { if (clickCloses(!!box.current && e.target instanceof Node && box.current.contains(e.target), Date.now() - shownAt.current)) onLeave(); };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [onLeave]);
  const language = useStore(lang);
  const error = n.level === 'error';
  const accent = error ? 'var(--loss)' : 'var(--brand-ring)';
  // one item a line (owner 2026-11-25: "toast should contain 1 line per item"): the operation first, in bold (owner: "make
  // operation in bold"), the numbers or the error details under it
  const rows = n.words ? lines(n.words, (key) => t(key), language === 'ru' ? 'ru-RU' : 'en-US') : [n.text];
  return (
    <div ref={box} role={error ? 'alert' : 'status'} data-notice={n.level} data-leaving={leaving || undefined} data-held={held || undefined}
      onPointerEnter={() => setHeld(true)} onPointerLeave={() => setHeld(false)} onFocus={() => setHeld(true)} onBlur={() => setHeld(false)}
      className={`notice pointer-events-auto flex min-h-[3.375rem] items-start gap-3 rounded-2xl border bg-white px-6 py-2 text-sm text-slate-800 shadow-lg dark:bg-slate-900 dark:text-slate-100 ${leaving ? 'out' : ''}`}
      style={{ borderColor: accent }}>
      <span aria-hidden className="mt-1.5 size-2 flex-none rounded-full" style={{ background: accent }} />
      <span className="flex min-w-0 flex-1 flex-col break-words" data-notice-lines>
        {rows.map((row, i) => <span key={i} className={i === 0 && n.words ? 'font-bold' : undefined}>{row}</span>)}
      </span>
      <button type="button" className="hit flex-none text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white" aria-label={t('Close')} onClick={onLeave}>✕</button>
    </div>
  );
}

const keyOf = (n: Notice): string => `${n.at}:${n.text}`;

export function Notices() {
  const list = useStore(notices);
  // the popups on their way out, by key
  const [gone, setGone] = useState<readonly string[]>([]);
  const leave = useCallback((key: string) => setGone((g) => (g.indexOf(key) >= 0 ? g : g.concat(key))), []);
  // keys of popups that left the list are forgotten
  useEffect(() => { setGone((g) => { const kept = g.filter((k) => list.some((n) => keyOf(n) === k)); return kept.length === g.length ? g : kept; }); }, [list]);
  // Esc closes every popup, at any moment after it appeared (owner 2026-11-25: "or click esc after it appears"), and
  // the popups take the key first: with a ⤢ window open the first Esc sends the popups away and only the next one
  // closes the window (owner: "toast disabled first, next esc closes zoomed modal"). So the key is caught on its way
  // down, before the window's own listener, and stopped there; with no popup left to close it passes untouched
  const live = useRef<string[]>([]);
  live.current = list.map(keyOf).filter((k) => gone.indexOf(k) < 0);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !live.current.length) return;
      e.stopImmediatePropagation();
      e.preventDefault();
      live.current.forEach(leave);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [leave]);
  if (!list.length) return null;
  return (
    <div className="pointer-events-none absolute right-0 top-0 z-50 flex w-[min(26rem,100%)] flex-col gap-2" data-notices>
      {/* the newest on top: a popup that comes while another is still shown takes its place and moves it down (owner
          2026-11-25: "next should move down previous toast"); the store keeps them oldest first */}
      {list.slice().reverse().map((n) => <NoticeItem key={keyOf(n)} n={n} leaving={gone.indexOf(keyOf(n)) >= 0} leave={leave} />)}
    </div>
  );
}

// one popup with its own stable "leave" (the list's, bound to its key), so its timers do not restart on every draw
function NoticeItem({ n, leaving, leave }: { n: Notice; leaving: boolean; leave: (key: string) => void }) {
  const key = keyOf(n);
  const onLeave = useCallback(() => leave(key), [leave, key]);
  return <Popup n={n} leaving={leaving} onLeave={onLeave} />;
}
