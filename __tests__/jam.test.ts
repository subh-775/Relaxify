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

import {newCode, normalizeCode, validCode} from '../src/jam';

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
