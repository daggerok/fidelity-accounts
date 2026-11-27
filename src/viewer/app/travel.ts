/// <reference lib="esnext" />
// Where a traveling control sits: the offset of a slot (an empty box that keeps its place) inside the box the control
// is positioned in. The phone navbar moves the theme button between two slots with it (ui/MobileMenu.tsx)
export interface Box { left: number; top: number }
export interface Offset { x: number; y: number }

export const slotOffset = (slot: Box, within: Box): Offset => ({ x: Math.round(slot.left - within.left), y: Math.round(slot.top - within.top) });
export const sameOffset = (a: Offset | null, b: Offset | null): boolean => !!a && !!b && a.x === b.x && a.y === b.y;
