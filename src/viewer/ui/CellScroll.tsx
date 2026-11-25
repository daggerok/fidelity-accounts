/// <reference lib="esnext" />
// A full text in one table cell that scrolls sideways inside the cell instead of ending in "..." (owner 2026-11-24:
// "we want to see full names, but in scope of that particular cell we should have horizontal scroll"). No scrollbar;
// while more text hides on the right the edge fades, and the fade goes when the end is in view
const more = (el: HTMLElement): void => { el.classList.toggle('more', el.scrollLeft + el.clientWidth < el.scrollWidth - 1); };

export function CellScroll({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`cell-scroll ${className}`} ref={(el) => { if (el) more(el); }} onScroll={(e) => more(e.currentTarget)}>{children}</div>
  );
}
