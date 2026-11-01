/**
 * The sleep timer's fade pauses when the native ramp says it is over, never on
 * a JS timer: Android freezes those with the screen off, and the ramp's own
 * fail-safe then brings the music back at full volume.
 */
import {expect, jest, test} from '@jest/globals';
import TrackPlayer from 'react-native-track-player';
import {fadeToPause} from '../src/player';

jest.mock('react-native-track-player', () => ({
  __esModule: true,
  default: {
    pause: jest.fn(async () => undefined),
    setVolume: async () => undefined,
  },
  State: {},
  RepeatMode: {},
  Capability: {},
  Event: {},
  usePlaybackState: () => ({}),
  useProgress: () => ({}),
}));

let mockRampEnds: () => void = () => undefined;
jest.mock('../src/audioEffects', () => ({
  endCrossfade: () => undefined,
  restorePlayerVolume: () => undefined,
  fadeOutPlayer: () => new Promise<void>(resolve => (mockRampEnds = resolve)),
}));
jest.mock('../src/backend', () => ({}));
jest.mock('../src/store', () => ({}));
jest.mock('../src/duckState', () => ({setPausedByDuck: () => undefined}));
jest.mock('../src/sleepTimer', () => ({}));
jest.mock('../src/recentlyPlayed', () => ({}));
jest.mock('../src/stats', () => ({}));
jest.mock('../src/toast', () => ({}));
jest.mock('../src/widget', () => ({}));
jest.mock('../src/resume', () => ({}));

test('pauses on the ramp ending, with no timer involved', async () => {
  jest.useFakeTimers();
  const pause = TrackPlayer.pause as jest.Mock;

  const fading = fadeToPause(2500);
  await jest.advanceTimersByTimeAsync(10000);
  expect(pause).not.toHaveBeenCalled();

  // Timers frozen from here on: only the native answer can finish it.
  jest.useRealTimers();
  mockRampEnds();
  await fading;
  expect(pause).toHaveBeenCalledTimes(1);
});
