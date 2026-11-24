// Line icons for the card corners (owner 2026-11-24: the ⤢ glyph was too small, "much bigger"): 24 px, the text colour
const svg = (children: React.ReactNode) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-6" aria-hidden>{children}</svg>
);
export const ExpandIcon = () => svg(<><path d="M15 3h6v6" /><path d="M9 21H3v-6" /><path d="M21 3l-7 7" /><path d="M3 21l7-7" /></>);
export const CloseIcon = () => svg(<path d="M18 6 6 18M6 6l12 12" />);

// the corner button: its 4 px padding is taken back by a negative margin, so the icon itself lines up with the card's
// padding (as far from the top right corner as the title from the top left); the right margin also takes back the
// 3 px the drawing keeps inside its 24 px box
export const CORNER_BUTTON = '-m-1 -mr-[7px] grid flex-none place-items-center rounded-md p-1 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white';
