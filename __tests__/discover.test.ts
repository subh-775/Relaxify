/**
 * Discover's nine: mostly songs the listener has not heard, two or three of
 * their own most-played among them, never one they played a moment ago, and
 * seeded from different artists so it is not one artist's neighbourhood.
 */
import {expect, jest, test} from '@jest/globals';

jest.mock('react-native', () => ({NativeModules: {}}));
jest.mock('../src/backend', () => ({
  getDiscover: async () => [],
  waitForBackend: async () => true,
}));
jest.mock('../src/store', () => ({
  hydrate: async () => undefined,
  readLikes: () => [],
}));

import {
  composeDiscover,
  pickSeeds,
  trendingStandIn,
  GRID,
} from '../src/discover';
import {getDownloadKey} from '../src/tracks';

const song = (t: string, a = 'A') => ({title: t, artist: a} as any);
const stat = (t: string, a: string, count: number) => ({
  track: song(t, a),
  count,
  last: 0,
});
/** A fixed sequence, so a draw is repeatable. */
const seq = (...xs: number[]) => {
  let i = 0;
  return () => xs[i++ % xs.length];
};

test('nine: two or three favourites, the rest new, nothing new already heard', () => {
  const fresh = Array.from({length: 14}, (_, i) => song(`new${i}`, `N${i}`));
  const heardSong = song('old', 'O');
  const top = [
    stat('fav1', 'F', 9),
    stat('fav2', 'G', 5),
    stat('fav3', 'H', 3),
  ];
  const heard = new Set([
    getDownloadKey(heardSong),
    ...top.map(s => getDownloadKey(s.track)),
  ]);
  for (const r of [0.1, 0.9]) {
    const out = composeDiscover(
      [heardSong, ...fresh],
      top,
      heard,
      new Set(),
      seq(r, 0.3, 0.6, 0.2, 0.8),
    );
    expect(out).toHaveLength(GRID);
    const favs = out.filter(t => t.title.startsWith('fav'));
    expect(favs.length).toBe(r < 0.5 ? 2 : 3);
    expect(out.find(t => t.title === 'old')).toBeUndefined();
    expect(new Set(out.map(getDownloadKey)).size).toBe(GRID);
  }
});

test('never a favourite just played, nor one heard only once', () => {
  const top = [stat('now', 'X', 20), stat('once', 'Y', 1), stat('fav', 'Z', 4)];
  const out = composeDiscover(
    [],
    top,
    new Set(),
    new Set([getDownloadKey(song('now', 'X'))]),
    seq(0.4),
  );
  expect(out.map(t => t.title)).toEqual(['fav']);
});

test('short of new songs, favourites fill in', () => {
  const top = Array.from({length: 8}, (_, i) => stat(`f${i}`, `F${i}`, 10 - i));
  const out = composeDiscover(
    [song('n1', 'N'), song('n2', 'M')],
    top,
    new Set(),
    new Set(),
    Math.random,
  );
  expect(out).toHaveLength(GRID);
  expect(out.filter(t => t.title.startsWith('n'))).toHaveLength(2);
});

test('seeds: three, by three artists when the history has them', () => {
  const recent = [song('r1', 'A'), song('r2', 'A'), song('r3', 'B')];
  const top = [stat('t1', 'A', 9), stat('t2', 'C', 7), stat('t3', 'D', 2)];
  for (let i = 0; i < 20; i++) {
    const seeds = pickSeeds(top, recent, [song('l1', 'E')]);
    expect(seeds).toHaveLength(3);
    const artists = new Set(seeds.map(s => s.artist));
    expect(artists.size).toBe(3);
  }
});

test('seeds: one artist only still gives seeds; no history gives none', () => {
  const recent = [song('r1', 'A'), song('r2', 'A')];
  expect(pickSeeds([], recent, []).length).toBe(2);
  expect(pickSeeds([], [], [])).toEqual([]);
});

test('seeds: a second song by the same lead artist waits its turn', () => {
  // "Vishal-Shekhar & Sunidhi" leads with Vishal-Shekhar (a hyphen is part of
  // the name, "&" is not), so another artist's song is taken before it.
  const recent = [
    song('a', 'Vishal-Shekhar'),
    song('b', 'Vishal-Shekhar & Sunidhi Chauhan'),
  ];
  const seeds = pickSeeds([], recent, [song('c', 'Other')], () => 0);
  expect(seeds.map(t => t.title)).toEqual(['a', 'c', 'b']);
});

test('stand-in: the trending songs, shuffled, nine at most, no albums', () => {
  const tracks = Array.from({length: 12}, (_, i) => ({
    type: 'track',
    track: song(`t${i}`),
  }));
  const rows = [
    {title: 'New releases', items: [{type: 'track', track: song('x')}]},
    {title: 'Trending now', items: [...tracks, {type: 'album', name: 'Al'}]},
  ] as any;
  const out = trendingStandIn(rows);
  expect(out).toHaveLength(GRID);
  expect(out.every(t => t.title.startsWith('t'))).toBe(true);
  expect(trendingStandIn([])).toEqual([]);
});
