/**
 * An import must always end or say it is stuck. It used to poll a silent
 * engine for ever, showing "0 found" with no way out; and a cancel keeps what
 * was found for the person to save or discard.
 */
import {beforeEach, expect, jest, test} from '@jest/globals';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: async () => null,
  setItem: async () => undefined,
  removeItem: async () => undefined,
}));
jest.mock('../src/analytics', () => ({logEvent: () => {}}));
jest.mock('../src/toast', () => ({toast: () => {}}));

const mockImport = jest.fn<(url: string, cancel?: boolean) => Promise<any>>();
jest.mock('../src/backend', () => ({
  importSpotify: (url: string, cancel?: boolean) => mockImport(url, cancel),
}));

import {
  BAD_LINK,
  PRIVATE_LIST,
  STALL_MS,
  importSourceName,
  isImportUrl,
  cancelImport,
  dismissImport,
  retryImport,
  startImport,
  useSpotifyImport,
} from '../src/spotifyImport';

// useSpotifyImport is useSyncExternalStore; outside React, read it directly.
jest.mock('react', () => ({
  ...(jest.requireActual('react') as object),
  useSyncExternalStore: (_s: unknown, get: () => unknown) => get(),
}));
const useRead = (): any => useSpotifyImport();
const read = useRead;

const URL = 'https://open.spotify.com/playlist/abc';
const snap = (over: object) => ({
  name: 'Mix',
  image: '',
  total: 10,
  done: 0,
  matched: 0,
  tracks: [],
  missing: [],
  finished: false,
  error: null,
  ...over,
});

beforeEach(() => {
  jest.useFakeTimers();
  mockImport.mockReset();
  dismissImport();
});

const tick = async (ms: number) => {
  await jest.advanceTimersByTimeAsync(ms);
};

test('a silent engine ends the import with a reason instead of spinning', async () => {
  mockImport.mockRejectedValue(new Error('Network request failed'));
  startImport(URL);
  await tick(10_000);
  expect(read().finished).toBe(true);
  expect(read().error).toBeTruthy();
  const calls = mockImport.mock.calls.length;
  await tick(10_000);
  expect(mockImport.mock.calls.length).toBe(calls); // stopped asking
});

test('a link the engine rejects fails at once, as a bad link', async () => {
  mockImport.mockRejectedValue(new Error('/spotify/import -> HTTP 400'));
  startImport(URL);
  await tick(100);
  expect(read().error).toBe(BAD_LINK);
});

test('no progress for STALL_MS reads as stalled, still running', async () => {
  mockImport.mockResolvedValue(snap({done: 3}));
  startImport(URL);
  await tick(STALL_MS + 3000);
  expect(read().stalled).toBe(true);
  expect(read().finished).toBe(false);
});

test('cancel keeps the songs found so far; retry after nothing found starts over', async () => {
  mockImport.mockResolvedValue(snap({done: 4, matched: 2}));
  startImport(URL);
  await tick(100);
  mockImport.mockResolvedValueOnce(
    snap({done: 4, matched: 2, finished: true, cancelled: true, tracks: [{title: 'a'}, {title: 'b'}]}),
  );
  await cancelImport();
  expect(mockImport).toHaveBeenLastCalledWith(URL, true);
  expect(read().cancelled).toBe(true);
  expect(read().tracks).toHaveLength(2);

  dismissImport();
  mockImport.mockResolvedValue(snap({done: 10, finished: true}));
  startImport(URL);
  await tick(100);
  expect(read().finished).toBe(true);
  expect(read().matched).toBe(0);
  mockImport.mockClear();
  mockImport.mockResolvedValue(snap({done: 1}));
  retryImport();
  await tick(100);
  expect(mockImport).toHaveBeenCalled(); // the same link really runs again
  expect(read().finished).toBe(false);
});

test('YouTube and YouTube Music playlist links import; plain videos do not', () => {
  const list = 'PLGo6V7qE3jPAabcdefghijklmnopqrstuv';
  const music = `https://music.youtube.com/playlist?list=${list}&si=Ez5osjRN_N5`;
  expect(isImportUrl(music)).toBe(true);
  expect(isImportUrl(`https://www.youtube.com/playlist?list=${list}`)).toBe(true);
  expect(isImportUrl(`https://youtube.com/watch?v=x1&list=${list}`)).toBe(true);
  expect(isImportUrl(`youtu.be/x1?list=${list}`)).toBe(true);
  expect(isImportUrl('https://www.youtube.com/watch?v=x1')).toBe(false);
  expect(isImportUrl(`https://evil.example/playlist?list=${list}`)).toBe(false);
  expect(isImportUrl(URL)).toBe(true);
  expect(importSourceName(music)).toBe('YouTube Music');
  expect(importSourceName(`https://www.youtube.com/playlist?list=${list}`)).toBe('YouTube');
  expect(importSourceName(URL)).toBe('Spotify');
});

test('your own YouTube likes are refused with the reason, never sent to the engine', () => {
  mockImport.mockClear();
  startImport('https://music.youtube.com/playlist?list=LM');
  expect(read().error).toBe(PRIVATE_LIST);
  expect(read().finished).toBe(true);
  expect(mockImport).not.toHaveBeenCalled();
});
