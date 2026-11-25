/// <reference lib="esnext" />
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { fitCount } from '../app/fit';

// A card's list grows to end close to the footer on a big screen (owner 2026-11-25: less empty space on big screens,
// "while for other or mobile we can leave as is"): only while the Summary stands in three columns (xl). The card
// measures the room between its bottom and the footer and adds or drops rows (`perStep` rows at a time, movers add one
// to each list); a resize, a size change of the page around it or new data (`key`) measures again, a few rounds at most
// so packed columns cannot loop
const WIDE = '(min-width: 1280px)';
const GUTTER = 24; // the gap above the footer, as between the cards on a big screen
const ROUNDS = 6;

export function useFitRows(base: number, max: number, perStep: number, key: string): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [n, setN] = useState(base);
  const [, setTick] = useState(0);
  const rounds = useRef(0);
  // measure again on a resize and whenever the page above or around the card changes size (the settings sliding up or
  // down, the cards of the other columns growing with new data)
  useEffect(() => {
    let frame = 0;
    const on = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => { rounds.current = 0; setTick((x) => x + 1); }); };
    window.addEventListener('resize', on);
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(on);
    ['#settings-wrap', '[data-summary]', '[data-tabs-panel]'].forEach((sel) => { const el = document.querySelector(sel); if (el) ro?.observe(el); });
    return () => { cancelAnimationFrame(frame); window.removeEventListener('resize', on); ro?.disconnect(); };
  }, []);
  useEffect(() => { rounds.current = 0; setTick((x) => x + 1); }, [key]);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!window.matchMedia?.(WIDE).matches) { if (n !== base) setN(base); return; }
    if (rounds.current >= ROUNDS) return;
    rounds.current += 1;
    const card = el.closest('[data-card]');
    const foot = document.querySelector('footer');
    const row = el.querySelector('[data-fit-row]');
    if (!card || !foot || !row) return;
    const room = foot.getBoundingClientRect().top - GUTTER - card.getBoundingClientRect().bottom;
    const next = fitCount(n, room, row.getBoundingClientRect().height * perStep, base, max);
    if (next !== n) setN(next);
  });
  return [ref, n];
}
