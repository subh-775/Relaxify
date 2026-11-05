import {describe, expect, it, jest} from '@jest/globals';

jest.mock('../src/backend', () => ({recheckCopies: jest.fn()}));
jest.mock('../src/playlists', () => ({
  mapPlaylistTrackLists: jest.fn(),
  readPlaylists: () => [],
}));
jest.mock('../src/store', () => ({
  mapLikeList: jest.fn(),
  readLikes: () => [],
  savingData: () => false,
}));
jest.mock('../src/songChoice', () => ({hasChoice: () => false}));

import {copyToCheck, withMoved} from '../src/copyRepair';
import type {Track} from '../src/backend';
import {getTrackId} from '../src/tracks';

const saavn = {
  title: 'Creep',
  artist: 'Radiohead',
  duration_ms: 238000,
  sources: {jiosaavn: {url: 'https://www.jiosaavn.com/song/creep/x'}},
  primary_source: 'jiosaavn',
};

describe('copyToCheck', () => {
  it('checks a saved JioSaavn copy by its page', () => {
    expect(copyToCheck(saavn as never)).toEqual({
      key: 'https://www.jiosaavn.com/song/creep/x',
      title: 'Creep',
      artist: 'Radiohead',
      duration_ms: 238000,
      url: 'https://www.jiosaavn.com/song/creep/x',
    });
  });

  it('leaves your own pick, a file and other sources alone', () => {
    expect(copyToCheck(saavn as never, () => true)).toBeNull();
    expect(copyToCheck({...saavn, file_path: '/x.m4a'} as never)).toBeNull();
    expect(
      copyToCheck({
        title: 'Creep',
        artist: 'Radiohead',
        sources: {youtube: {url: 'https://youtube.com/watch?v=a'}},
        primary_source: 'youtube',
      } as never),
    ).toBeNull();
  });
});

describe('withMoved', () => {
  const js = (title: string, artist: string): Track =>
    ({
      title,
      artist,
      sources: {jiosaavn: {url: `https://www.jiosaavn.com/song/${title}/x`}},
      playable_source: 'jiosaavn',
    }) as unknown as Track;

  it('puts the real recording in place, keeping the order', () => {
    const list = [js('A', 'x'), js('Creep', 'The Karaoke Channel'), js('B', 'y')];
    const moved = new Map([[getTrackId(list[1]), js('Creep', 'Radiohead')]]);
    expect(withMoved(list, moved).map(t => `${t.title}|${t.artist}`)).toEqual([
      'A|x',
      'Creep|Radiohead',
      'B|y',
    ]);
  });

  it('does not add a replacement the list already has', () => {
    const list = [js('Creep', 'Radiohead'), js('Creep', 'The Karaoke Channel')];
    const moved = new Map([[getTrackId(list[1]), js('Creep', 'Radiohead')]]);
    expect(withMoved(list, moved)).toHaveLength(1);
  });
});
