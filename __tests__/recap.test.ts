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

import {buildRecap, hourLabel, personaFor} from '../src/recap';
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
    {tracks: {}, artists: {}, plays: 0, log: []},
    NOW,
    'week',
  );
  expect(r.topSong).toBeNull();
  expect(r.topArtist).toBeNull();
  expect(r.persona).toBeNull();
  expect(r.busiest).toBe(-1);
});
