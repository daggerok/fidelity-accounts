/// <reference lib="esnext" />
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { fitCount, fitRestarts } from '../app/fit';

// A card's list grows to end close to the footer on a big screen (owner 2026-11-25: less empty space on big screens,
// "while for other or mobile we can leave as is"): only while the Summary stands in three columns (xl). The card
// measures the room between its bottom and the footer and adds or drops rows (`perStep` rows at a time, movers add one
// to each list); a resize, a size change of the page around it or new data (`key`) measures again, a few rounds at most
// so packed columns cannot loop
// The measure runs after each draw of the card (before the paint, as before) and in the frame after a resize or a size
// change; it sets state only when the count changes, so a phone, the frames of the 0.35 s settings slide that cross no
// row and a size change that changes nothing draw nothing
const WIDE = '(min-width: 1280px)';
const GUTTER = 24; // the gap above the footer, as between the cards on a big screen
const ROUNDS = 6;
// the page around the cards: its size changes always measure from a fresh count of rounds. The cards' own box changes with
// our rows too, so it starts again only long after the last own change (fitRestarts): one card growing moves the cards of
// the packed columns, and two cards answering each other stop after ROUNDS own changes each
const PAGE = ['#settings-wrap', '[data-tabs-panel]'];
const CARDS = '[data-summary]';
// the last own row change of any card (the movers and the dividends move each other in the packed columns)
let lastOwnChange = -Infinity;

export function useFitRows(base: number, max: number, perStep: number, key: string): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [n, setN] = useState(base);
  // own row changes since the last outside reason (a resize, the page around, new data or `key`)
  const rounds = useRef(0);
  const seenKey = useRef(key);
  // the count asked for last: a frame between the ask and its draw must not ask (and count a round) again
  const asked = useRef(base);
  // the measure with the values of the last draw, for the frames outside a draw
  const measure = useRef<() => void>(() => undefined);
  useLayoutEffect(() => {
    if (seenKey.current !== key) { seenKey.current = key; rounds.current = 0; }
    measure.current = () => {
      const el = ref.current;
      if (!el) return;
      if (!window.matchMedia?.(WIDE).matches) {
        if (n !== base && asked.current !== base) { asked.current = base; setN(base); }
        return;
      }
      if (rounds.current >= ROUNDS) return;
      const card = el.closest('[data-card]');
      const foot = document.querySelector('footer');
      const row = el.querySelector('[data-fit-row]');
      if (!card || !foot || !row) return;
      const room = foot.getBoundingClientRect().top - GUTTER - card.getBoundingClientRect().bottom;
      const next = fitCount(n, room, row.getBoundingClientRect().height * perStep, base, max);
      if (next === n || next === asked.current) return;
      rounds.current += 1;
      lastOwnChange = performance.now();
      asked.current = next;
      setN(next);
    };
    measure.current();
  });
  // measure again on a resize and whenever the page above or around the card changes size (the settings sliding up or
  // down, the cards of the other columns growing with new data)
  useEffect(() => {
    let frame = 0;
    const later = (restart: boolean) => {
      if (restart) rounds.current = 0;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => measure.current());
    };
    const onResize = () => later(true);
    window.addEventListener('resize', onResize);
    const page = PAGE.map((sel) => document.querySelector(sel)).filter((el): el is Element => !!el);
    const cards = document.querySelector(CARDS);
    const ro = typeof ResizeObserver === 'undefined' ? null
      : new ResizeObserver((entries) => later(fitRestarts(entries.some((e) => page.indexOf(e.target) >= 0), performance.now() - lastOwnChange)));
    page.concat(cards ? [cards] : []).forEach((el) => ro?.observe(el));
    return () => { cancelAnimationFrame(frame); window.removeEventListener('resize', onResize); ro?.disconnect(); };
  }, []);
  return [ref, n];
}
