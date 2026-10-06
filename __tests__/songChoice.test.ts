/**
 * "Wrong song?" remembers the copy you picked for a song, everywhere. These
 * pin what that promise rests on: the pick replaces the song by title and
 * artist (not by the copy's own identity, which differs per source), a
 * downloaded file is never swapped behind your back, Undo can put the
 * previous choice back exactly, and "other copies" are the song's other
 * sources, never the one playing.
 */
import {expect, jest, test} from '@jest/globals';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: async () => null,
  setItem: async () => undefined,
  removeItem: async () => undefined,
}));

import type {Track} from '../src/backend';
import {chosenCopy, otherCopies, sameCopy, setChoice} from '../src/songChoice';

const song = (over: Partial<Track> = {}): Track =>
  ({
    title: 'Kesariya',
    artist: 'Arijit Singh',
    sources: {
      soundcloud: {url: 'sc://lofi-flip'},
      jiosaavn: {url: 'js://brahmastra'},
    },
    primary_source: 'soundcloud',
    playable_source: 'soundcloud',
    ...over,
  }) as Track;

test('a pick plays for that song everywhere, whatever copy the list holds', () => {
  const wrong = song();
  const right = {...song(), primary_source: 'jiosaavn', playable_source: 'jiosaavn'} as Track;
  expect(chosenCopy(wrong)).toBe(wrong);
  expect(setChoice(wrong, right)).toBeNull();
  expect(chosenCopy(wrong)).toBe(right);
  // Another list's copy of the same song, with its own ISRC: still the pick.
  expect(chosenCopy(song({isrc: 'INX123'}))).toBe(right);
  // A different song is untouched.
  const other = song({title: 'Ilahi'});
  expect(chosenCopy(other)).toBe(other);
});

test('a downloaded file is never swapped for a stream', () => {
  const file = song({file_path: '/Music/Relaxify/Kesariya.m4a'});
  expect(chosenCopy(file)).toBe(file);
});

test('Undo puts back exactly what was chosen before', () => {
  const a = song({title: 'Tum Hi Ho'});
  const first = {...a, playable_source: 'jiosaavn'} as Track;
  const second = {...a, title: 'Tum Hi Ho (Unplugged)'} as Track;
  setChoice(a, first);
  const before = setChoice(a, second);
  expect(before).toBe(first);
  setChoice(a, before); // Undo
  expect(chosenCopy(a)).toBe(first);
  setChoice(a, null); // no choice at all
  expect(chosenCopy(a)).toBe(a);
});

test('other copies are the other sources, never the one playing', () => {
  const t = song();
  const copies = otherCopies(t);
  expect(copies.map(c => c.playable_source)).toEqual(['jiosaavn']);
  expect(sameCopy(copies[0], t)).toBe(false);
  expect(sameCopy({...t} as Track, t)).toBe(true);
});
