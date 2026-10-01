/**
 * The first launch after an update showed "audio engine missing": RNTP
 * refused setup because the activity had not resumed yet, and that refusal
 * was taken as "no engine". It is retried now, and two callers share one setup.
 */
import {expect, jest, test} from '@jest/globals';
import TrackPlayer from 'react-native-track-player';
import {setupPlayer} from '../src/player';

jest.mock('react-native-track-player', () => ({
  __esModule: true,
  default: {
    setupPlayer: jest.fn(),
    updateOptions: async () => undefined,
    setRepeatMode: async () => undefined,
    addEventListener: () => undefined,
    getQueue: async () => [],
    getActiveTrackIndex: async () => 0,
  },
  AppKilledPlaybackBehavior: {StopPlaybackAndRemoveNotification: 0},
  Capability: {},
  Event: {},
  RepeatMode: {Off: 0, Track: 1, Queue: 2},
  State: {},
}));

jest.mock('../src/backend', () => ({
  apiUrl: (p: string) => p,
  getStreamInfo: async () => ({}),
  getRadio: async () => [],
  setQualityCap: async () => undefined,
}));

test('a background refusal is retried, and concurrent callers share it', async () => {
  const setup = TrackPlayer.setupPlayer as unknown as jest.Mock<any>;
  setup
    .mockRejectedValueOnce({code: 'android_cannot_setup_player_in_background'})
    .mockRejectedValueOnce({code: 'android_cannot_setup_player_in_background'})
    .mockResolvedValue(undefined);
  const [a, b] = await Promise.all([setupPlayer(), setupPlayer()]);
  expect(a).toBe(true);
  expect(b).toBe(true);
  expect(setup).toHaveBeenCalledTimes(3);
});
