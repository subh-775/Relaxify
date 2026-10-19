/**
 * Which doodle a day gets: a festival on its days (including one that wraps
 * the new year), otherwise an everyday one that comes round once per run and
 * never shows two days running.
 */
import {expect, jest, test} from '@jest/globals';

jest.mock('react-native', () => ({AppState: {addEventListener: () => {}}, Image: {}}));
jest.mock('@react-native-async-storage/async-storage', () => ({}));

// NB: below the mocks — jest hoists jest.mock().
import {everydayOn, festivalOn, pickFor, type Manifest} from '../src/doodle';

const festivals = [
  {id: 'diw', caption: 'Happy Diwali', from: '2026-11-06', to: '2026-11-10'},
  {id: 'ny', caption: 'Happy New Year', md: ['12-31', '01-01'] as [string, string]},
];

test('festival windows, dated and yearly, the new year wrapping', () => {
  expect(festivalOn('2026-11-08', festivals)?.id).toBe('diw');
  expect(festivalOn('2026-11-11', festivals)).toBeUndefined();
  expect(festivalOn('2026-12-31', festivals)?.id).toBe('ny');
  expect(festivalOn('2027-01-01', festivals)?.id).toBe('ny');
  expect(festivalOn('2027-01-02', festivals)).toBeUndefined();
});

test('every everyday doodle once per run, never twice running', () => {
  const list = Array.from({length: 26}, (_, i) => i);
  const days = (from: string, n: number) =>
    Array.from({length: n}, (_, i) => new Date(Date.parse(from + 'T00:00:00Z') + i * 864e5).toISOString().slice(0, 10));
  const seq = days('2026-01-01', 26 * 12).map(d => everydayOn(d, list));
  for (let i = 1; i < seq.length; i++) {
    expect(seq[i]).not.toBe(seq[i - 1]);
  }
  // Runs are aligned to day numbers, so check whole runs from a run start.
  const start = seq.findIndex((_, i) => {
    const d = Math.floor(Date.parse(days('2026-01-01', i + 1)[i] + 'T00:00:00Z') / 864e5);
    return d % 26 === 0;
  });
  for (let r = start; r + 26 <= seq.length; r += 26) {
    expect(new Set(seq.slice(r, r + 26)).size).toBe(26);
  }
});

test('the pick names its caption and full image urls', () => {
  const m: Manifest = {
    version: 1,
    base: 'https://x/doodles/',
    width: 360,
    height: 64,
    doodles: [
      {id: 'diw', name: 'Diwali', kind: 'fest', anim: 'd/diw.webp', still: 'd/diw.s.webp', accent: 6},
      {id: 'vin', name: 'Vinyl', kind: 'every', anim: 'd/vin.webp', still: 'd/vin.s.webp', accent: 0},
    ],
    festivals,
  };
  expect(pickFor('2026-11-08', m)).toMatchObject({caption: 'Happy Diwali', anim: 'https://x/doodles/d/diw.webp'});
  expect(pickFor('2026-10-22', m)).toMatchObject({caption: "Today's doodle: Vinyl", aspect: 360 / 64});
});
