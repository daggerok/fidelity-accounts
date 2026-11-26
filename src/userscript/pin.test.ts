/// <reference types="bun" />
/// <reference types="node" />
/// <reference lib="esnext" />
import { expect, test } from 'bun:test';
import { allowPin, declinePin, idTail, pinStep, readPin } from './pin';

// made-up ids only
const A = 'sheet-a-0000000000000000000000000000aaaaaa';
const B = 'sheet-b-0000000000000000000000000000bbbbbb';

test('pinned and the same id: write', () => {
  expect(pinStep({ pin: A, printsId: A, declined: '', handoffId: A })).toBe('write');
  expect(pinStep({ pin: A, printsId: '', declined: B, handoffId: A })).toBe('write');
});

test('pinned and another id: ask, nothing written', () => {
  expect(pinStep({ pin: A, printsId: A, declined: '', handoffId: B })).toBe('ask');
  // prints of another sheet do not adopt it while a pin exists
  expect(pinStep({ pin: A, printsId: B, declined: '', handoffId: B })).toBe('ask');
});

test('no pin, the prints name the same sheet (the update of a working setup): adopted with no question', () => {
  expect(pinStep({ pin: '', printsId: A, declined: '', handoffId: A })).toBe('adopt');
});

test('no pin and no prints (a fresh install), or prints of another sheet: ask', () => {
  expect(pinStep({ pin: '', printsId: '', declined: '', handoffId: A })).toBe('ask');
  expect(pinStep({ pin: '', printsId: B, declined: '', handoffId: A })).toBe('ask');
});

test('the declined id again: not asked again, nothing written', () => {
  expect(pinStep({ pin: A, printsId: A, declined: B, handoffId: B })).toBe('declined');
  expect(pinStep({ pin: '', printsId: '', declined: B, handoffId: B })).toBe('declined');
});

test('an empty id (Disconnect in the viewer): idle', () => {
  expect(pinStep({ pin: A, printsId: A, declined: '', handoffId: '' })).toBe('idle');
  expect(pinStep({ pin: '', printsId: '', declined: '', handoffId: '' })).toBe('idle');
});

test('allow moves the pin, decline keeps it and remembers the declined id; a broken value reads as no pin', () => {
  expect(allowPin(B)).toEqual({ id: B, declined: '' });
  expect(declinePin({ id: A, declined: '' }, B)).toEqual({ id: A, declined: B });
  expect(readPin({ id: A, declined: B })).toEqual({ id: A, declined: B });
  expect(readPin(null)).toEqual({ id: '', declined: '' });
  expect(readPin('x')).toEqual({ id: '', declined: '' });
  expect(readPin({ id: 5 })).toEqual({ id: '', declined: '' });
  expect(idTail(A)).toBe('…aaaaaa');
  expect(idTail(A)).not.toContain('sheet-a');
});
