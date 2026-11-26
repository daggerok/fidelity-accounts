/// <reference lib="esnext" />
import { useLayoutEffect, useState } from 'react';
import { PALETTES, readPalette, savePalette, type Palette } from '../../shared/theme';
import { t } from '../app/i18n';

// The color palette of the app, chosen in ⚙️ Settings (owner 2026-11-24, like gex's Color palette): a swatch and a
// name per palette, the chosen one ringed; a click recolours the page at once and is remembered. The palettes of the
// owner's other apps: green (this app, twitter, youtube, fundamentals), indigo (gex, options-desk), blue (investments,
// ETFs, Stocks, fidelity-reports)
const storage = (): Storage | undefined => {
  try { return globalThis.localStorage; } catch { return undefined; }
};
// the swatch is the palette's own accent in the light theme, so it reads the same on either page
const SWATCH: Record<Palette, string> = { green: '#368727', indigo: '#4f46e5', blue: '#2563eb' };

export function PalettePicker() {
  const [palette, setPalette] = useState<Palette>(() => readPalette(storage()));
  useLayoutEffect(() => { document.documentElement.dataset.palette = palette; }, [palette]);
  const name: Record<Palette, string> = { green: t('Fidelity green'), indigo: t('Indigo Desk'), blue: t('Ocean blue') };
  // the hints describe the colour itself: a stranger does not know the owner's other apps
  const from: Record<Palette, string> = { green: t('Green accents, the default'), indigo: t('Deep indigo accents'), blue: t('Bright blue accents') };
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t('Color palette')} data-palette-picker>
      {PALETTES.map((p) => (
        <button key={p} type="button" role="radio" aria-checked={p === palette} title={from[p]}
          className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors ${p === palette ? 'border-[var(--brand-ring)] bg-[var(--brand-soft)] text-[var(--brand-ink)]' : 'border-slate-300 hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800'}`}
          onClick={() => { setPalette(p); savePalette(storage(), p); }} data-palette-choice={p}>
          <span className="size-3.5 rounded-full ring-2 ring-white dark:ring-slate-900" style={{ background: SWATCH[p] }} />
          {name[p]}
        </button>
      ))}
    </div>
  );
}
