/**
 * Which one answer a search leads with, and what a release is called. Kept
 * apart from the cards that draw them, so they are tested without the UI.
 */
import {type AlbumCard, type ArtistCard, type Track} from './backend';
import {fold} from './tracks';
import {releaseTitle} from './collections';

export type TopResult =
  | {kind: 'artist'; artist: ArtistCard}
  | {kind: 'album'; album: AlbumCard}
  | {kind: 'song'; track: Track};

/** Each credited name, folded: "A, B & C" is three. */
function names(credit = ''): string[] {
  return credit
    .split(/,|&|\bfeat\.?|\bft\.?|\band\b|\bx\b/i)
    .map(n => fold(n).trim())
    .filter(Boolean);
}

/**
 * The one answer a search most likely means.
 *
 * An artist, when the query is their name. An album, when the query is its
 * name, it is a whole record, and it is the top song's own: its album, or by
 * its artist ("after hours" is The Weeknd's album; "sunflower" stays Post
 * Malone's song, not the Beach Boys' record of that name). Else the top song.
 */
export function pickTopResult(
  query: string,
  artists: ArtistCard[],
  albums: AlbumCard[],
  songs: Track[],
): TopResult | null {
  const q = fold(query).trim();
  const artist = artists[0];
  if (artist && fold(artist.name).trim() === q) {
    return {kind: 'artist', artist};
  }
  const song = songs.find(t => !t.is_version) ?? songs[0];
  // Any album of the list, not only the first: the stores' order put four
  // strangers' singles called "After Hours" before The Weeknd's album.
  const album =
    song && albums.find(a => a.exact && a.songs >= 4 && belongsTo(a, song));
  if (album) {
    return {kind: 'album', album};
  }
  return song ? {kind: 'song', track: song} : null;
}

/** The record is by the song's artist, or it is a soundtrack of many
 *  artists with the song's album's name. The name alone is not enough: a
 *  stranger's single called "After Hours" shares it with The Weeknd's album. */
function belongsTo(album: AlbumCard, song: Track): boolean {
  const theirs = names(album.artist);
  if (names(song.artist).some(n => theirs.includes(n))) {
    return true;
  }
  return (
    /various/i.test(album.artist) &&
    !!song.album &&
    fold(releaseTitle(song.album)) === fold(releaseTitle(album.name))
  );
}

/** How many of the top songs say who a search is about. */
const TELLING_SONGS = 5;

/**
 * Albums in the order the songs vouch for: those by the artists of the top
 * songs first, the higher the song the earlier, then the rest as the engine
 * ranked them.
 *
 * Neither store says how popular an album is, and the order they list them
 * in is a poor guess ("after hours": four strangers' singles before The
 * Weeknd's record on iTunes, and JioSaavn's order changes from one asking to
 * the next). The songs are ranked on far more, and they are already here.
 */
export function rankAlbums(albums: AlbumCard[], songs: Track[]): AlbumCard[] {
  const top = songs.filter(t => !t.is_version).slice(0, TELLING_SONGS);
  if (!top.length || albums.length < 2) {
    return albums;
  }
  const vouch = (a: AlbumCard) => {
    const i = top.findIndex(t => belongsTo(a, t));
    return i < 0 ? TELLING_SONGS : i;
  };
  return albums
    .map((a, i) => ({a, i, v: vouch(a)}))
    .sort((x, y) => x.v - y.v || x.i - y.i)
    .map(x => x.a);
}

/** What a release is, from its store tag or else its size: one or two songs
 *  a single, three to five an EP. An unknown size (0) is an album. One rule
 *  for search and the artist page, so a record is called the same in both. */
export function albumKind(a: {
  name: string;
  songs: number;
}): 'Album' | 'Single' | 'EP' {
  if (/[-–(]\s*ep\s*\)?\s*$/i.test(a.name)) {
    return 'EP';
  }
  if (/[-–(]\s*single\s*\)?\s*$/i.test(a.name)) {
    return 'Single';
  }
  if (a.songs > 0 && a.songs <= 2) {
    return 'Single';
  }
  if (a.songs > 0 && a.songs <= 5) {
    return 'EP';
  }
  return 'Album';
}
