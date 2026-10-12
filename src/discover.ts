/**
 * Discover: the first page of Home's grid. Nine songs picked for this
 * listener, new every time the app is opened.
 *
 * Six or seven are songs they have not played, similar to a few of their own
 * (Last.fm, through /api/discover, the same source as Autoplay), and two or
 * three are their own most-played, so the new ones arrive in good company.
 * All shuffled together.
 *
 * ## New on every open, without changing under the finger
 *
 * A set takes a few seconds to build (Last.fm, then a JioSaavn search per
 * song). Built at open and swapped in when ready, the grid would change under
 * a thumb already on its way to a tile. So each open SHOWS the set the last
 * one built, and builds the next in the background. The first open of all has
 * nothing put by: it builds into the grid directly, and once more for the
 * next open. Coming back after RETURN_MS away counts as an open too: the
 * playback service keeps the app alive for days, and "every open" should not
 * mean "every cold start".
 *
 * The set on screen does not change in the meantime, not even when one of its
 * songs is played: a tile vanishing the moment you tap it reads as a fault.
 */
import {createStore, useStoreValue} from './storage';
import {getDiscover, waitForBackend, type Track} from './backend';
import {getDownloadKey} from './tracks';
import {hydrate, readLikes} from './store';
import {readStats, type TrackStat} from './stats';
import {readRecentlyPlayed} from './recentlyPlayed';

export const GRID = 9;
/** Gone this long, and coming back is an open: a new set. */
export const RETURN_MS = 30 * 60 * 1000;

type Saved = {shown: Track[]; next: Track[]};

const store = createStore<Saved>(
  'mp.discover.v1',
  {shown: [], next: []},
  raw => {
    const r = (raw ?? {}) as Partial<Saved>;
    const list = (v: unknown) =>
      Array.isArray(v) ? (v as Track[]).filter(t => t && t.title) : [];
    return {
      shown: list(r.shown).slice(0, GRID),
      next: list(r.next).slice(0, GRID),
    };
  },
);

/** The set on screen. Empty until the first one has been built. */
export function useDiscover(): Track[] {
  return useStoreValue(store).shown;
}

type Rng = () => number;

/** One item, more likely the higher its weight. */
function pickWeighted<T>(
  items: T[],
  weight: (t: T, i: number) => number,
  rng: Rng,
): T | undefined {
  const ws = items.map((t, i) => Math.max(0, weight(t, i)));
  const total = ws.reduce((a, b) => a + b, 0);
  if (!total) {
    return undefined;
  }
  let r = rng() * total;
  for (let i = 0; i < items.length; i++) {
    r -= ws[i];
    if (r < 0) {
      return items[i];
    }
  }
  return items[items.length - 1];
}

export function shuffle<T>(items: T[], rng: Rng = Math.random): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const primary = (artist: string | undefined) =>
  (artist || '')
    .split(/\s*[,&/]\s*|\s+feat\.?\s+|\s+ft\.?\s+/i)[0]
    .trim()
    .toLowerCase();

/**
 * Up to three songs to find similar ones to: one of the last few played
 * (what they are in the mood for now), one of their most-played (what they
 * keep coming back to) and one more from either or their likes. By three
 * different artists where the history allows, so Discover is not one
 * artist's neighbourhood.
 */
export function pickSeeds(
  top: TrackStat[],
  recent: Track[],
  likes: Track[],
  rng: Rng = Math.random,
): Track[] {
  const seeds: Track[] = [];
  const artists = new Set<string>();
  const keys = new Set<string>();
  /** Still free to pick: not in already, and (strict) by a new artist. */
  const open = (t: Track | undefined, strict: boolean): t is Track =>
    !!t?.title &&
    !keys.has(getDownloadKey(t)) &&
    !(strict && artists.has(primary(t.artist)));
  const take = (t: Track | undefined) => {
    if (t) {
      seeds.push(t);
      keys.add(getDownloadKey(t));
      artists.add(primary(t.artist));
    }
  };
  const lately = recent.slice(0, 6);
  const most = top.slice(0, 15);
  const either = [
    ...recent.slice(0, 12),
    ...most.map(s => s.track),
    ...likes.slice(0, 15),
  ];

  // A different artist each, first; then any song not already in. Drawn
  // from what is still open, so a pick never fails on a repeat.
  for (const strict of [true, false]) {
    if (!seeds.length) {
      const pool = lately.filter(t => open(t, strict));
      take(pickWeighted(pool, (_, j) => pool.length - j, rng));
    }
    if (seeds.length < 2) {
      take(
        pickWeighted(
          most.filter(st => open(st.track, strict)),
          st => st.count,
          rng,
        )?.track,
      );
    }
    while (seeds.length < 3) {
      const pool = either.filter(t => open(t, strict));
      if (!pool.length) {
        break;
      }
      take(pool[Math.floor(rng() * pool.length)]);
    }
  }
  return seeds.slice(0, 3);
}

/**
 * The nine: `fresh` (similar songs, best first) less anything already heard,
 * plus two or three of their most-played, shuffled together.
 *
 * Favourites are songs played at least twice, drawn by play count, so the
 * most-played is the likeliest but not a fixture, and never one of the last
 * three played: they have just heard it. Short of new songs, more favourites
 * fill in; short of both, the grid is simply smaller.
 */
export function composeDiscover(
  fresh: Track[],
  top: TrackStat[],
  heard: Set<string>,
  justPlayed: Set<string>,
  rng: Rng = Math.random,
): Track[] {
  const seen = new Set<string>();
  const novel: Track[] = [];
  for (const t of fresh) {
    const k = getDownloadKey(t);
    if (!t?.title || heard.has(k) || seen.has(k)) {
      continue;
    }
    seen.add(k);
    novel.push(t);
  }
  let favs = top
    .filter(s => s.count >= 2 && !justPlayed.has(getDownloadKey(s.track)))
    .slice(0, 15);
  const want = rng() < 0.5 ? 2 : 3;
  const mine: Track[] = [];
  const room = () => (novel.length >= GRID - want ? want : GRID - novel.length);
  while (mine.length < room() && favs.length) {
    const s = pickWeighted(favs, f => f.count, rng);
    if (!s) {
      break;
    }
    favs = favs.filter(f => f !== s);
    mine.push(s.track);
  }
  return shuffle([...novel.slice(0, GRID - mine.length), ...mine], rng);
}

/** Build one set from the listener's history as it is now. [] when there is
 *  no history to start from, or nothing came back. */
async function build(): Promise<Track[]> {
  const stats = readStats();
  const top = Object.values(stats.tracks).sort(
    (a, b) => b.count - a.count || b.last - a.last,
  );
  const recent = readRecentlyPlayed();
  const likes = readLikes();
  const seeds = pickSeeds(top, recent, likes);
  if (!seeds.length) {
    return [];
  }
  const fresh = await getDiscover(seeds.map(s => [s.title, s.artist || '']));
  const heard = new Set<string>([
    ...top.map(s => getDownloadKey(s.track)),
    ...recent.map(getDownloadKey),
    ...likes.map(getDownloadKey),
  ]);
  const justPlayed = new Set(recent.slice(0, 3).map(getDownloadKey));
  return composeDiscover(fresh, top, heard, justPlayed);
}

let building: Promise<void> | null = null;

/** Build the set the next open will show. One at a time. */
function prepareNext(): Promise<void> {
  building ??= (async () => {
    try {
      if (!(await waitForBackend())) {
        return;
      }
      const next = await build();
      if (next.length) {
        store.update(s =>
          s.shown.length ? {...s, next} : {shown: next, next: []},
        );
      }
    } catch {
      // Offline or Last.fm down: what is on screen stays, and the next open
      // tries again.
    } finally {
      building = null;
    }
  })();
  return building;
}

/**
 * An open: what the last one put by goes on screen, and the next is built.
 * The first open of all builds into the grid, then once more for the next.
 */
export async function openDiscover(): Promise<void> {
  await hydrate();
  const {shown, next} = store.get();
  if (next.length) {
    store.set({shown: next, next: []});
  }
  const empty = !shown.length && !next.length;
  await prepareNext();
  if (empty && store.get().shown.length) {
    prepareNext();
  }
}
