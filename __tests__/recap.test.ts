/**
 * The Recap's numbers. "This week" names its top song and artist from the play
 * log, so plays logged before songs carried an id must be skipped, not
 * credited to anything; "all time" reads the running counts instead.
 */
import {expect, jest, test} from '@jest/globals';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: async () => null,
  setItem: async () => undefined,
  removeItem: async () => undefined,
}));

import {buildRecap, hourLabel, personaFor, reminderText, streaks} from '../src/recap';
import type {Stats} from '../src/stats';

const HOUR = 3_600_000;
// Local 23:30 on some day, so hour buckets do not depend on the runner's zone.
const NOW = new Date(2026, 8, 27, 23, 30).getTime();

const song = (title: string, artist: string) => ({title, artist});
const stats: Stats = {
  tracks: {
    a: {
      track: song('Beedi', 'Vishal Bhardwaj, Sunidhi Chauhan') as any,
      count: 9,
      last: NOW,
    },
    b: {
      track: song('Rabba', 'Mohit Chauhan') as any,
      count: 12,
      last: NOW - HOUR,
    },
  },
  artists: {
    'mohit chauhan': {name: 'Mohit Chauhan', count: 12, last: NOW},
    'sunidhi chauhan': {name: 'Sunidhi Chauhan', count: 9, last: NOW},
    // First heard two days ago: a discovery. The others predate `first`.
    'vishal bhardwaj': {
      name: 'Vishal Bhardwaj',
      count: 2,
      last: NOW,
      first: NOW - 48 * HOUR,
    },
  },
  plays: 30,
  log: [
    {at: NOW - 1 * HOUR, full: 200, src: 'jiosaavn', k: 'a'},
    {at: NOW - 1.5 * HOUR, full: 200, src: 'jiosaavn', k: 'a'},
    {at: NOW - 2 * HOUR, full: 200, src: 'jiosaavn', k: 'b'},
    // Logged before plays carried an id: counts as a play, names nothing.
    {at: NOW - 30 * HOUR, full: 200, src: 'jiosaavn'},
    // Older than a week: outside every weekly figure.
    {at: NOW - 8 * 24 * HOUR, full: 200, src: 'jiosaavn', k: 'b'},
  ],
  days: {},
};

test('this week: top song and artist come from the id-carrying plays', () => {
  const r = buildRecap(stats, NOW, 'week');
  expect(r.topSong?.track.title).toBe('Beedi');
  expect(r.topSong?.count).toBe(2);
  // Beedi's two plays credit both its artists; Rabba credits Mohit once.
  expect(['Vishal Bhardwaj', 'Sunidhi Chauhan']).toContain(r.topArtist?.name);
  expect(r.topArtist?.count).toBe(2);
  expect(r.songs).toBe(4);
  expect(r.days).toHaveLength(7);
  expect(r.days?.[r.busiest].songs).toBe(3);
});

test('all time: the running counts, not the week', () => {
  const r = buildRecap(stats, NOW, 'all');
  expect(r.topSong?.track.title).toBe('Rabba');
  expect(r.topArtist?.name).toBe('Mohit Chauhan');
  expect(r.songs).toBe(30);
  expect(r.minutes).toBeNull();
});

test('the listening hour and its persona', () => {
  const r = buildRecap(stats, NOW, 'week');
  expect(r.peakHour).toBe(22); // 22:30 and 22:00 beat 21:30
  expect(r.persona?.name).toBe('Night owl');
  expect(personaFor(6).name).toBe('Early riser');
  expect(personaFor(13).name).toBe('Lunch-break listener');
  expect(personaFor(3).name).toBe('After-hours listener');
  expect(hourLabel(0)).toBe('12 am');
  expect(hourLabel(12)).toBe('12 pm');
  expect(hourLabel(23)).toBe('11 pm');
});

test('nothing played: no names, no persona', () => {
  const r = buildRecap(
    {tracks: {}, artists: {}, plays: 0, log: [], days: {}},
    NOW,
    'week',
  );
  expect(r.topSong).toBeNull();
  expect(r.topArtist).toBeNull();
  expect(r.persona).toBeNull();
  expect(r.busiest).toBe(-1);
});

test('this week: top five, discoveries, on repeat and last week', () => {
  const r = buildRecap(stats, NOW, 'week');
  expect(r.topSongs.map(t => t.track.title)).toEqual(['Beedi', 'Rabba']);
  expect(r.topArtists.length).toBe(3);
  expect(r.discoveries.map(a => a.name)).toEqual(['Vishal Bhardwaj']);
  expect(r.onRepeat).toBeNull(); // two plays in a day is not "on repeat"
  expect(r.lastMinutes).toBe(3); // the one play 8 days ago, capped at 200 s
});

test('streaks: a run ending yesterday is still alive, gaps break it', () => {
  const days = {
    '2026-09-20': 1,
    '2026-09-21': 4,
    '2026-09-22': 2,
    '2026-09-25': 1,
    '2026-09-26': 3,
  };
  expect(streaks(days, NOW)).toEqual({streak: 2, best: 3});
  expect(streaks({...days, '2026-09-27': 1}, NOW).streak).toBe(3);
  expect(streaks({}, NOW)).toEqual({streak: 0, best: 0});
});

test("Sunday's notification: the week's count and top song, silent when empty", () => {
  expect(reminderText(buildRecap(stats, NOW, 'week'))).toBe(
    '4 songs this week, most of all Beedi. Tap for your Recap.',
  );
  const empty = {tracks: {}, artists: {}, plays: 0, log: [], days: {}};
  expect(reminderText(buildRecap(empty, NOW, 'week'))).toBe('');
});
