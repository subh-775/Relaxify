/**
 * Moving a song in the Jam queue gives it a key that sorts between its new
 * neighbours. Firebase push keys start with "-" and use "-" and "_" too.
 */
import {expect, test} from '@jest/globals';
import {keyBetween, movedKey} from '../src/jamQueue';

const PUSH = ['-OAb12xyz', '-OAb12xz0', '-OAc0000'];

test.each([
  [undefined, undefined],
  [undefined, '-OAb12xyz'],
  ['-OAb12xyz', undefined],
  ['-OAb12xyz', '-OAb12xz0'],
  ['-OAb12xyz', '-OAb12xyz0'],
  ['a', 'b'],
  ['a', 'a0'],
  ['_', 'a'],
] as Array<[string | undefined, string | undefined]>)('between %s and %s', (a, b) => {
  const k = keyBetween(a, b);
  if (a !== undefined) {
    expect(k > a).toBe(true);
  }
  if (b !== undefined) {
    expect(k < b).toBe(true);
  }
  expect(k).toMatch(/^[-_!+0-9A-Za-z]+$/);
});

test('a song moved to the top sorts first', () => {
  const k = movedKey(PUSH, 2, 0);
  expect([k, PUSH[0], PUSH[1]].sort()[0]).toBe(k);
});

test('a song moved down sorts between its new neighbours', () => {
  const k = movedKey(PUSH, 0, 1);
  expect(k > PUSH[1] && k < PUSH[2]).toBe(true);
});

test('a song moved to the end sorts last', () => {
  const k = movedKey(PUSH, 0, 2);
  expect(k > PUSH[2]).toBe(true);
});

test('many moves to the same spot keep finding room', () => {
  let lo = 'a';
  const hi = 'b';
  for (let i = 0; i < 60; i++) {
    const k = keyBetween(lo, hi);
    expect(k > lo && k < hi).toBe(true);
    lo = k;
  }
});

test('moving to the top again and again keeps finding keys', () => {
  let first = '-OAb12xyz';
  for (let i = 0; i < 50; i++) {
    const k = keyBetween(undefined, first);
    expect(k < first).toBe(true);
    expect(k.endsWith('!')).toBe(false);
    first = k;
  }
});

test('moving to the end again and again keeps finding keys', () => {
  let last = '-OAb12xyz';
  for (let i = 0; i < 50; i++) {
    const k = keyBetween(last);
    expect(k > last).toBe(true);
    last = k;
  }
});

test('equal or reversed neighbours are refused', () => {
  expect(() => keyBetween('b', 'a')).toThrow();
});
