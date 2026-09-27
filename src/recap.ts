/**
 * What the Recap says, worked out from the listening history on this phone.
 * Pure, so the arithmetic is tested without a screen; RecapScreen only draws it.
 *
 * Two spans. "This week" reads the play log, which keeps the last seven days
 * with each play's start time and song. "All time" reads the running counts
 * (top songs, top artists, total plays), which go back to the first play; the
 * log does not, so its listening hours are "lately" rather than all-time.
 */
import type {Track} from './backend';
import {dayKey, summarizeWeek, type Stats} from './stats';
import {splitArtists} from './tracks';

export type RecapMode = 'week' | 'all';

export type Persona = {name: string; line: string};

export type SongCount = {track: Track; count: number};
export type ArtistCount = {name: string; image?: string; count: number};

export type Recap = {
  mode: RecapMode;
  /** Songs played in the span. */
  songs: number;
  /** Minutes listened; this week only (the counts do not keep time). */
  minutes: number | null;
  topSong: SongCount | null;
  topArtist: ArtistCount | null;
  /** Up to five of each, most played first; [0] is topSong / topArtist. */
  topSongs: SongCount[];
  topArtists: ArtistCount[];
  /** The weekday (0 = Sunday) the top song was played most this week, or
   *  -1 when it was not played this week at all. */
  topSongDay: number;
  /** This week only: songs per day, oldest first, with each day's start. */
  days: {at: number; songs: number}[] | null;
  /** Index into `days` of the biggest day, or -1. */
  busiest: number;
  /** Plays per local hour of the day, 0-23, from the play log. */
  hours: number[];
  /** The busiest hour, or -1 when the log is empty. */
  peakHour: number;
  persona: Persona | null;
  /** This week: the most plays one song got in a single day, when that is
   *  at least three. */
  onRepeat: (SongCount & {day: number}) | null;
  /** This week: artists heard for the first time, most played first. */
  discoveries: ArtistCount[];
  /** Days in a row with music, ending today (or yesterday), and the longest. */
  streak: number;
  bestStreak: number;
  /** Minutes last week, for the comparison; null when last week is empty. */
  lastMinutes: number | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** "11 pm", "12 am", "7 am". */
export function hourLabel(h: number): string {
  const n = h % 12 === 0 ? 12 : h % 12;
  return `${n} ${h < 12 ? 'am' : 'pm'}`;
}

/** A name for the hour most of the listening happens in. Exported for tests. */
export function personaFor(hour: number): Persona {
  const at = `Most of your listening happens around ${hourLabel(hour)}.`;
  const name =
    hour >= 5 && hour < 9
      ? 'Early riser'
      : hour >= 9 && hour < 12
      ? 'Morning regular'
      : hour >= 12 && hour < 15
      ? 'Lunch-break listener'
      : hour >= 15 && hour < 18
      ? 'Afternoon drifter'
      : hour >= 18 && hour < 22
      ? 'Evening unwinder'
      : hour >= 22 || hour < 2
      ? 'Night owl'
      : 'After-hours listener';
  return {name, line: at};
}

function argmax(xs: number[]): number {
  let best = -1;
  for (let i = 0; i < xs.length; i++) {
    if (xs[i] > 0 && (best < 0 || xs[i] > xs[best])) {
      best = i;
    }
  }
  return best;
}

/** "YYYY-MM-DD" keys a day apart, walking back from `at`. */
function streakAt(days: Record<string, number>, at: number): number {
  let n = 0;
  const d = new Date(at);
  while (days[dayKey(d.getTime())]) {
    n += 1;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

/** The current run of days with music, and the longest one on record. */
export function streaks(
  days: Record<string, number>,
  now: number,
): {streak: number; best: number} {
  // A run that ended yesterday is still alive until today is over.
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const streak = streakAt(days, now) || streakAt(days, yesterday.getTime());
  let best = 0;
  let run = 0;
  let prev = '';
  for (const k of Object.keys(days).sort()) {
    if (!days[k]) {
      continue;
    }
    const d = new Date(`${k}T12:00:00`);
    d.setDate(d.getDate() - 1);
    run = prev === dayKey(d.getTime()) ? run + 1 : 1;
    best = Math.max(best, run);
    prev = k;
  }
  return {streak, best: Math.max(best, streak)};
}

/** The weekday `track` was played most in `week`, or -1. */
function weekdayOf(s: Stats, week: Stats['log'], track?: Track): number {
  if (!track) {
    return -1;
  }
  const k = Object.keys(s.tracks).find(id => s.tracks[id].track === track);
  const per = new Array<number>(7).fill(0);
  for (const e of week) {
    if (k && e.k === k) {
      per[new Date(e.at).getDay()] += 1;
    }
  }
  return argmax(per);
}

const byCount = <T extends {count: number}>(a: T, b: T) => b.count - a.count;

export function buildRecap(s: Stats, now: number, mode: RecapMode): Recap {
  const week = s.log.filter(e => now - e.at < 7 * DAY_MS && e.at <= now);

  const hours = new Array<number>(24).fill(0);
  for (const e of week) {
    hours[new Date(e.at).getHours()] += 1;
  }
  const peakHour = argmax(hours);
  const persona = peakHour >= 0 ? personaFor(peakHour) : null;
  const {streak, best} = streaks(s.days ?? {}, now);
  const common = {
    hours,
    peakHour,
    persona,
    streak,
    bestStreak: best,
  };

  if (mode === 'all') {
    const topSongs = Object.values(s.tracks)
      .sort((a, b) => b.count - a.count || b.last - a.last)
      .slice(0, 5)
      .map(t => ({track: t.track, count: t.count}));
    const topArtists = Object.values(s.artists)
      .sort((a, b) => b.count - a.count || b.last - a.last)
      .slice(0, 5)
      .map(a => ({name: a.name, image: a.image, count: a.count}));
    return {
      mode,
      songs: s.plays,
      minutes: null,
      topSong: topSongs[0] ?? null,
      topArtist: topArtists[0] ?? null,
      topSongs,
      topArtists,
      topSongDay: weekdayOf(s, week, topSongs[0]?.track),
      days: null,
      busiest: -1,
      onRepeat: null,
      discoveries: [],
      lastMinutes: null,
      ...common,
    };
  }

  // This week's songs and artists, from the plays that carry a song id.
  const songCount = new Map<string, number>();
  const artistCount = new Map<string, {name: string; count: number}>();
  const perSongDay = new Map<string, {k: string; day: number; n: number}>();
  for (const e of week) {
    const t = e.k ? s.tracks[e.k]?.track : undefined;
    if (!t || !e.k) {
      continue;
    }
    songCount.set(e.k, (songCount.get(e.k) ?? 0) + 1);
    const sd = `${e.k}|${dayKey(e.at)}`;
    const cur = perSongDay.get(sd);
    perSongDay.set(sd, {k: e.k, day: e.at, n: (cur?.n ?? 0) + 1});
    for (const name of splitArtists(t.artist || '')) {
      const key = name.toLowerCase();
      const a = artistCount.get(key);
      artistCount.set(key, {name, count: (a?.count ?? 0) + 1});
    }
  }
  const topSongs = [...songCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([k, count]) => ({track: s.tracks[k].track, count}));
  const artistsNow = [...artistCount.entries()]
    .map(([key, a]) => ({
      name: a.name,
      image: s.artists[key]?.image,
      count: a.count,
      first: s.artists[key]?.first,
    }))
    .sort(byCount);
  const topArtists = artistsNow
    .slice(0, 5)
    .map(({name, image, count}) => ({name, image, count}));
  const discoveries = artistsNow
    .filter(a => typeof a.first === 'number' && now - a.first < 7 * DAY_MS)
    .map(({name, image, count}) => ({name, image, count}));
  const rep = [...perSongDay.values()].sort((a, b) => b.n - a.n)[0];
  const onRepeat =
    rep && rep.n >= 3
      ? {track: s.tracks[rep.k].track, count: rep.n, day: rep.day}
      : null;

  const sum = summarizeWeek(s.log, now);
  const last = summarizeWeek(s.log, now - 7 * DAY_MS);
  const days = sum.perDay.map((n, i) => ({
    at: now - (6 - i) * DAY_MS,
    songs: n,
  }));

  return {
    mode,
    songs: sum.songs,
    minutes: sum.minutes,
    topSong: topSongs[0] ?? null,
    topArtist: topArtists[0] ?? null,
    topSongs,
    topArtists,
    topSongDay: weekdayOf(s, week, topSongs[0]?.track),
    days,
    busiest: argmax(sum.perDay),
    onRepeat,
    discoveries,
    lastMinutes: last.songs ? last.minutes : null,
    ...common,
  };
}
