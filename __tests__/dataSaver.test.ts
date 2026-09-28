/**
 * The data saver caps streaming only on mobile data, only when switched on,
 * and never raises a lower choice.
 */
import {expect, jest, test} from '@jest/globals';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: async () => null,
  setItem: async () => undefined,
  removeItem: async () => undefined,
}));

import {
  DATA_SAVER_KBPS,
  currentQuality,
  homeLanguageParam,
  setOnCellular,
  writeSetting,
} from '../src/store';

test('data saver: capped on mobile data, full quality on Wi-Fi', () => {
  writeSetting('audioQuality', 320);
  setOnCellular(false);
  expect(currentQuality()).toBe(320);
  setOnCellular(true);
  expect(currentQuality()).toBe(DATA_SAVER_KBPS);
  writeSetting('audioQuality', 48);
  expect(currentQuality()).toBe(48);
  writeSetting('audioQuality', 320);
  writeSetting('dataSaver', false);
  expect(currentQuality()).toBe(320);
});

test('home languages reach the engine comma-joined, never empty', () => {
  writeSetting('homeLanguages', ['tamil', 'english']);
  expect(homeLanguageParam()).toBe('tamil,english');
  writeSetting('homeLanguages', []);
  expect(homeLanguageParam()).toBe('hindi,english');
});
