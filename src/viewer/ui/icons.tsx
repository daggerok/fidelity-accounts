// Line icons for the card corners (owner 2026-11-24: the ⤢ glyph was too small, "much bigger"): 24 px, the text colour
const svg = (children: React.ReactNode) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-6" aria-hidden>{children}</svg>
);
export const ExpandIcon = () => svg(<><path d="M15 3h6v6" /><path d="M9 21H3v-6" /><path d="M21 3l-7 7" /><path d="M3 21l7-7" /></>);
export const CloseIcon = () => svg(<path d="M18 6 6 18M6 6l12 12" />);

// the corner icon (owner 2026-11-24: "same spacing" as the title): measured live, the title's first letter starts 26 px
// from the left and 28 px from the top of the card; the icon's drawing keeps 3 px inside its 24 px box, so the margins
// take back the 4 px padding and that inset to land the drawing 26 px from the right and 28 px from the top. No
// background on hover, only the colour, so it reads as an icon, not a button
export const CORNER_BUTTON = '-my-1 -ml-1 -mr-[6px] grid flex-none translate-y-0.5 place-items-center p-1 text-slate-500 transition-colors hover:text-slate-900 dark:text-slate-400 dark:hover:text-white';
