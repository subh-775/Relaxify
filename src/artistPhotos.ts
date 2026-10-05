/**
 * Real photos for artists, remembered on the phone.
 *
 * Listening stats only ever knew an artist by the cover of the first song
 * counted for them, so the Recap and Search's "Your artists" showed an album
 * sleeve where a face belonged. This looks the artist up once (the same
 * /search/artists lookup the "Artists on this song" picker uses), keeps the
 * photo, and hands it to anything that asks by name.
 *
 * A lookup is accepted only when the name it returns is the name we asked
 * for, give or take case and punctuation: a near miss would put a stranger's
 * face on your Recap, which is worse than a cover.
 */
import {useEffect, useMemo} from 'react';
import {searchArtists} from './backend';
import {createStore, useStoreValue} from './storage';

type Photos = Record<string, string>;

/** Bounded: past this the oldest entries go first. */
const MAX = 300;

// v2: v1 photos came from Deezer first, which put a stranger's face on some
// artists (its only "Aditya Rikhari" is someone else). The backend now
// prefers JioSaavn's official photo; a new key looks every artist up again.
// ponytail: the v1 entry (a few KB of URLs) is left behind, not deleted.
const store = createStore<Photos>('mp.artistPhotos.v2', {}, raw =>
  raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Photos) : {},
);

const key = (name: string) => name.trim().toLowerCase();
const fold = (name: string) =>
  name.toLowerCase().replace(/[\s.,'’&\-_!()]/g, '');

/** Looked up this session and not found, so not asked again until restart. */
const missed = new Set<string>();
const pending = new Set<string>();

export function rememberArtistPhoto(name: string, url?: string): void {
  if (!name || !url || store.get()[key(name)] === url) {
    return;
  }
  store.update(prev => {
    const next = {...prev, [key(name)]: url};
    const keys = Object.keys(next);
    return keys.length > MAX
      ? Object.fromEntries(keys.slice(-MAX).map(k => [k, next[k]]))
      : next;
  });
}

/** True when a lookup result is plausibly the artist we asked for. */
export function sameArtist(asked: string, got: string): boolean {
  const a = fold(asked);
  const b = fold(got);
  return !!a && a === b;
}

function lookUp(name: string): void {
  const k = key(name);
  if (!k || pending.has(k) || missed.has(k) || store.get()[k]) {
    return;
  }
  pending.add(k);
  searchArtists(name, 1)
    .then(([hit]) => {
      if (hit?.image && sameArtist(name, hit.name)) {
        rememberArtistPhoto(name, hit.image);
      } else {
        missed.add(k);
      }
    })
    .catch(() => missed.add(k))
    .finally(() => pending.delete(k));
}

/**
 * The photo for each name (undefined until known), looking up any that are
 * missing. `names` is read by value, so an inline array does not refetch.
 */
export function useArtistPhotos(names: string[]): Record<string, string> {
  const photos = useStoreValue(store);
  const joined = names.join('\n');
  useEffect(() => {
    joined.split('\n').filter(Boolean).forEach(lookUp);
  }, [joined]);
  return useMemo(() => {
    const out: Record<string, string> = {};
    for (const n of joined.split('\n')) {
      const url = photos[key(n)];
      if (url) {
        out[n] = url;
      }
    }
    return out;
  }, [photos, joined]);
}
