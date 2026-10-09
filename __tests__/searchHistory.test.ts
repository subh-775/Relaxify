/** Recent searches never keep a pasted link. */
import {expect, jest, test} from '@jest/globals';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: () => Promise.resolve(null),
  setItem: () => Promise.resolve(),
}));

import {hasLink} from '../src/searchHistory';

test('links are not searches', () => {
  for (const s of [
    'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M',
    'open.spotify.com/track/abc',
    'https://music.youtube.com/watch?v=xyz',
    'music.youtube.com/playlist?list=PL1',
    'youtu.be/abc',
    'listen to this https://spotify.link/x',
  ]) {
    expect([s, hasLink(s)]).toEqual([s, true]);
  }
});

test('words stay searches', () => {
  for (const s of ['arijit singh', 'youtube songs', 'spotify wrapped', 'lofi chill']) {
    expect(hasLink(s)).toBe(false);
  }
});
