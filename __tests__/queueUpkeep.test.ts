/**
 * What keeps the queue honest once it is playing: radio top-ups, pruning radio
 * picks, and the block "add to queue" builds.
 *
 * The engine's queue and the app's `queueSource` are read by index against each
 * other, so a change to one that misses the other is silent until the wrong song
 * shows up. These drive the real player against a fake engine.
 */
import {beforeEach, expect, jest, test} from '@jest/globals';
import TrackPlayer from 'react-native-track-player';
import {
  addToQueue,
  dropQueuedRadio,
  onQueueChanged,
  peekAdjacentTrack,
  playTrack,
  setShuffle,
  sourceTrackFor,
  topUpFromRadio,
} from '../src/player';

jest.mock('react-native-track-player', () => {
  const queue: any[] = [];
  let active = 0;
  return {
    __esModule: true,
    default: {
      __queue: queue,
      __setActive: (i: number) => {
        active = i;
      },
      setupPlayer: async () => undefined,
      updateOptions: async () => undefined,
      setRepeatMode: async () => undefined,
      addEventListener: () => undefined,
      reset: async () => {
        queue.length = 0;
        active = 0;
      },
      add: async (items: any[], at?: number) => {
        if (typeof at === 'number') {
          queue.splice(at, 0, ...items);
          if (at <= active) {
            active += items.length;
          }
        } else {
          queue.push(...items);
        }
      },
      remove: async (indexes: number[]) => {
        [...indexes].sort((a, b) => b - a).forEach(i => queue.splice(i, 1));
      },
      removeUpcomingTracks: async () => {
        queue.length = active + 1;
      },
      play: async () => undefined,
      pause: async () => undefined,
      setRate: async () => undefined,
      setVolume: async () => undefined,
      getQueue: async () => [...queue],
      getActiveTrackIndex: async () => active,
      getActiveTrack: async () => queue[active] ?? null,
    },
    AppKilledPlaybackBehavior: {StopPlaybackAndRemoveNotification: 0},
    Capability: {},
    Event: {},
    RepeatMode: {Off: 0, Track: 1, Queue: 2},
    State: {Playing: 'playing', Paused: 'paused', Stopped: 'stopped'},
    TrackType: {HLS: 'hls'},
    usePlaybackState: () => ({state: 'playing'}),
    useProgress: () => ({position: 0, duration: 0}),
  };
});

let mockRadio: () => Promise<any[]> = async () => [];
jest.mock('../src/backend', () => ({
  apiUrl: (p: string) => `http://127.0.0.1:8765${p}`,
  getStreamInfo: async () => ({}),
  getRadio: () => mockRadio(),
}));
jest.mock('../src/store', () => ({
  currentQuality: () => 320,
  readSettings: () => ({autoplay: true, crossfadeDuration: 0, playbackRate: 1}),
}));
jest.mock('../src/audioEffects', () => ({
  applyAudioEffects: () => undefined,
  setCrossfade: async () => undefined,
  endCrossfade: () => undefined,
  fadeInPlayer: () => undefined,
  restorePlayerVolume: () => undefined,
}));
jest.mock('../src/duckState', () => ({setPausedByDuck: () => undefined}));
jest.mock('../src/sleepTimer', () => ({
  sleepTimerOnTrackChange: () => undefined,
  sleepTimerOnPause: () => undefined,
  sleepMode: () => 'off',
}));
jest.mock('../src/recentlyPlayed', () => ({
  remember: () => undefined,
  readRecentlyPlayed: () => [],
}));
jest.mock('../src/stats', () => ({recordPlay: () => undefined}));
jest.mock('../src/toast', () => ({toast: () => undefined}));
jest.mock('../src/widget', () => ({
  pushWidget: () => undefined,
  pushWidgetPlaying: () => undefined,
}));
jest.mock('../src/resume', () => ({
  readResume: async () => null,
  saveResume: () => undefined,
}));

const engine = TrackPlayer as unknown as {
  __queue: any[];
  __setActive: (i: number) => void;
};

const song = (title: string): any => ({
  title,
  artist: 'Someone',
  playable_source: 'jiosaavn',
  sources: {jiosaavn: {url: `https://cdn/${title}.mp3`}},
});
const titles = () => engine.__queue.map(t => t.title);

beforeEach(() => {
  mockRadio = async () => [];
});

test('a radio answer that lands after a new list started is dropped', async () => {
  await playTrack(song('Old'));
  let answer: (songs: any[]) => void = () => undefined;
  mockRadio = () => new Promise(resolve => (answer = resolve));

  const topUp = topUpFromRadio();
  await new Promise(resolve => setTimeout(resolve, 0));
  await playTrack(song('New 1'), [song('New 1'), song('New 2')]);
  answer([song('Similar to Old')]);
  await topUp;

  expect(titles()).toEqual(['New 1', 'New 2']);
});

test('radio picks reach the mirror and the open queue straight away', async () => {
  await playTrack(song('Last one'));
  mockRadio = async () => [song('Pick')];
  const heard = jest.fn();
  const off = onQueueChanged(heard);

  await topUpFromRadio();
  off();

  // The swipe reads this, and it has no other way to know the song exists.
  expect(peekAdjacentTrack(1)?.title).toBe('Pick');
  expect(heard).toHaveBeenCalled();
});

test('dropping radio keeps the ones already played', async () => {
  await playTrack(song('Mine'));
  mockRadio = async () => [song('Radio 1'), song('Radio 2'), song('Radio 3')];
  await topUpFromRadio();
  engine.__setActive(2); // Radio 2 is playing, Radio 1 has been heard

  await dropQueuedRadio();

  expect(titles()).toEqual(['Mine', 'Radio 1', 'Radio 2']);
  // Still known, so its badges, its resume point and its Download all work.
  expect(sourceTrackFor(engine.__queue[2])?.title).toBe('Radio 2');
  expect(sourceTrackFor(engine.__queue[1])?.title).toBe('Radio 1');
});

test('after a shuffle, add to queue lands right after the current song', async () => {
  const list = ['A', 'B', 'C', 'D'].map(song);
  await playTrack(list[0], list);
  await addToQueue(song('Queued'));
  await setShuffle(true);

  await addToQueue(song('Next up'));

  expect(titles()[1]).toBe('Next up');
});
