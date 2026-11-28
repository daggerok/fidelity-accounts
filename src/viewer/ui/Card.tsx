/// <reference lib="esnext" />
import { useRef, useState } from 'react';
import { t } from '../app/i18n';
import { CORNER_BUTTON, ExpandIcon } from './icons';
import { Zoom } from './Zoom';

// A card of the Summary: the title in the brand colour, its tools and ⤢. Each card is as tall as its content and the cards
// pack into columns (owner 2026-11-23: plates sized by their content, a shorter page on desktop)
// `expand`: the card's full view, opened big over the page by ⤢ (owner 2026-11-23: maximize for every plate where it
// makes sense, more rows and details there)
// `lead` sits right after the title, `tools` at the top right corner; `bigTools` only in the full view, before the
// tools: what the card itself shows in its body and the full view has no room for there (the Upcoming dividends order)
export function Card({ id, title, titleHint, children, tools, lead, expand, bigTools }: { id: string; title: string; titleHint?: string; children: React.ReactNode; tools?: React.ReactNode; lead?: React.ReactNode; expand?: React.ReactNode; bigTools?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLElement>(null);
  return (
    <section ref={box} className="card mb-4 lg:mb-6 flex w-full break-inside-avoid flex-col gap-3" style={{ viewTransitionName: `card-${id}` } as React.CSSProperties} data-card={id}>
      {/* on a phone the chips start on the title's line, right after it, and run on to the next lines (owner 2026-11-27:
          "start chips on the same line after Accounts with our spacing"); index.css .card-head */}
      <div className="card-head flex flex-wrap items-center gap-x-3 gap-y-2">
        {/* card titles in the green of "Fidelity" in the logo (owner 2026-11-24) */}
        <h2 className="text-lg font-semibold" style={{ color: 'var(--brand)' }} title={titleHint}>{title}</h2>
        {lead}
        {/* the expand icon sits as far from the top right corner as the title from the top left (owner 2026-11-24) */}
        <span className="card-tools -my-1 ml-auto flex items-center gap-2">{tools}{expand && <button type="button" className={CORNER_BUTTON} title={t('Open big')} onClick={() => setOpen(true)} data-expand><ExpandIcon /></button>}</span>
      </div>
      {children}
      {/* always mounted: a list that empties under an open window (a pill switched) must not drop the window; it shows the card's own view then */}
      <Zoom open={open} title={title} tools={lead || tools || bigTools ? <>{lead}{bigTools}{tools}</> : undefined} origin={box} onClose={() => setOpen(false)}>{expand ?? children}</Zoom>
    </section>
  );
}
