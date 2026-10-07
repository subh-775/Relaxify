/**
 * Shared playlists, against a fake database. What they rest on: a code or a
 * pasted message opens the playlist (a search word does not), every change
 * the owner sends carries a NEW proof (the rules refuse a stored one), what
 * travels has nothing from the phone's disk, a taken code is retried, a
 * link only previews until "Add to library", the same link never adds twice,
 * the copy is entirely the friend's, and old follows become such copies.
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
  addSharedPlaylist,
  addTrackToPlaylist,
  createPlaylist,
  fromStored,
  playlistFromLink,
  readPlaylists,
} from '../src/playlists';
import {
  codeIn,
  openShared,
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

test('a link previews; Add to library keeps one copy that is yours', async () => {
  mockCall.mockResolvedValueOnce({name: 'Indie', by: 'Riya', v: 1, tracks: [song('Ilahi')]});
  const before = readPlaylists().length;
  const c = await openShared('Relaxify https://x/p/?c=K7QX2M');
  expect(c).toMatchObject({kind: 'shared', name: 'Indie', shared: {code: 'K7QX2M'}});
  expect(readPlaylists()).toHaveLength(before); // opening saves nothing

  const id = addSharedPlaylist('K7QX2M', c.shared!.copy);
  expect(addSharedPlaylist('K7QX2M', c.shared!.copy)).toBe(id); // the same link twice
  expect(readPlaylists()).toHaveLength(before + 1);
  expect(playlistFromLink(readPlaylists(), 'K7QX2M')?.id).toBe(id);

  // Entirely theirs: editable, and nothing ever refreshes it from the owner.
  expect(addTrackToPlaylist(id, song('Safarnama'))).toBe(true);
  expect(readPlaylists().find(p => p.id === id)?.from).toEqual({code: 'K7QX2M', by: 'Riya'});
});

test('a playlist followed before v1.2.36 becomes the reader’s own copy', () => {
  const old = {
    id: 'pl_1',
    name: 'Indie',
    tracks: [],
    createdAt: 1,
    follow: {code: 'K7QX2M', by: 'Riya', v: 3, fresh: true},
  };
  const now = fromStored(old);
  expect(now).not.toHaveProperty('follow');
  expect(now.from).toEqual({code: 'K7QX2M', by: 'Riya'});
});

test('a wrong code says so', async () => {
  mockCall.mockResolvedValueOnce(null);
  await expect(openShared('ZZZZZZ')).rejects.toThrow('No shared playlist has that code');
  await expect(openShared('hello')).rejects.toThrow('six letters');
});
