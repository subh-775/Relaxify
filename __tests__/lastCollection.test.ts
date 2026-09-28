/**
 * The Continue card reopens the last playlist or album. Your own lists are
 * read live when opened, so they are kept without tracks; an album has no
 * other copy, so its tracks come along. Covers are the list's own, then its
 * songs', never repeated, at most three.
 */
import {expect, jest, test} from '@jest/globals';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: async () => null,
  setItem: async () => undefined,
}));
jest.mock('react-native', () => ({NativeModules: {}}));

import {snapshotCollection} from '../src/lastCollection';

const song = (n: number) =>
  ({title: `s${n}`, artist: 'a', artwork_url: `https://x/${n}.jpg`} as any);

test('an album keeps its tracks; your own playlist does not', () => {
  const album = snapshotCollection({
    id: 'album:X',
    kind: 'album',
    name: 'X',
    tracks: [song(1), song(2)],
  } as any);
  expect(album?.tracks).toHaveLength(2);
  const mine = snapshotCollection({
    id: 'pl:1',
    kind: 'userPlaylist',
    name: 'Mine',
    tracks: [song(1), song(2)],
  } as any);
  expect(mine?.tracks).toHaveLength(0);
});

test('covers: the list first, then songs, no repeats, three at most', () => {
  const snap = snapshotCollection({
    id: 'pl:2',
    kind: 'sourcePlaylist',
    name: 'Theirs',
    image: 'https://x/cover.jpg',
    tracks: [song(1), song(1), song(2), song(3), song(4)],
  } as any);
  expect(snap?.covers[0]).toBe('https://x/cover.jpg');
  expect(new Set(snap?.covers).size).toBe(snap?.covers.length);
  expect(snap?.covers.length).toBe(3);
});

test('an artist is never remembered', () => {
  expect(
    snapshotCollection({id: 'artist:Y', kind: 'artist', name: 'Y', tracks: []} as any),
  ).toBeNull();
});
