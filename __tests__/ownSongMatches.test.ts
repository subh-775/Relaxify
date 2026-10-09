import {describe, expect, it} from '@jest/globals';

import {ownSongMatches, withLyric} from '../src/tracks';
import type {Suggestion, Track} from '../src/backend';

const t = (title: string, artist = 'Arijit Singh') => ({title, artist}) as Track;

describe('ownSongMatches', () => {
  const recents = [t('Kesariya'), t('Tum Hi Ho')];
  const likes = [t('Kesariya'), t('Apna Bana Le'), t('Chaleya')];
  const playlist = [t('Kesariyo Rang'), t('Mere Kesariya')];

  it('matches the start of the title or of a word, accents ignored', () => {
    expect(ownSongMatches('kes', [recents], 5).map(x => x.title)).toEqual([
      'Kesariya',
    ]);
    expect(ownSongMatches('bana', [likes]).map(x => x.title)).toEqual([
      'Apna Bana Le',
    ]);
    expect(ownSongMatches('chaléya', [likes]).map(x => x.title)).toEqual([
      'Chaleya',
    ]);
    // Inside a word is not a match.
    expect(ownSongMatches('aleya', [likes])).toEqual([]);
  });

  it('keeps list order, one row per song, at most max', () => {
    expect(
      ownSongMatches('kes', [recents, likes, playlist]).map(x => x.title),
    ).toEqual(['Kesariya', 'Kesariyo Rang']);
    expect(
      ownSongMatches('kes', [recents, likes, playlist], 5).map(x => x.title),
    ).toEqual(['Kesariya', 'Kesariyo Rang', 'Mere Kesariya']);
  });

  it('ignores the artist and anything under two letters', () => {
    expect(ownSongMatches('arij', [recents, likes])).toEqual([]);
    expect(ownSongMatches('k', [recents])).toEqual([]);
  });
});

describe('withLyric', () => {
  const s = (title: string, kind?: Suggestion['kind']): Suggestion => ({
    kind,
    title,
    artist: '',
  });
  const hit = s('Channa Mereya (From "Ae Dil Hai Mushkil")', 'lyric');

  it('goes after your own songs, before the rest', () => {
    const list = [s('Achha Lagta Hai', 'own'), s('Achha Chalta Hoon'), s('Duaa')];
    expect(withLyric(list, hit).map(x => x.kind ?? 'song')).toEqual([
      'own',
      'lyric',
      'song',
      'song',
    ]);
  });

  it('is left out when the first songs already have it', () => {
    const list = [s('Arijit Singh', 'artist'), s('Channa Mereya'), s('Duaa')];
    expect(withLyric(list, hit)).toBe(list);
  });
});
