/**
 * A Jam lines each phone up with the others by seeking it, and every seek
 * while playing passes through Buffering. Auto quality reads Playing ->
 * Buffering as the network stalling, so before markEngineSeek two Jam
 * corrections in three minutes told a follower on good Wi-Fi "Weak signal"
 * and dropped it to 160 kbps. Driven through setupPlayer's real listener, so
 * this pins the wiring, not just the helper.
 */
import {beforeEach, expect, jest, test} from '@jest/globals';
import TrackPlayer from 'react-native-track-player';
import {setQualityCap} from '../src/backend';
import {markEngineSeek, setupPlayer} from '../src/player';

jest.mock('react-native-track-player', () => {
  const names = new Proxy({}, {get: (_t, k) => String(k)});
  return {
    __esModule: true,
    default: {
      setupPlayer: jest.fn(async () => undefined),
      updateOptions: jest.fn(async () => undefined),
      setRepeatMode: jest.fn(async () => undefined),
      getQueue: jest.fn(async () => []),
      getActiveTrackIndex: jest.fn(async () => 0),
      getActiveTrack: jest.fn(async () => null),
      addEventListener: jest.fn(() => ({remove: () => undefined})),
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
jest.mock('../src/analytics', () => ({logEvent: jest.fn(), songParams: () => ({})}));
jest.mock('../src/backend', () => ({
  apiUrl: (p: string) => p,
  getStreamInfo: async () => ({}),
  getRadio: async () => [],
  setQualityCap: jest.fn(async () => undefined),
}));
// Streaming quality on Auto.
jest.mock('../src/store', () => ({currentQuality: () => 320, readSettings: () => ({audioQuality: 0})}));
jest.mock('../src/audioEffects', () => ({guardTask: () => undefined}));
jest.mock('../src/duckState', () => ({setPausedByDuck: () => undefined}));
jest.mock('../src/sleepTimer', () => ({sleepMode: () => 'off'}));
jest.mock('../src/recentlyPlayed', () => ({remember: () => undefined}));
jest.mock('../src/resume', () => ({}));
jest.mock('../src/stats', () => ({recordPlay: () => undefined}));
jest.mock('../src/toast', () => ({toast: () => undefined}));
jest.mock('../src/widget', () => ({pushWidget: () => undefined, pushWidgetPlaying: () => undefined}));

type Listener = (e: {state: string}) => void;
let emit: (state: string) => void;
const now = jest.spyOn(Date, 'now');
let clock = 1_000_000;

beforeEach(async () => {
  await setupPlayer();
  const add = TrackPlayer.addEventListener as unknown as jest.Mock;
  const onState = add.mock.calls
    .filter(c => c[0] === 'PlaybackState')
    .map(c => c[1] as Listener);
  emit = state => onState.forEach(l => l({state}));
});

/** One seek while playing, `jam` saying whether the Jam made it. */
function seekWhilePlaying(jam: boolean): void {
  clock += 60_000; // a minute apart: well inside the 3-minute stall window
  now.mockReturnValue(clock);
  emit('Playing');
  if (jam) {
    markEngineSeek();
  }
  emit('Buffering');
}

test('Jam alignment seeks never lower Auto quality', () => {
  seekWhilePlaying(true);
  seekWhilePlaying(true);
  seekWhilePlaying(true);
  expect(setQualityCap).not.toHaveBeenCalledWith(160);
});

test('two real stalls still do (the control)', () => {
  seekWhilePlaying(false);
  seekWhilePlaying(false);
  expect(setQualityCap).toHaveBeenCalledWith(160);
});
