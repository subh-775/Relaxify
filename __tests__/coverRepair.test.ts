/**
 * Covers come from the service that plays the song, not from iTunes's separate
 * lookup — and songs that only kept the iTunes cover are found for repair.
 */
import {expect, jest, test} from '@jest/globals';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: () => Promise.resolve(null),
  setItem: () => Promise.resolve(),
}));
jest.mock('../src/analytics', () => ({logEvent: () => {}, songParams: () => ({})}));

import {needsRepair, withCover} from '../src/coverRepair';
import {getBestArtworkUrl} from '../src/tracks';

const SAAVN = 'https://c.saavncdn.com/1/Song-500x500.jpg';
const ITUNES = 'https://is1-ssl.mzstatic.com/image/thumb/x/600x600bb.jpg';
const LINK = 'https://www.jiosaavn.com/song/s/abc';

test("the playing source's cover beats iTunes's", () => {
  const t = {
    title: 'S',
    artist: 'A',
    artwork_url: ITUNES,
    artwork_urls: {'600': ITUNES, 'source:jiosaavn': SAAVN},
  };
  expect(getBestArtworkUrl(t)).toBe(SAAVN);
  expect(needsRepair({...t, sources: {jiosaavn: {url: LINK}}})).toBe('');
});

test('a song with only an iTunes cover is repaired from JioSaavn', () => {
  const t = {title: 'S', artist: 'A', artwork_url: ITUNES, sources: {jiosaavn: {url: LINK}}};
  expect(needsRepair(t)).toBe(LINK);
  const fixed = withCover(t, new Map([[LINK, SAAVN]]));
  expect(getBestArtworkUrl(fixed)).toBe(SAAVN);
  expect(needsRepair(fixed)).toBe('');
});

test('a YouTube-only song is left alone', () => {
  expect(needsRepair({title: 'S', artist: 'A', artwork_url: ITUNES, sources: {youtube: {url: 'y'}}})).toBe('');
});
