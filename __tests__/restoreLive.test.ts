/**
 * A second mount of the shell in the same process (the error screen's Reload,
 * or Android recreating the activity for a wallpaper or font-size change)
 * finds the engine already holding a song, maybe playing. Restoring from the
 * saved point reset it: the music stopped and jumped back.
 */
import {expect, jest, test} from '@jest/globals';
import TrackPlayer from 'react-native-track-player';
import {restoreSession} from '../src/player';

const saved = {title: 'Saved', artist: 'A', sources: {jiosaavn: {url: 'js://s'}}, playable_source: 'jiosaavn'};

jest.mock('react-native-track-player', () => {
  const names = new Proxy({}, {get: (_t, k) => String(k)});
  return {
    __esModule: true,
    default: {
      setupPlayer: jest.fn(async () => undefined),
      updateOptions: jest.fn(async () => undefined),
      setRepeatMode: jest.fn(async () => undefined),
      getQueue: jest.fn(async () => [{title: 'Live', artist: 'A', _qid: 'q1'}]),
      getActiveTrackIndex: jest.fn(async () => 0),
      getActiveTrack: jest.fn(async () => ({title: 'Live', artist: 'A', _qid: 'q1'})),
      addEventListener: jest.fn(() => ({remove: () => undefined})),
      reset: jest.fn(async () => undefined),
      add: jest.fn(async () => undefined),
      seekTo: jest.fn(async () => undefined),
      setRate: jest.fn(async () => undefined),
    },
    State: names,
    Event: names,
    Capability: names,
    RepeatMode: names,
    AppKilledPlaybackBehavior: names,
    usePlaybackState: () => ({}),
    useProgress: () => ({position: 0, duration: 0}),
  };
});
jest.mock('../src/resume', () => ({
  saveResume: jest.fn(),
  readResume: async () => ({track: saved, position: 40, queue: [saved], index: 0, savedAt: 0}),
  resumeIndex: () => 0,
  clearResume: () => undefined,
}));
jest.mock('../src/analytics', () => ({logEvent: jest.fn(), songParams: () => ({})}));
jest.mock('../src/backend', () => ({
  apiUrl: (p: string) => p,
  getStreamInfo: async () => ({}),
  getRadio: async () => [],
  setQualityCap: async () => undefined,
}));
jest.mock('../src/store', () => ({currentQuality: () => 320, readSettings: () => ({})}));
jest.mock('../src/audioEffects', () => ({
  guardTask: () => undefined,
  applyAudioEffects: async () => undefined,
}));
jest.mock('../src/widget', () => ({pushWidget: () => undefined, pushWidgetPlaying: () => undefined}));

test('a song already in the engine is kept, not reset to the saved point', async () => {
  expect(await restoreSession()).toBe(true);
  expect(TrackPlayer.reset).not.toHaveBeenCalled();
  expect(TrackPlayer.add).not.toHaveBeenCalled();
  expect(TrackPlayer.seekTo).not.toHaveBeenCalled();
});
