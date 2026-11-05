import {expect, test} from '@jest/globals';

import {releaseKind, releaseTitle} from '../src/collections';

const songs = (n: number, min: number) =>
  Array.from({length: n}, () => ({duration_ms: min * 60_000}));

test("the store's own tag names it, and leaves the title", () => {
  expect(releaseKind('Alfaaz - Single', songs(1, 3))).toBe('Single');
  expect(releaseKind('Ocean Eyes - EP', songs(4, 4))).toBe('EP');
  expect(releaseTitle('Alfaaz - Single')).toBe('Alfaaz');
  expect(releaseTitle('Ocean Eyes - EP')).toBe('Ocean Eyes');
  expect(releaseTitle('Lover')).toBe('Lover');
  // A word that only ends in "ep" is not the tag.
  expect(releaseTitle('Deep')).toBe('Deep');
  expect(releaseKind('Deep', songs(12, 4))).toBe('Album');
});

test('untagged: by songs and length', () => {
  expect(releaseKind('Barsaat', songs(1, 3))).toBe('Single');
  expect(releaseKind('Four', songs(4, 5))).toBe('EP');
  expect(releaseKind('Currents', songs(13, 4))).toBe('Album');
  // Three long pieces are an album.
  expect(releaseKind('Epic', songs(3, 15))).toBe('Album');
});

test('still loading: the one seed song is not a single yet', () => {
  expect(releaseKind('Currents', songs(1, 4), false)).toBe('Album');
});
