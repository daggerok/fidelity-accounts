/// <reference lib="esnext" />
import { useEffect, useState } from 'react';

/** true below Tailwind's sm (640 px): the phone layout of the navbar */
export const PHONE_QUERY = '(max-width: 639.98px)';

const matches = (query: string): boolean => {
  try { return globalThis.matchMedia?.(query).matches ?? false; } catch { return false; }
};

// whether a media query holds now, following its changes (a turned phone, a resized window)
export function useMedia(query: string): boolean {
  const [on, setOn] = useState(() => matches(query));
  useEffect(() => {
    const mq = globalThis.matchMedia?.(query);
    if (!mq) return undefined;
    const change = (e: MediaQueryListEvent) => setOn(e.matches);
    setOn(mq.matches);
    mq.addEventListener('change', change);
    return () => mq.removeEventListener('change', change);
  }, [query]);
  return on;
}
