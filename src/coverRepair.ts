/**
 * One-time repair of covers that came from a wrong iTunes match.
 *
 * A saved song can carry two covers: the one from the service that plays it,
 * and one from a separate iTunes lookup that sometimes matched another song
 * (same album or film, different track). Songs that kept their JioSaavn cover
 * are fixed by tracks.ts's order alone. Songs that kept ONLY the iTunes one
 * get their real cover from JioSaavn here — a few per launch, never on mobile
 * data with the data saver on, and each song is asked about once.
 */
import {apiGet, type Track} from './backend';
import {mapPlaylistTracks, readPlaylists} from './playlists';
import {asArray, createStore} from './storage';
import {mapLikes, readLikes, savingData} from './store';
import {getBestArtworkUrl} from './tracks';

/** JioSaavn song links already asked about, answered or not. */
const tried = createStore<string[]>('mp.coverRepair.v1', [], asArray);
const PER_LAUNCH = 20;

/** The JioSaavn link of a song still showing an iTunes cover, else ''.
 *  Exported for the test. */
export function needsRepair(t: Track): string {
  const url = t.sources?.jiosaavn?.url;
  return url && getBestArtworkUrl(t).includes('mzstatic.com') ? url : '';
}

/** `t` with its real cover, when `fixed` has one for its JioSaavn link.
 *  Exported for the test. */
export function withCover(t: Track, fixed: Map<string, string>): Track {
  const art = fixed.get(t.sources?.jiosaavn?.url ?? '');
  return art
    ? {
        ...t,
        artwork_url: art,
        artwork_urls: {...t.artwork_urls, 'source:jiosaavn': art},
      }
    : t;
}

export async function repairCovers(): Promise<void> {
  const done = new Set(tried.get());
  const saved = [...readPlaylists().flatMap(p => p.tracks), ...readLikes()];
  const todo = [...new Set(saved.map(needsRepair))]
    .filter(u => u && !done.has(u))
    .slice(0, PER_LAUNCH);
  const fixed = new Map<string, string>();
  for (const url of todo) {
    if (savingData()) {
      break;
    }
    try {
      const r = await apiGet<{artwork_url?: string; error?: string}>(
        `/artwork?song_url=${encodeURIComponent(url)}`,
      );
      if (r.error) {
        break; // JioSaavn unreachable: ask again next launch
      }
      if (r.artwork_url) {
        fixed.set(url, r.artwork_url);
      }
      done.add(url);
    } catch {
      break; // offline or the engine is down
    }
  }
  tried.set([...done].slice(-2000));
  if (fixed.size) {
    mapPlaylistTracks(t => withCover(t, fixed));
    mapLikes(t => withCover(t, fixed));
  }
}
