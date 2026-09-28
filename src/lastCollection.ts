/**
 * The last playlist or album something was played from, for Home's
 * "Continue your mix" card.
 *
 * Liked Songs, Downloaded and your own playlists are read live when opened, so
 * they are kept without their tracks. An album or a source playlist has no
 * other copy on the phone, so its tracks come along (capped).
 */
import {createStore, useStoreValue} from './storage';
import {getBestArtworkUrl} from './tracks';
import type {Collection} from './collections';

export type LastCollection = Collection & {covers: string[]};

const MAX_TRACKS = 150;

const store = createStore<LastCollection | null>(
  'mp.lastCollection.v1',
  null,
  raw =>
    raw && typeof raw === 'object' && typeof (raw as Collection).id === 'string'
      ? (raw as LastCollection)
      : null,
);

/** What is kept of `c`, or null for an artist. Pure; exported for the test. */
export function snapshotCollection(c: Collection): LastCollection | null {
  if (c.kind === 'artist') {
    return null;
  }
  const live =
    c.kind === 'liked' || c.kind === 'downloads' || c.kind === 'userPlaylist';
  const covers = Array.from(
    new Set(
      [c.image, ...c.tracks.slice(0, 8).map(t => getBestArtworkUrl(t))].filter(
        (u): u is string => !!u,
      ),
    ),
  ).slice(0, 3);
  return {...c, tracks: live ? [] : c.tracks.slice(0, MAX_TRACKS), covers};
}

export function rememberCollection(c: Collection): void {
  const snap = snapshotCollection(c);
  if (snap) {
    store.set(snap);
  }
}

export function useLastCollection(): LastCollection | null {
  return useStoreValue(store);
}
