/// <reference lib="esnext" />
import { useEffect, useRef, useState } from 'react';

// A box that reaches down to the footer (owner 2026-11-24: "fix main area", a table stopped at 70% of the window): its
// height is the room between its top and the footer, measured again on a resize, when the page around it changes its
// size, and whenever `layout` changes (the phone's navbar folding takes 350 ms: measured while it moves). Also the
// box's own width, for layouts that follow it. One hook for every such box: the Positions table, the Activity table
// `ready`: changes when the box appears later than its page (a table drawn once its data came), so it is found then
export function useFill(box: React.RefObject<HTMLElement | null>, layout?: unknown, least = 240, ready?: unknown): { fill: number | null; width: number } {
  const [fill, setFill] = useState<number | null>(null);
  const [width, setWidth] = useState(0);
  const remeasure = useRef<() => void>(() => undefined);
  useEffect(() => {
    const timers = [0, 120, 240, 380, 500].map((ms) => setTimeout(() => remeasure.current(), ms));
    return () => timers.forEach(clearTimeout);
  }, [layout]);
  useEffect(() => {
    const el = box.current;
    if (!el) return undefined;
    const measure = () => {
      const foot = document.querySelector('footer')?.getBoundingClientRect().top ?? window.innerHeight;
      setFill(Math.max(least, Math.floor(foot - el.getBoundingClientRect().top)));
      setWidth(el.clientWidth);
    };
    measure();
    remeasure.current = measure;
    window.addEventListener('resize', measure);
    const ro = new ResizeObserver(measure);
    if (el.parentElement) ro.observe(el.parentElement);
    return () => { window.removeEventListener('resize', measure); ro.disconnect(); };
  }, [ready]);
  return { fill, width };
}
