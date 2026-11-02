/**
 * With no internet the screen is built from what is on the phone. A list shows
 * only the songs that can play, and says how many of them that is.
 */
import {beforeEach, expect, jest, test} from '@jest/globals';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: async () => null,
  setItem: async () => undefined,
  removeItem: async () => undefined,
}));

import type {Track} from '../src/backend';
import {setLocalFiles} from '../src/localFiles';
import {
  albumShelves,
  artistShelves,
  listShelves,
  recentShelf,
} from '../src/offlineShelves';

const file = (title: string, artist: string, album = ''): Track =>
  ({title, artist, album, file_path: `/music/${title}.m4a`} as Track);
const catalog = (title: string, artist: string): Track =>
  ({title, artist, sources: {jiosaavn: {url: `js://${title}`}}} as Track);

const downloads = [
  file('Kesariya', 'Pritam, Arijit Singh', 'Brahmastra'),
  file('Deva Deva', 'Pritam, Arijit Singh', 'Brahmastra'),
  file('Tum Hi Ho', 'Mithoon, Arijit Singh', 'Aashiqui 2'),
];

beforeEach(() => setLocalFiles(downloads));

test('an album needs two songs on the phone', () => {
  const shelves = albumShelves(downloads);
  expect(shelves.map(s => s.title)).toEqual(['Brahmastra']);
  expect(shelves[0].subtitle).toBe('2 songs');
});

test('a song sits on its first credited artist', () => {
  expect(artistShelves(downloads).map(s => s.title)).toEqual(['Pritam']);
});

test('a playlist counts and keeps only what can play', () => {
  const [shelf] = listShelves(
    [
      {
        key: 'pl:1',
        name: 'Roadtrip',
        tracks: [
          catalog('Kesariya', 'Pritam, Arijit Singh'),
          catalog('Not Saved', 'Nobody'),
        ],
      },
    ],
    downloads,
  );
  expect(shelf.subtitle).toBe('1 of 2 songs');
  expect(shelf.tracks.map(t => t.file_path)).toEqual(['/music/Kesariya.m4a']);
});

test('a list with nothing on the phone is left out', () => {
  expect(
    listShelves(
      [{key: 'pl:2', name: 'Empty', tracks: [catalog('No', 'One')]}],
      downloads,
    ),
  ).toEqual([]);
});

test('recents are the downloaded ones, once each', () => {
  const song = catalog('Tum Hi Ho', 'Mithoon, Arijit Singh');
  const list = recentShelf(
    [song, catalog('Not Saved', 'Nobody'), song],
    downloads,
  );
  expect(list.map(t => t.title)).toEqual(['Tum Hi Ho']);
});
