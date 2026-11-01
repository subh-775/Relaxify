/**
 * The installer opened with the bar stuck at 50-60%: every percent re-rendered
 * the whole app, because the shell and every list watched the whole update
 * state, so the bar lagged the finished download by seconds. Only the strip may
 * follow the percent; everyone else re-renders when their own answer changes.
 */
import {beforeEach, expect, jest, test} from '@jest/globals';

const mockNative = {
  check: jest.fn(async () => true),
  install: jest.fn(),
};
const mockListeners: Record<string, (v: any) => void> = {};

jest.mock('react-native', () => ({
  AppState: {addEventListener: () => ({remove: () => undefined})},
  NativeModules: {Updater: mockNative},
  NativeEventEmitter: class {
    addListener(e: string, cb: (v: any) => void) {
      mockListeners[e] = cb;
    }
  },
}));
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: async () => null,
  setItem: async () => undefined,
  removeItem: async () => undefined,
}));
jest.mock('../src/analytics', () => ({logEvent: () => undefined}));
jest.mock('../src/diag', () => ({diag: () => undefined}));

let mockSelect: (subscribe: any, get: () => unknown) => unknown;
jest.mock('react', () => ({
  useSyncExternalStore: (a: any, b: any) => mockSelect(a, b),
}));

// After the mocks: the module reads NativeModules.Updater as it loads.
const {startUpdateInstall, useUpdateSelect: select} = require('../src/update');

/** What a hook reading `pick` sees: its subscription and its current value. */
function watch(pick: (s: any) => unknown) {
  let read: () => unknown = () => undefined;
  let renders = 0;
  mockSelect = (subscribe, get) => {
    read = get;
    subscribe(() => {
      if (read() !== last) {
        last = read();
        renders += 1;
      }
    });
    return get();
  };
  select(pick);
  let last = read();
  return () => renders;
}

beforeEach(() => {
  mockNative.install.mockClear();
});

test('a second tap does not start a second download', () => {
  startUpdateInstall();
  startUpdateInstall();
  expect(mockNative.install).toHaveBeenCalledTimes(1);
  mockListeners['mp.update.progress'](100);
});

test('a watcher of one answer does not re-render for each percent', () => {
  const renders = watch(s => s.phase === 'downloading');
  startUpdateInstall();
  for (let pct = 1; pct < 100; pct++) {
    mockListeners['mp.update.progress'](pct);
  }
  expect(renders()).toBe(1); // became true once, and stayed true
  mockListeners['mp.update.progress'](100);
  expect(renders()).toBe(2);
});

test('a retry is allowed once the download has ended', () => {
  startUpdateInstall();
  mockListeners['mp.update.progress'](-1);
  startUpdateInstall();
  expect(mockNative.install).toHaveBeenCalledTimes(2);
  mockListeners['mp.update.progress'](100);
});
