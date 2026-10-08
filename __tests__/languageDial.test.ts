/**
 * Home's tuner: two boxes, a first and a second language, each set from the
 * dial. Picking the other box's language swaps them; never the same twice.
 */
import {expect, jest, test} from '@jest/globals';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: () => Promise.resolve(null),
  setItem: () => Promise.resolve(),
}));
jest.mock('../src/analytics', () => ({logEvent: () => {}}));

import {setSlot} from '../src/store';

test('each box sets its own language', () => {
  expect(setSlot(['hindi', 'english'], 0, 'tamil')).toEqual(['tamil', 'english']);
  expect(setSlot(['hindi', 'english'], 1, 'tamil')).toEqual(['hindi', 'tamil']);
  expect(setSlot(['hindi'], 1, 'punjabi')).toEqual(['hindi', 'punjabi']);
});

test("picking the other box's language swaps them", () => {
  expect(setSlot(['hindi', 'english'], 0, 'english')).toEqual(['english', 'hindi']);
  expect(setSlot(['hindi', 'english'], 1, 'hindi')).toEqual(['english', 'hindi']);
});

test('nothing changes when nothing would', () => {
  expect(setSlot(['hindi', 'english'], 0, 'hindi')).toEqual(['hindi', 'english']);
  // The first language on an empty second box: not twice.
  expect(setSlot(['hindi'], 1, 'hindi')).toEqual(['hindi']);
});
