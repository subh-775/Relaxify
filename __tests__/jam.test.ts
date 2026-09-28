/**
 * Jam codes: six characters from an alphabet with no look-alikes, so a code
 * read aloud or typed from a screenshot comes out right, and the database
 * rules (firebase/database.rules.json) accept exactly these.
 */
import {expect, jest, test} from '@jest/globals';

jest.mock('../src/player', () => ({}));
jest.mock('../src/backend', () => ({search: async () => []}));
jest.mock('../src/analytics', () => ({logEvent: () => undefined}));
jest.mock('../src/toast', () => ({toast: () => undefined}));
jest.mock('react-native', () => ({AppState: {addEventListener: () => ({remove() {}})}}));

import {
  NUDGE,
  SEEK_S,
  SYNC_OK_S,
  bestOffset,
  correction,
  newCode,
  normalizeCode,
  validCode,
} from '../src/jam';

const RULE = /^[A-HJ-NP-Z2-9]{6}$/; // the same pattern the rules use

test('new codes always pass the database rule', () => {
  for (let i = 0; i < 500; i++) {
    const c = newCode();
    expect(c).toMatch(RULE);
    expect(validCode(c)).toBe(true);
  }
});

test('a typed code is tidied, and look-alikes become the real characters', () => {
  expect(normalizeCode(' k7qx-2m ')).toBe('K7QX2M');
  // O and I are not in the alphabet; they become 0 and 1, which are not
  // either, so the code is refused rather than silently matching another.
  expect(validCode(normalizeCode('KOQX2M'))).toBe(false);
  expect(validCode('ABC')).toBe(false);
  expect(validCode('ABCDE1')).toBe(false);
});

test('the clock trusts the fastest round trip, not the latest', () => {
  expect(
    bestOffset([
      {offset: 900, rtt: 600}, // a slow moment: up to 300 ms wrong
      {offset: 1012, rtt: 40},
      {offset: 1150, rtt: 300},
    ]),
  ).toBe(1012);
});

test('in step: nothing; a small gap: a nudge that closes it exactly; a big one: a jump', () => {
  expect(correction(SYNC_OK_S / 2).kind).toBe('none');
  expect(correction(-(SEEK_S + 0.1)).kind).toBe('seek');

  // 0.2 s ahead: play slower for as long as it takes to lose 0.2 s.
  const ahead = correction(0.2);
  expect(ahead.kind).toBe('nudge');
  if (ahead.kind === 'nudge') {
    expect(ahead.rate).toBeCloseTo(1 - NUDGE);
    expect((ahead.forMs / 1000) * (1 - ahead.rate)).toBeCloseTo(0.2, 2);
  }
  // Behind, at 1.5x set by the person: faster than their own speed.
  const behind = correction(-0.1, 1.5);
  if (behind.kind === 'nudge') {
    expect(behind.rate).toBeCloseTo(1.5 * (1 + NUDGE));
    expect((behind.forMs / 1000) * (behind.rate - 1.5)).toBeCloseTo(0.1, 2);
  } else {
    throw new Error('expected a nudge');
  }
});
