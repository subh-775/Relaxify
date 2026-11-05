/**
 * Which of the radio's picks play, and in what order, for THIS listener.
 *
 * The engine's radio is two recommenders built on millions of listeners
 * (JioSaavn's station and YouTube Music's mix for the song playing). Good
 * at "what goes with this song", blind to who is listening: a song skipped
 * every time it came round came round again, and an artist never once
 * listened through led the next eight just as often as a favourite.
 *
 * This keeps the recommenders' order as the backbone and moves picks by what
 * this phone has seen: songs and artists skipped in the first seconds go
 * back or out, ones heard to the end and liked come forward. The nudges are
 * small next to the order on purpose: the radio should still sound like the
 * song that started it, not like the listener's top ten.
 *
 * Pure, so it is tested without a phone; taste.ts keeps the record.
 */
import type {Track} from './backend';
import {getDownloadKey, splitArtists} from './tracks';

/** What a song or an artist has done on this phone: skipped (a skip by the
 *  listener before it earned a play) and finished (heard to the end). */
export type Mark = {s: number; f: number; last: number};

export type Signals = {
  songs: Record<string, Mark>;
  artists: Record<string, Mark>;
  /** Liked songs' keys (getDownloadKey). */
  liked: Set<string>;
  /** Lowercased names of liked songs' artists. */
  likedArtists: Set<string>;
  /** Plays per lowercased artist name (stats.ts). */
  artistPlays: Record<string, number>;
  /** Played lately: go to the back, not out. */
  recent: Set<string>;
  /** Artists skipped in this sitting: "not now", whatever their history. */
  skippedNow: Set<string>;
};

/** Each place down the recommenders' list costs this much. */
const PLACE = 1;
/** A song skipped this many times more than finished is not played again. */
const DROP_SONG_SKIPS = 2;
const SONG_SKIP = 8;
const SONG_FINISH = 2;
/** An artist skipped this often, and far more than finished, is pushed back. */
const ARTIST_SKIPS = 3;
const ARTIST_AVOID = 10;
const ARTIST_SKIP = 2;
const ARTIST_FINISH = 1.5;
const LIKED_SONG = 3;
const LIKED_ARTIST = 3;
/** Plays count up to this much, slowly (log): a favourite, not a loop. */
const PLAYS_MAX = 5;
const SKIPPED_NOW = 15;
const RECENT = 12;

const lead = (artist?: string) =>
  splitArtists(artist).map(a => a.toLowerCase());

/** How much this listener's history moves one pick, or null to leave it out. */
export function nudge(t: Track, sig: Signals): number | null {
  const key = getDownloadKey(t);
  const song = sig.songs[key];
  if (song && song.s >= DROP_SONG_SKIPS && song.s > song.f) {
    return null;
  }
  let n = 0;
  if (song) {
    n += -SONG_SKIP * song.s + SONG_FINISH * Math.min(song.f, 3);
  }
  if (sig.liked.has(key)) {
    n += LIKED_SONG;
  }
  const names = lead(t.artist);
  // The credited artist the listener knows best speaks for the song: a duet
  // with a favourite is not held back by the stranger beside them.
  let best = -Infinity;
  for (const a of names) {
    const m = sig.artists[a];
    let v = 0;
    if (m) {
      v +=
        m.s >= ARTIST_SKIPS && m.s > 2 * m.f
          ? -ARTIST_AVOID
          : -ARTIST_SKIP * Math.min(m.s, 3) + ARTIST_FINISH * Math.min(m.f, 4);
    }
    if (sig.likedArtists.has(a)) {
      v += LIKED_ARTIST;
    }
    const plays = sig.artistPlays[a] ?? 0;
    if (plays > 0) {
      v += Math.min(PLAYS_MAX, Math.log2(1 + plays));
    }
    best = Math.max(best, v);
  }
  if (Number.isFinite(best)) {
    n += best;
  }
  if (names.some(a => sig.skippedNow.has(a))) {
    n -= SKIPPED_NOW;
  }
  if (sig.recent.has(key)) {
    n -= RECENT;
  }
  return n;
}

/** One artist however a source writes them: "Kaneko Ayano", "kanekoayano". */
export function artistKey(name: string): string {
  return name
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}_]+/gu, '');
}

/**
 * The picks in the order to play them: the recommenders' order, moved by
 * this listener's history, with songs they keep skipping left out.
 * `bonus` adds to a pick's score by key (two seeds agreeing on a song).
 *
 * `perArtist`: how many of the first `window` may share a lead artist; the
 * rest wait behind. Five of eight picks by the seed's own artist read as
 * their album, not a radio.
 */
export function rankRadio(
  picks: Track[],
  sig: Signals,
  bonus: Record<string, number> = {},
  perArtist = 2,
  window = 8,
): Track[] {
  const scored: {t: Track; v: number; i: number}[] = [];
  picks.forEach((t, i) => {
    const n = nudge(t, sig);
    if (n !== null) {
      scored.push({t, v: -PLACE * i + n + (bonus[getDownloadKey(t)] ?? 0), i});
    }
  });
  const ranked = scored.sort((a, b) => b.v - a.v || a.i - b.i).map(x => x.t);
  const first: Track[] = [];
  const later: Track[] = [];
  const count = new Map<string, number>();
  for (const t of ranked) {
    const a = artistKey(splitArtists(t.artist)[0] ?? '');
    const n = count.get(a) ?? 0;
    if (first.length < window && (!a || n < perArtist)) {
      count.set(a, n + 1);
      first.push(t);
    } else {
      later.push(t);
    }
  }
  return [...first, ...later];
}
