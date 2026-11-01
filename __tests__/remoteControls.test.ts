/**
 * The notification, the lock screen and a headset go through the app's own
 * playback functions, so they cannot drift from its buttons: a pause during a
 * crossfade that left the next song sounding was one such drift.
 */
import {beforeAll, beforeEach, expect, jest, test} from '@jest/globals';

const mockPlayer = {
  isRunning: jest.fn(() => true),
  pause: jest.fn(async () => undefined),
  playWithFade: jest.fn(async () => undefined),
  seekTo: jest.fn(async () => undefined),
  skipNext: jest.fn(async () => undefined),
  skipPrevious: jest.fn(async () => undefined),
  stop: jest.fn(async () => undefined),
  topUpFromRadio: jest.fn(async () => undefined),
};
jest.mock('../src/player', () => mockPlayer);

const mockHandlers: Record<string, (e: any) => unknown> = {};
const mockEngine = {
  addEventListener: (e: string, cb: (e: any) => unknown) => {
    mockHandlers[e] = cb;
  },
  getPlaybackState: async () => ({state: 'playing'}),
  pause: jest.fn(async () => undefined),
  reset: jest.fn(async () => undefined),
  skipToNext: jest.fn(async () => undefined),
  skipToPrevious: jest.fn(async () => undefined),
  getQueue: async () => [],
  getActiveTrackIndex: async () => 0,
};
jest.mock('react-native-track-player', () => ({
  __esModule: true,
  default: mockEngine,
  Event: new Proxy({}, {get: (_, name) => name}),
}));
jest.mock('../src/duckState', () => ({
  setPausedByDuck: () => undefined,
  wasPausedByDuck: () => false,
}));

beforeAll(async () => {
  await require('../src/playbackService')();
});
beforeEach(() => {
  jest.clearAllMocks();
});

test('pause goes through the player, which silences a crossfade', () => {
  mockHandlers.RemotePause({});
  expect(mockPlayer.pause).toHaveBeenCalled();
  expect(mockEngine.pause).not.toHaveBeenCalled();
});

test('losing audio focus pauses the same way', async () => {
  await mockHandlers.RemoteDuck({paused: true, permanent: false});
  expect(mockPlayer.pause).toHaveBeenCalled();
  expect(mockEngine.pause).not.toHaveBeenCalled();
});

test('next and previous are the app skips, not bare engine calls', () => {
  mockHandlers.RemoteNext({});
  mockHandlers.RemotePrevious({});
  expect(mockPlayer.skipNext).toHaveBeenCalled();
  expect(mockPlayer.skipPrevious).toHaveBeenCalled();
  expect(mockEngine.skipToNext).not.toHaveBeenCalled();
  expect(mockEngine.skipToPrevious).not.toHaveBeenCalled();
});

test('stop closes out the listen instead of a bare reset', () => {
  mockHandlers.RemoteStop({});
  expect(mockPlayer.stop).toHaveBeenCalled();
  expect(mockEngine.reset).not.toHaveBeenCalled();
});
