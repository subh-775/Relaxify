/**
 * An artist photo is taken only when the lookup returns the artist we asked
 * for: a near miss would put a stranger's face on the Recap.
 */
import {expect, jest, test} from '@jest/globals';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: async () => null,
  setItem: async () => undefined,
}));
jest.mock('../src/backend', () => ({searchArtists: async () => []}));

import {sameArtist} from '../src/artistPhotos';

test('same artist, whatever the case and punctuation', () => {
  expect(sameArtist('Arijit Singh', 'arijit singh')).toBe(true);
  expect(sameArtist('A.R. Rahman', 'AR Rahman')).toBe(true);
  expect(sameArtist('King', 'King')).toBe(true);
});

test('a different artist is refused', () => {
  expect(sameArtist('King', 'Kingfisher')).toBe(false);
  expect(sameArtist('Arijit Singh', 'Sonu Nigam')).toBe(false);
  expect(sameArtist('', 'Anyone')).toBe(false);
});
