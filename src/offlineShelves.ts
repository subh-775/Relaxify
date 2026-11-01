/**
 * The shelves of the offline screen: everything that can play right now, put
 * in the shapes people look for music in. Only songs on the phone count, so a
 * playlist reads "8 of 20 songs" and plays those eight.
 */
import type {Track} from './backend';
import {withLocalFile} from './localFiles';

export type Shelf = {
  key: string;
  title: string;
  subtitle: string;
  tracks: Track[];
};

const MAX_RECENT = 10;
/** One song is a song, not an album or an artist's shelf. */
const MIN_GROUP = 2;

const plural = (n: number) => `${n} song${n === 1 ? '' : 's'}`;

/** The first credit: "Pritam, Arijit Singh" belongs on Pritam's shelf once. */
function leadArtist(artist: string | undefined): string {
  return (artist ?? '').split(/,|&| x | feat\.| ft\./i)[0].trim();
}

/** These songs, as the downloaded copies of them, in order and without
 *  repeats. A list keeps its own copies with no cover from the file. */
function onPhone(tracks: Track[], downloads: Track[]): Track[] {
  const byPath = new Map(downloads.map(t => [t.file_path, t]));
  const seen = new Set<string>();
  const out: Track[] = [];
  tracks.forEach(t => {
    const path = withLocalFile(t).file_path;
    const copy = path ? byPath.get(path) : undefined;
    if (path && copy && !seen.has(path)) {
      seen.add(path);
      out.push(copy);
    }
  });
  return out;
}

function grouped(
  downloads: Track[],
  name: (t: Track) => string,
  prefix: string,
): Shelf[] {
  const groups = new Map<string, Track[]>();
  downloads.forEach(t => {
    const key = name(t);
    if (key) {
      groups.set(key, [...(groups.get(key) ?? []), t]);
    }
  });
  return Array.from(groups, ([title, tracks]) => ({
    key: `${prefix}:${title}`,
    title,
    subtitle: plural(tracks.length),
    tracks,
  }))
    .filter(s => s.tracks.length >= MIN_GROUP)
    .sort((a, b) => b.tracks.length - a.tracks.length);
}

export function recentShelf(recent: Track[], downloads: Track[]): Track[] {
  return onPhone(recent, downloads).slice(0, MAX_RECENT);
}

export function albumShelves(downloads: Track[]): Shelf[] {
  return grouped(downloads, t => (t.album ?? '').trim(), 'album');
}

export function artistShelves(downloads: Track[]): Shelf[] {
  return grouped(downloads, t => leadArtist(t.artist), 'artist');
}

/** Each list with at least one song on the phone. */
export function listShelves(
  lists: {key: string; name: string; tracks: Track[]}[],
  downloads: Track[],
): Shelf[] {
  return lists
    .map(l => {
      const tracks = onPhone(l.tracks, downloads);
      return {
        key: l.key,
        title: l.name,
        subtitle: `${tracks.length} of ${plural(l.tracks.length)}`,
        tracks,
      };
    })
    .filter(s => s.tracks.length > 0);
}
