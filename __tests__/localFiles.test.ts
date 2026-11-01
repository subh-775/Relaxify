/**
 * A song on the phone plays from the phone, whichever list it was tapped in.
 * The copies in Liked Songs, a playlist or Search carry no file_path, and with
 * no internet each of those failed on a song that was sitting on the disk.
 */
import {beforeEach, expect, jest, test} from '@jest/globals';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: async () => null,
  setItem: async () => undefined,
  removeItem: async () => undefined,
}));

let mockOffline = false;
jest.mock('../src/offline', () => ({isOffline: () => mockOffline}));

import type {Track} from '../src/backend';
import {
  addLocalFile,
  dropLocalFiles,
  readLocalTracks,
  setLocalFiles,
  withLocalFile,
} from '../src/localFiles';
import {chosenCopy, otherCopies, setChoice} from '../src/songChoice';

const catalog = (over: Partial<Track> = {}): Track =>
  ({
    title: 'Tum Hi Ho',
    artist: 'Arijit Singh',
    sources: {jiosaavn: {url: 'js://song'}},
    ...over,
  } as Track);

const onDisk = (over: Partial<Track> = {}): Track =>
  ({
    title: 'Tum Hi Ho',
    artist: 'Arijit Singh',
    file_path: '/music/a.m4a',
    ...over,
  } as Track);

beforeEach(() => {
  mockOffline = false;
  setChoice(catalog(), null);
  setLocalFiles([]);
  dropLocalFiles(readLocalTracks());
});

test('a catalog copy finds its file, and keeps what it knows', () => {
  setLocalFiles([onDisk({has_embedded_art: true})]);
  const t = withLocalFile(catalog());
  expect(t.file_path).toBe('/music/a.m4a');
  expect(t.has_embedded_art).toBe(true);
  expect(t.sources?.jiosaavn?.url).toBe('js://song');
});

test('every queue gets the file, through chosenCopy', () => {
  setLocalFiles([onDisk()]);
  expect(chosenCopy(catalog()).file_path).toBe('/music/a.m4a');
});

test('a song not on the phone stays as it is', () => {
  setLocalFiles([onDisk({title: 'Another'})]);
  expect(withLocalFile(catalog()).file_path).toBeUndefined();
});

test('the same recording under another credit is found by its ISRC', () => {
  setLocalFiles([onDisk({title: 'Tum Hi Ho', artist: 'Mithoon', isrc: 'IN1'})]);
  expect(withLocalFile(catalog({isrc: 'IN1'})).file_path).toBe('/music/a.m4a');
});

test('a name the scan cannot read back still finds the file', () => {
  const asked = catalog({title: 'What? (Live: 2024)'});
  addLocalFile(asked, '/music/What_ (Live_ 2024) - Arijit Singh.m4a');
  // The scan reads a different title out of the file name.
  setLocalFiles([
    onDisk({
      title: 'What_ (Live_ 2024)',
      file_path: '/music/What_ (Live_ 2024) - Arijit Singh.m4a',
    }),
  ]);
  expect(withLocalFile(asked).file_path).toBe(
    '/music/What_ (Live_ 2024) - Arijit Singh.m4a',
  );
});

test('a file gone from the folder takes every name for it along', () => {
  addLocalFile(catalog(), '/music/a.m4a');
  expect(withLocalFile(catalog()).file_path).toBe('/music/a.m4a');
  setLocalFiles([]);
  expect(withLocalFile(catalog()).file_path).toBeUndefined();
});

test('a scan that reads no length keeps the one the catalog gave', () => {
  addLocalFile(catalog({duration_ms: 241000}), '/music/a.webm');
  setLocalFiles([onDisk({file_path: '/music/a.webm', duration_ms: 0})]);
  expect(readLocalTracks()[0].duration_ms).toBe(241000);
});

test('a download is listed at once, once', () => {
  addLocalFile(catalog(), '/music/a.m4a');
  addLocalFile(catalog(), '/music/a.m4a');
  expect(readLocalTracks()).toHaveLength(1);
});

test('removing a download works from a catalog copy too', () => {
  setLocalFiles([onDisk()]);
  dropLocalFiles([catalog()]);
  expect(readLocalTracks()).toHaveLength(0);
  expect(withLocalFile(catalog()).file_path).toBeUndefined();
});

test('your pick plays online; with no internet the file is what can', () => {
  const pick = catalog({sources: {soundcloud: {url: 'sc://pick'}}});
  setChoice(catalog(), pick);
  setLocalFiles([onDisk()]);
  expect(chosenCopy(catalog()).file_path).toBeUndefined();
  mockOffline = true;
  expect(chosenCopy(catalog()).file_path).toBe('/music/a.m4a');
});

test('another source for a downloaded song is that source, not the file', () => {
  setLocalFiles([onDisk()]);
  const copy = chosenCopy(
    catalog({
      primary_source: 'jiosaavn',
      sources: {jiosaavn: {url: 'js://a'}, soundcloud: {url: 'sc://b'}},
    }),
  );
  expect(copy.file_path).toBe('/music/a.m4a');
  const others = otherCopies(copy);
  expect(others).toHaveLength(1);
  expect(others[0].file_path).toBeUndefined();
});
