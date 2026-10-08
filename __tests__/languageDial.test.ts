/**
 * The tuner keeps your last two stations: the one you tune to leads, the one
 * you were on follows, and landing on the second swaps them.
 */
import {expect, jest, test} from '@jest/globals';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: () => Promise.resolve(null),
  setItem: () => Promise.resolve(),
}));
jest.mock('../src/analytics', () => ({logEvent: () => {}}));
jest.mock('../src/toast', () => ({toast: () => {}}));

import {retune} from '../src/store';

test('a new language leads and the old one becomes the second', () => {
  expect(retune(['hindi'], 'punjabi')).toEqual(['punjabi', 'hindi']);
  expect(retune(['hindi', 'english'], 'tamil')).toEqual(['tamil', 'hindi']);
});

test('landing on the second swaps them; the first changes nothing', () => {
  expect(retune(['hindi', 'english'], 'english')).toEqual(['english', 'hindi']);
  expect(retune(['hindi', 'english'], 'hindi')).toEqual(['hindi', 'english']);
});

test('never more than two, and an empty start takes one', () => {
  expect(retune([], 'hindi')).toEqual(['hindi']);
  expect(retune(['a', 'b'], 'c').length).toBe(2);
});
