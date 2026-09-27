/**
 * "Listen up Buddy" takes a new colour pair on each arrival at Home. The new
 * pair must always be a real change (never the pair just shown), and every
 * pair must be available to a launch.
 */
import {expect, jest, test} from '@jest/globals';

jest.mock('react-native', () => ({
  AccessibilityInfo: {},
  Animated: {Value: class {}, View: 'View'},
  Easing: {},
  StyleSheet: {create: (s: unknown) => s},
  Text: 'Text',
  View: 'View',
}));

// NB: below the mock — jest hoists jest.mock().
import {
  PAIRS,
  WORDS,
  buildReel,
  fitSize,
  nextPair,
} from '../src/components/Greeting';

const RANDS = [0, 0.1, 0.25, 0.4, 0.5, 0.6, 0.75, 0.9, 0.9999];

test('the next pair is never the current one, and always in range', () => {
  for (let current = 0; current < PAIRS.length; current++) {
    for (const r of RANDS) {
      const next = nextPair(current, PAIRS.length, () => r);
      expect(next).not.toBe(current);
      expect(next).toBeGreaterThanOrEqual(0);
      expect(next).toBeLessThan(PAIRS.length);
    }
  }
});

test('a launch can start on any pair', () => {
  const seen = new Set(
    PAIRS.map((_, i) => nextPair(-1, PAIRS.length, () => i / PAIRS.length)),
  );
  expect(seen.size).toBe(PAIRS.length);
});

test('every pair is two different colours', () => {
  for (const [a, b] of PAIRS) {
    expect(a).not.toBe(b);
  }
});

test('the line fits its room with the longest word, pill and all', () => {
  const longest = Math.max(...WORDS.map(w => w[1]));
  // Rooms Home's header leaves on 432, 392 and 360 dp phones.
  for (const room of [300, 260, 224]) {
    const size = fitSize(room);
    // "Listen up" (4.096 em), the gap, and the pill with 9 dp either side.
    expect(size * (4.096 + longest) + 7 + 18).toBeLessThanOrEqual(room);
  }
  expect(fitSize(224)).toBeGreaterThanOrEqual(22); // not tiny on a 360 dp phone
  expect(fitSize(0)).toBe(32); // before layout: full size, not 0
});

test('the reel lands on its word and never shows one word twice running', () => {
  for (let land = 0; land < WORDS.length; land++) {
    const reel = buildReel(land);
    expect(reel[reel.length - 1]).toBe(land);
    for (let i = 1; i < reel.length; i++) {
      expect(reel[i]).not.toBe(reel[i - 1]);
    }
  }
});

test('every word is distinct', () => {
  expect(new Set(WORDS.map(w => w[0])).size).toBe(WORDS.length);
});
