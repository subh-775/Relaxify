/**
 * The resume point must be saved with no JS timer running: in the background
 * Android stops timers while the music plays on, and a phone that played two
 * songs with the screen off, then was swiped away, reopened two songs behind.
 * With fake timers that never advance (the background, in effect), a song
 * change and leaving the app must each still save, and save the RIGHT song.
 */
import {beforeEach, expect, jest, test} from '@jest/globals';
import TrackPlayer from 'react-native-track-player';
import {AppState} from 'react-native';
import {saveResume} from '../src/resume';
import {playTrack, setupPlayer} from '../src/player';
import type {Track} from '../src/backend';

jest.mock('react-native-track-player', () => {
  const names = new Proxy({}, {get: (_t, k) => String(k)});
  return {
    __esModule: true,
    default: {
      setupPlayer: jest.fn(async () => undefined),
      updateOptions: jest.fn(async () => undefined),
      setRepeatMode: jest.fn(async () => undefined),
      getQueue: jest.fn(async () => []),
      getActiveTrackIndex: jest.fn(async () => 1),
      getActiveTrack: jest.fn(async () => ({title: 'Song B', artist: 'A'})),
      getProgress: jest.fn(async () => ({position: 73, duration: 200})),
      getPlaybackState: jest.fn(async () => ({state: 'Playing'})),
      addEventListener: jest.fn(() => ({remove: () => undefined})),
      reset: jest.fn(async () => undefined),
      add: jest.fn(async () => undefined),
      setVolume: jest.fn(async () => undefined),
      play: jest.fn(async () => undefined),
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
  readResume: async () => null,
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
  applyAudioEffects: () => undefined,
  fadeInPlayer: async () => undefined,
  endCrossfade: async () => undefined,
  setCrossfade: async () => undefined,
  restorePlayerVolume: async () => undefined,
  fadeOutPlayer: async () => undefined,
}));
jest.mock('../src/duckState', () => ({setPausedByDuck: () => undefined}));
jest.mock('../src/sleepTimer', () => ({sleepMode: () => 'off', sleepTimerOnTrackChange: () => undefined}));
jest.mock('../src/recentlyPlayed', () => ({remember: () => undefined}));
jest.mock('../src/stats', () => ({recordPlay: () => undefined}));
jest.mock('../src/toast', () => ({toast: () => undefined}));
jest.mock('../src/widget', () => ({pushWidget: () => undefined, pushWidgetPlaying: () => undefined}));

const flush = () => new Promise(r => jest.requireActual<any>('timers').setImmediate(r));
const listeners = (name: string) =>
  (TrackPlayer.addEventListener as unknown as jest.Mock).mock.calls
    .filter(c => c[0] === name)
    .map(c => c[1] as (e: unknown) => unknown);

const song = (title: string) =>
  ({title, artist: 'A', sources: {jiosaavn: {url: `js://${title}`}}, playable_source: 'jiosaavn'}) as Track;

beforeEach(async () => {
  jest.useFakeTimers(); // never advanced: timers are frozen, as in the background
  await setupPlayer();
  // A real queue, so the save can find the playing song in it.
  await playTrack(song('Song B'), [song('Song A'), song('Song B')]);
  (saveResume as unknown as jest.Mock).mockClear();
});

test('a song change saves at once, with no timer', async () => {
  listeners('PlaybackActiveTrackChanged').forEach(l =>
    l({index: 1, track: {title: 'Song B', artist: 'A', _qid: 'q2'}, lastTrack: null}),
  );
  await flush();
  const forced = (saveResume as unknown as jest.Mock).mock.calls.filter(c => c[1] === true);
  expect(forced.length).toBeGreaterThan(0);
  expect(forced[0][0]).toMatchObject({position: 73, index: 1});
});

test('the background progress event keeps the second current', async () => {
  listeners('PlaybackProgressUpdated').forEach(l => l({position: 73}));
  await flush();
  expect(saveResume).toHaveBeenCalled();
});

test('leaving the app saves the exact second', async () => {
  const appState = (AppState.addEventListener as unknown as jest.Mock).mock.calls
    .filter(c => c[0] === 'change')
    .map(c => c[1] as (s: string) => void);
  appState.forEach(l => l('background'));
  await flush();
  const forced = (saveResume as unknown as jest.Mock).mock.calls.filter(c => c[1] === true);
  expect(forced.length).toBeGreaterThan(0);
  expect(forced[0][0]).toMatchObject({position: 73});
});
