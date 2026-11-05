/**
 * What this listener skips and what they hear through, per song and per
 * artist: the radio's memory of them (radioRank.ts reads it).
 *
 * Every listen already ended as a skip, a partial or a full play
 * (listenRules.ts), and it went to analytics and nowhere else, so the radio
 * never learned anything. Kept on the phone only, bounded like stats.ts, and
 * forgotten slowly: a skip a year ago says little about today.
 *
 * Only a skip the listener made counts against a song: one that ended
 * because the app moved on (a crossfade, the queue ending) is no opinion.
 */
import {createStore} from './storage';
import type {Track} from './backend';
import {getDownloadKey, splitArtists} from './tracks';
import type {Mark, Signals} from './radioRank';
import {readLikes} from './store';
import {readStats, trim} from './stats';
import {readRecentlyPlayed} from './recentlyPlayed';

type Taste = {songs: Record<string, Mark>; artists: Record<string, Mark>};

const MAX_SONGS = 600;
const MAX_ARTISTS = 300;
/** Marks older than this count half; the history fades instead of ruling. */
const HALF_LIFE_MS = 60 * 24 * 60 * 60 * 1000;
/** "In this sitting": a skip this recent says "not now". */
const SITTING_MS = 45 * 60 * 1000;

const store = createStore<Taste>(
  'mp.taste.v1',
  {songs: {}, artists: {}},
  raw => {
    const r = (raw ?? {}) as Partial<Taste>;
    return {
      songs: r.songs && typeof r.songs === 'object' ? r.songs : {},
      artists: r.artists && typeof r.artists === 'object' ? r.artists : {},
    };
  },
);

/** Artists skipped lately, with when: in memory, a sitting's worth. */
const skippedAt = new Map<string, number>();

function bump(
  map: Record<string, Mark>,
  key: string,
  skip: boolean,
  now: number,
): Record<string, Mark> {
  const m = map[key] ?? {s: 0, f: 0, last: now};
  // Halve an old mark before adding to it: it fades with time.
  const fade = now - m.last > HALF_LIFE_MS ? 0.5 : 1;
  return {
    ...map,
    [key]: {
      s: m.s * fade + (skip ? 1 : 0),
      f: m.f * fade + (skip ? 0 : 1),
      last: now,
    },
  };
}

/** Trimmed to three quarters, not stats' half: this memory is slow to build. */
const KEEP = 0.75;

/** Mark a song and its artists: `songSkips` skips for the song (0 is a
 *  play heard through), one skip or one finish for each artist. */
function record(track: Track, songSkips: number, skip: boolean, now: number): void {
  const names = splitArtists(track.artist).map(a => a.toLowerCase());
  if (skip) {
    names.forEach(a => skippedAt.set(a, now));
  }
  store.update(prev => {
    const key = getDownloadKey(track);
    let songs = bump(prev.songs, key, songSkips > 0, now);
    for (let i = 1; i < songSkips; i++) {
      songs = bump(songs, key, true, now);
    }
    let artists = prev.artists;
    for (const a of names) {
      artists = bump(artists, a, skip, now);
    }
    return {
      songs: trim(songs, MAX_SONGS, KEEP),
      artists: trim(artists, MAX_ARTISTS, KEEP),
    };
  });
}

/**
 * One listen, as it ended. A skip counts only when the listener made it; a
 * full play counts however it ended. A partial play is no verdict either way.
 */
export function noteListen(
  track: Track,
  outcome: 'full' | 'partial' | 'skip',
  byUser: boolean,
  now = Date.now(),
): void {
  const skip = outcome === 'skip' && byUser;
  if (!track?.title || (!skip && outcome !== 'full')) {
    return;
  }
  record(track, skip ? 1 : 0, skip, now);
}

/**
 * A recommended song the listener took out of the queue before it played:
 * "not this one". Counts as two skips for the song, so the radio drops it
 * (radioRank drops a song skipped twice and never heard through), and as one
 * skip for its artist, so the artist is pushed down without being ruled out.
 */
export function noteDismissed(track: Track, now = Date.now()): void {
  if (!track?.title) {
    return;
  }
  record(track, 2, true, now);
}

/** Everything radioRank needs, read now. Never throws: a history that cannot
 *  be read is no history, and the radio still plays in its own order. */
export function radioSignals(now = Date.now()): Signals {
  try {
    return readSignals(now);
  } catch {
    return {
      songs: {},
      artists: {},
      liked: new Set(),
      likedArtists: new Set(),
      artistPlays: {},
      recent: new Set(),
      skippedNow: new Set(),
    };
  }
}

function readSignals(now: number): Signals {
  const {songs, artists} = store.get();
  const likes = readLikes();
  const likedArtists = new Set<string>();
  for (const t of likes) {
    splitArtists(t.artist).forEach(a => likedArtists.add(a.toLowerCase()));
  }
  const artistPlays: Record<string, number> = {};
  for (const [k, a] of Object.entries(readStats().artists)) {
    artistPlays[k] = a.count;
  }
  const skippedNow = new Set<string>();
  for (const [a, at] of skippedAt) {
    if (now - at < SITTING_MS) {
      skippedNow.add(a);
    }
  }
  return {
    songs,
    artists,
    liked: new Set(likes.map(getDownloadKey)),
    likedArtists,
    artistPlays,
    recent: new Set(readRecentlyPlayed().map(getDownloadKey)),
    skippedNow,
  };
}

/** Whether the listener has skipped this song more often than heard it
 *  through: not a song to find more like. */
export function skippedLast(track: Track): boolean {
  const m = store.get().songs[getDownloadKey(track)];
  return !!m && m.s > m.f;
}
