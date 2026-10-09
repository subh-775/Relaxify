/** Where a playlist came from, for its label. */
import {expect, jest, test} from '@jest/globals';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: () => Promise.resolve(null),
  setItem: () => Promise.resolve(),
}));
jest.mock('../src/analytics', () => ({logEvent: () => {}, songParams: () => ({})}));

import {playlistSource, type Playlist} from '../src/playlists';

const base: Playlist = {id: 'p', name: 'Mix', tracks: [], createdAt: 0};

test('each origin has its label, and one made here has none', () => {
  const imp = (url: string) => playlistSource({...base, importedFrom: {url, keys: []}});
  expect(imp('https://open.spotify.com/playlist/37i9')).toBe('spotify');
  expect(imp('https://music.youtube.com/playlist?list=PL1')).toBe('youtube_music');
  expect(imp('https://www.youtube.com/playlist?list=PL1')).toBe('youtube');
  expect(playlistSource({...base, from: {code: 'AR4E2X', by: 'Subh'}})).toBe('relaxify');
  expect(playlistSource(base)).toBe('');
  expect(playlistSource(undefined)).toBe('');
});
