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
import {summarizeWeek, type Stats} from './stats';
import {splitArtists} from './tracks';

export type RecapMode = 'week' | 'all';

export type Persona = {name: string; line: string};

export type Recap = {
  mode: RecapMode;
  /** Songs started in the span. */
  songs: number;
  /** Minutes listened; this week only (the counts do not keep time). */
  minutes: number | null;
  topSong: {track: Track; count: number} | null;
  topArtist: {name: string; image?: string; count: number} | null;
  /** This week only: songs per day, oldest first, with each day's start. */
  days: {at: number; songs: number}[] | null;
  /** Index into `days` of the biggest day, or -1. */
  busiest: number;
  /** Plays per local hour of the day, 0-23, from the play log. */
  hours: number[];
  /** The busiest hour, or -1 when the log is empty. */
  peakHour: number;
  persona: Persona | null;
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

export function buildRecap(s: Stats, now: number, mode: RecapMode): Recap {
  const week = s.log.filter(e => now - e.at < 7 * DAY_MS);

  const hours = new Array<number>(24).fill(0);
  for (const e of week) {
    hours[new Date(e.at).getHours()] += 1;
  }
  const peakHour = argmax(hours);
  const persona = peakHour >= 0 ? personaFor(peakHour) : null;

  if (mode === 'all') {
    const topTrack = Object.values(s.tracks).sort(
      (a, b) => b.count - a.count || b.last - a.last,
    )[0];
    const topArtist = Object.values(s.artists).sort(
      (a, b) => b.count - a.count || b.last - a.last,
    )[0];
    return {
      mode,
      songs: s.plays,
      minutes: null,
      topSong: topTrack ? {track: topTrack.track, count: topTrack.count} : null,
      topArtist: topArtist
        ? {name: topArtist.name, image: topArtist.image, count: topArtist.count}
        : null,
      days: null,
      busiest: -1,
      hours,
      peakHour,
      persona,
    };
  }

  // This week's top song and artist, from the plays that carry a song id.
  const songCount = new Map<string, number>();
  const artistCount = new Map<string, {name: string; count: number}>();
  for (const e of week) {
    const t = e.k ? s.tracks[e.k]?.track : undefined;
    if (!t || !e.k) {
      continue;
    }
    songCount.set(e.k, (songCount.get(e.k) ?? 0) + 1);
    for (const name of splitArtists(t.artist || '')) {
      const key = name.toLowerCase();
      const a = artistCount.get(key);
      artistCount.set(key, {name, count: (a?.count ?? 0) + 1});
    }
  }
  const [songKey, songN] = [...songCount.entries()].sort(
    (a, b) => b[1] - a[1],
  )[0] ?? ['', 0];
  const [artistKey, artist] = [...artistCount.entries()].sort(
    (a, b) => b[1].count - a[1].count,
  )[0] ?? ['', null];

  const sum = summarizeWeek(s.log, now);
  const days = sum.perDay.map((n, i) => ({
    at: now - (6 - i) * DAY_MS,
    songs: n,
  }));

  return {
    mode,
    songs: sum.songs,
    minutes: sum.minutes,
    topSong: songKey ? {track: s.tracks[songKey].track, count: songN} : null,
    topArtist: artist
      ? {
          name: artist.name,
          image: s.artists[artistKey]?.image,
          count: artist.count,
        }
      : null,
    days,
    busiest: argmax(sum.perDay),
    hours,
    peakHour,
    persona,
  };
}
