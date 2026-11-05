import {describe, expect, it} from '@jest/globals';

import {albumKind, pickTopResult, rankAlbums} from '../src/searchTop';
import type {AlbumCard, Track} from '../src/backend';

const song = (title: string, artist: string, album = ''): Track =>
  ({title, artist, album, sources: {}} as unknown as Track);
const album = (
  name: string,
  artist: string,
  songs: number,
  exact = true,
): AlbumCard => ({name, artist, songs, album_id: name, exact});

describe('pickTopResult', () => {
  it('is the artist when the query is their name', () => {
    const top = pickTopResult(
      'the weeknd',
      [{name: 'The Weeknd'}],
      [album('After Hours', 'The Weeknd', 14, false)],
      [song('Blinding Lights', 'The Weeknd')],
    );
    expect(top?.kind).toBe('artist');
  });

  it("is the album named, when it is the top song's artist's", () => {
    const top = pickTopResult(
      'after hours',
      [],
      [album('After Hours', 'The Weeknd', 14)],
      [song('After Hours', 'The Weeknd')],
    );
    expect(top).toMatchObject({kind: 'album'});
  });

  it("is a soundtrack, by the top song's album", () => {
    const top = pickTopResult(
      'aashiqui 2',
      [],
      [album('Aashiqui 2', 'Various Artists', 10)],
      [song('Tum Hi Ho', 'Arijit Singh', 'Aashiqui 2')],
    );
    expect(top).toMatchObject({kind: 'album'});
  });

  it("stays the song when the album of that name is someone else's", () => {
    // The Beach Boys' Sunflower is not what "sunflower" means.
    const top = pickTopResult(
      'sunflower',
      [],
      [album('Sunflower', 'The Beach Boys', 12)],
      [song('Sunflower', 'Post Malone, Swae Lee')],
    );
    expect(top).toMatchObject({kind: 'song'});
  });

  it('is never a single over the song', () => {
    const top = pickTopResult(
      'creep',
      [],
      [album('Creep - Single', 'Radiohead', 1)],
      [song('Creep', 'Radiohead')],
    );
    expect(top).toMatchObject({kind: 'song'});
  });

  it('skips a version for the top song', () => {
    const live = {...song('Creep (Live)', 'Radiohead'), is_version: true};
    const top = pickTopResult(
      'creep',
      [],
      [],
      [live, song('Creep', 'Radiohead')],
    );
    expect(top?.kind === 'song' && top.track.title).toBe('Creep');
  });

  it('is nothing for nothing', () => {
    expect(pickTopResult('zzz', [], [], [])).toBeNull();
  });
});

describe('albumKind', () => {
  it('reads the store tag, then the size', () => {
    expect(albumKind(album('燦々 - EP', 'Ohm', 4))).toBe('EP');
    expect(albumKind(album('Creep - Single', 'x', 1))).toBe('Single');
    expect(albumKind(album('Creep', 'x', 1))).toBe('Single');
    expect(albumKind(album('After Hours', 'The Weeknd', 14))).toBe('Album');
    expect(albumKind(album('Unknown', 'x', 0))).toBe('Album');
    // No tag: one or two songs a single, three to five an EP.
    expect(albumKind(album('Ved', 'x', 4))).toBe('EP');
    expect(albumKind(album('Parachutes', 'Coldplay', 10))).toBe('Album');
    expect(albumKind(album('After Hours (Remixes)', 'The Weeknd', 6))).toBe(
      'Album',
    );
  });
});

describe('rankAlbums', () => {
  // The order the stores gave on the phone for "after hours".
  const listed = [
    album('After Hours - Single', 'charlieonnafriday', 1),
    album('After Hours (Remixes)', 'The Weeknd', 6, false),
    album('After Hours', 'The Weeknd', 14),
    album('After Hours - Single', 'DVBBS', 1),
  ];
  const songs = [
    song('After Hours', 'The Weeknd', 'After Hours'),
    song('After Hours', 'Yung Booke'),
  ];

  it("puts the top songs' artists' records first, in the engine's order", () => {
    expect(rankAlbums(listed, songs).map(a => a.artist)).toEqual([
      'The Weeknd',
      'The Weeknd',
      'charlieonnafriday',
      'DVBBS',
    ]);
  });

  it('makes the album the Top result even when listed third', () => {
    const top = pickTopResult('after hours', [], listed, songs);
    expect(top?.kind === 'album' && top.album.artist).toBe('The Weeknd');
  });

  it("does not vouch for a stranger's record of the album's name", () => {
    const only = [album('After Hours', 'charlieonnafriday', 5)];
    expect(pickTopResult('after hours', [], only, songs)?.kind).toBe('song');
  });

  it('keeps the order when no song speaks for any', () => {
    expect(rankAlbums(listed, [song('x', 'Nobody')])).toEqual(listed);
  });
});
