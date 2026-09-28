/**
 * The Recap teaser hides "until next week", so its week must turn over on
 * Monday; and the mini player's progress line may be more colourful than the
 * surfaces are allowed to be, without touching their default.
 */
import {expect, jest, test} from '@jest/globals';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: async () => null,
  setItem: async () => undefined,
}));
jest.mock('react-native', () => ({
  Animated: {Value: class {}, View: 'View'},
  NativeModules: {},
  Easing: {},
  StyleSheet: {create: (s: unknown) => s},
  Text: 'Text',
  TouchableOpacity: 'TouchableOpacity',
  View: 'View',
}));
jest.mock('react-native-svg', () => ({
  __esModule: true,
  default: 'Svg',
  Circle: 'Circle',
  Path: 'Path',
}));
jest.mock('../src/icons', () => ({X: 'X'}));

import {weekOf} from '../src/components/RecapTeaser';
import {surfaceTint} from '../src/artworkColor';

test('a week runs Monday to Sunday', () => {
  const sun = new Date(2026, 8, 27, 22, 0).getTime(); // Sunday 27 Sep
  const mon = new Date(2026, 8, 28, 0, 30).getTime(); // Monday 28 Sep
  const wed = new Date(2026, 8, 23, 12, 0).getTime(); // Wednesday 23 Sep
  expect(weekOf(sun)).toBe('2026-09-21');
  expect(weekOf(wed)).toBe('2026-09-21');
  expect(weekOf(mon)).toBe('2026-09-28');
});

test('a higher saturation ceiling only when asked for', () => {
  const neon = '#ff0080';
  expect(surfaceTint(neon, 0.5)).toBe(surfaceTint(neon, 0.5, 0.34));
  const sat = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
    return Math.max(r, g, b) - Math.min(r, g, b);
  };
  expect(sat(surfaceTint(neon, 0.66, 0.8))).toBeGreaterThan(
    sat(surfaceTint(neon, 0.66)),
  );
});
