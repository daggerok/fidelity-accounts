// Line icons for the card corners (owner 2026-11-24: the ⤢ glyph was too small, then a bit too big): an 18 px box whose
// drawing (13.5 px) is as tall as the capitals of a card title; the text colour
const svg = (children: React.ReactNode) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-[18px]" aria-hidden>{children}</svg>
);
export const ExpandIcon = () => svg(<><path d="M15 3h6v6" /><path d="M9 21H3v-6" /><path d="M21 3l-7 7" /><path d="M3 21l7-7" /></>);
export const CloseIcon = () => svg(<path d="M18 6 6 18M6 6l12 12" />);
/** settings sliders: a control that configures what a view shows (the positions columns) */
export const SlidersIcon = () => svg(<><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12" /><circle cx="16" cy="6" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="18" cy="18" r="2" /></>);

// the corner icon (owner 2026-11-24: "same spacing" as the title): measured live, the title's first letter starts 26 px
// from the left and 28 px from the top of the card. The drawing keeps 2.25 px inside its 18 px box and the button 4 px
// of padding, so the right margin of -5px lands the drawing 26 px from the right; centred on the title's line it starts
// 28 px from the top. No background on hover, only the colour, so it reads as an icon, not a button. On a touch screen
// its invisible hit area is 44 px tall (index.css .hit), the 26 px button was easy to miss
export const CORNER_BUTTON = 'hit [--hit-y:9px] -my-1 -ml-1 -mr-[5px] grid flex-none place-items-center p-1 text-slate-500 transition-colors hover:text-slate-900 dark:text-slate-400 dark:hover:text-white';
