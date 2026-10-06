/**
 * Shared playlists, against a fake database. What they rest on: a code or a
 * pasted message opens the playlist (a search word does not), every change
 * the owner sends carries a NEW proof (the rules refuse a stored one), what
 * travels has nothing from the phone's disk, a taken code is retried, a
 * follower's copy is theirs to read but not to edit while it is shared, and
 * stopping leaves it with them as an ordinary playlist.
 */
import {beforeEach, expect, jest, test} from '@jest/globals';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: async () => null,
  setItem: async () => undefined,
  removeItem: async () => undefined,
}));
jest.mock('../src/analytics', () => ({logEvent: () => {}, songParams: () => ({})}));

const mockCall = jest.fn<(path: string, method?: string, body?: any) => Promise<any>>();
jest.mock('../src/jam', () => {
  const {createStore} = jest.requireActual('../src/storage') as any;
  const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let n = 0;
  return {
    call: (path: string, method?: string, body?: unknown) => mockCall(path, method, body),
    newCode: () => ['AAAAAA', 'BBBBBB', 'CCCCCC'][n++ % 3],
    normalizeCode: (raw: string) =>
      raw.toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/O/g, '0').replace(/I/g, '1').slice(0, 6),
    validCode: (c: string) => c.length === 6 && [...c].every(ch => ALPHABET.includes(ch)),
    phoneName: () => 'Pixel 8',
    savedName: createStore('test.name', '', (r: unknown) => String(r ?? '')),
  };
});

import type {Track} from '../src/backend';
import {
  addTrackToPlaylist,
  createPlaylist,
  isFollowed,
  readPlaylists,
} from '../src/playlists';
import {
  codeIn,
  openShared,
  refreshFollowed,
  sharePlaylist,
  slimTrack,
  stopSharing,
} from '../src/sharedPlaylists';

const song = (title: string, over: Partial<Track> = {}): Track =>
  ({
    title,
    artist: 'Arijit Singh',
    sources: {jiosaavn: {url: `js://${title}`}},
    primary_source: 'jiosaavn',
    playable_source: 'jiosaavn',
    ...over,
  }) as Track;

beforeEach(() => {
  mockCall.mockReset();
});

test('a code or the pasted message opens a playlist; a search word does not', () => {
  expect(codeIn('K7QX2M')).toBe('K7QX2M');
  expect(codeIn('k7qx2m')).toBe('K7QX2M'); // has a digit: a code
  expect(codeIn('BUTTER')).toBe('BUTTER'); // typed in capitals: a code
  expect(codeIn('butter')).toBe(''); // a search
  expect(
    codeIn(
      'Listen to Road trip with me on Relaxify 🎧 Open Relaxify, go to Your Library, tap the ticket and enter K7QX2M.',
    ),
  ).toBe('K7QX2M');
  expect(codeIn('arijit singh songs')).toBe('');
  // The link wins over a capitalised playlist name earlier in the message.
  expect(
    codeIn(
      'Listen to "CHILLS" with me on Relaxify 🎧\nhttps://subh-775.github.io/Relaxify/p/?c=K7QX2M\n\nenter K7QX2M.',
    ),
  ).toBe('K7QX2M');
});

test('what travels is playable and has nothing from the phone', () => {
  const s = slimTrack(
    song('Kesariya', {file_path: '/Music/k.m4a', album: undefined, artwork_url: ''} as any),
  );
  expect(s).not.toHaveProperty('file_path');
  expect(s).not.toHaveProperty('album'); // undefined is refused by the database
  expect(s).not.toHaveProperty('artwork_url');
  expect(s.sources).toEqual({jiosaavn: {url: 'js://Kesariya'}});
});

test('sharing sends a new proof every time, and retries a taken code', async () => {
  const pl = createPlaylist('Road trip')!;
  addTrackToPlaylist(pl.id, song('Kesariya'));
  mockCall
    .mockRejectedValueOnce(new Error('Jam PATCH 401')) // AAAAAA is taken
    .mockResolvedValue({});
  const code = await sharePlaylist(readPlaylists().find(p => p.id === pl.id)!);
  expect(code).toBe('BBBBBB');
  const [, , first] = mockCall.mock.calls[1];
  expect(first.proof).toBe(`${first.key}:${first.data.v}`);
  expect(first.data.tracks.map((t: Track) => t.title)).toEqual(['Kesariya']);

  await stopSharing(pl.id);
  const [path, , stop] = mockCall.mock.calls[2];
  expect(path).toBe('shared/BBBBBB');
  expect(stop.data).toBeNull();
  expect(stop.proof).not.toBe(first.proof); // new, or the rules refuse it
  expect(stop.proof.startsWith(`${first.key}:`)).toBe(true);
});

test('a followed playlist is read-only while shared, and stays when it stops', async () => {
  mockCall.mockResolvedValueOnce({name: 'Indie', by: 'Riya', v: 1, tracks: [song('Ilahi')]});
  const id = await openShared('Relaxify ... enter K7QX2M.');
  const followed = () => readPlaylists().find(p => p.id === id)!;
  expect(followed().follow).toMatchObject({code: 'K7QX2M', by: 'Riya', fresh: false});
  expect(isFollowed(followed())).toBe(true);
  expect(addTrackToPlaylist(id, song('Safarnama'))).toBe(false);

  // The owner adds a song: it arrives quietly, marked New.
  mockCall.mockResolvedValueOnce({
    name: 'Indie',
    by: 'Riya',
    v: 2,
    tracks: [song('Ilahi'), song('Safarnama')],
  });
  await refreshFollowed();
  expect(followed().tracks).toHaveLength(2);
  expect(followed().follow?.fresh).toBe(true);

  // The owner stops: the songs stay, and the playlist is yours now.
  mockCall.mockResolvedValueOnce(null);
  await refreshFollowed();
  expect(followed().follow?.stopped).toBe(true);
  expect(followed().tracks).toHaveLength(2);
  expect(addTrackToPlaylist(id, song('Tum Hi Ho'))).toBe(true);
});

test('a wrong code says so', async () => {
  mockCall.mockResolvedValueOnce(null);
  await expect(openShared('ZZZZZZ')).rejects.toThrow('No shared playlist has that code');
  await expect(openShared('hello')).rejects.toThrow('six letters');
});
