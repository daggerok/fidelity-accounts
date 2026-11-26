/// <reference types="bun" />
/// <reference types="node" />
/// <reference lib="esnext" />
import { expect, test } from 'bun:test';
import { dropIndex, edgeSpeed } from './drag';

test('a dragged row lands after every middle above the pointer', () => {
  const mids = [16, 52, 88];
  expect(dropIndex(mids, 0)).toBe(0);
  expect(dropIndex(mids, 60)).toBe(2);
  expect(dropIndex(mids, 500)).toBe(3);
});

test('a scrolled list counts in list coordinates: the pointer plus the scroll', () => {
  // the box scrolled 200 px since the drag started: a pointer at 40 on screen sits at 240 in the list
  const mids = [116, 152, 188, 224, 260];
  expect(dropIndex(mids, 40 + 200)).toBe(4);
});

test('the box scrolls near its edges while dragging, faster closer to the edge, not in the middle', () => {
  expect(edgeSpeed(250, 100, 400)).toBe(0);
  expect(edgeSpeed(100, 100, 400)).toBe(-12);
  expect(edgeSpeed(116, 100, 400)).toBe(-6);
  expect(edgeSpeed(50, 100, 400)).toBe(-12);
  expect(edgeSpeed(400, 100, 400)).toBe(12);
  expect(edgeSpeed(384, 100, 400)).toBe(6);
  expect(edgeSpeed(100, 100, 150)).toBe(0);
});
