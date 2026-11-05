/**
 * Saved songs that were someone else's recording, put right.
 *
 * Until the engine checked the copy that plays by its own credit, a search
 * row could join a soundalike to the real song: a karaoke label's "Creep
 * [In The Style Of Radiohead]" was saved, liked and imported as Radiohead's
 * Creep, at JioSaavn's quality, and played in its place. The engine now looks
 * each saved JioSaavn copy up by its own page (/api/recheck) and names the
 * real recording for one that is not the song.
 *
 * A batch per launch, never on mobile data with the data saver on, like
 * coverRepair.ts. Each copy is checked once. Never a song you picked a
 * copy of yourself ("Wrong song?"), and never one on this phone as a file;
 * a song with no better copy is left as it is.
 */
import {recheckCopies, type CopyCheck, type Track} from './backend';
import {mapPlaylistTrackLists, readPlaylists} from './playlists';
import {hasChoice} from './songChoice';
import {asArray, createStore} from './storage';
import {mapLikeList, readLikes, savingData} from './store';
import {getPlayableSource, getTrackId, normalizeTrack} from './tracks';
import {diag} from './diag';

const PER_LAUNCH = 40;

/**
 * `tracks` with each replaced song in place of its old copy, keeping the
 * order; a replacement the list already has (the same song saved twice) is
 * not added again. Exported for the test.
 */
export function withMoved(tracks: Track[], moved: Map<string, Track>): Track[] {
  const out: Track[] = [];
  const have = new Set(tracks.map(getTrackId));
  for (const t of tracks) {
    const next = moved.get(getTrackId(t));
    if (!next) {
      out.push(t);
      continue;
    }
    const id = getTrackId(next);
    if (have.has(id) && id !== getTrackId(t)) {
      continue; // the list has the real recording already
    }
    have.add(id);
    out.push(next);
  }
  return out;
}
/** Copies checked, by their page URL; the oldest drop off past this. */
const MAX_CHECKED = 5000;

const checked = createStore<string[]>('mp.copyRepair.v1', [], raw =>
  asArray<string>(raw).filter(x => typeof x === 'string'),
);

/** The JioSaavn copy `t` plays, as the engine checks it; null for a song
 *  that is not checked (a file, another source, your own pick). Exported for
 *  the test. */
export function copyToCheck(
  t: Track,
  picked: (t: Track) => boolean = hasChoice,
): CopyCheck | null {
  if (t.file_path || getPlayableSource(t) !== 'jiosaavn' || picked(t)) {
    return null;
  }
  const url = t.sources?.jiosaavn?.url;
  if (!url || !t.title) {
    return null;
  }
  return {
    key: url,
    title: t.title,
    artist: t.artist || '',
    duration_ms: t.duration_ms || 0,
    url,
  };
}

export async function recheckSavedCopies(): Promise<void> {
  if (savingData()) {
    return;
  }
  const done = new Set(checked.get());
  const saved = [...readPlaylists().flatMap(p => p.tracks || []), ...readLikes()];
  const todo = new Map<string, {check: CopyCheck; track: Track}>();
  for (const t of saved) {
    const check = copyToCheck(t);
    if (check && !done.has(check.key) && !todo.has(check.key)) {
      todo.set(check.key, {check, track: t});
    }
  }
  const batch = [...todo.values()].slice(0, PER_LAUNCH);
  if (!batch.length) {
    return;
  }
  const results = await recheckCopies(batch.map(b => b.check));
  const moved = new Map<string, Track>();
  for (const r of results) {
    done.add(r.key);
    const was = todo.get(r.key);
    const next = !r.ok && r.track ? normalizeTrack(r.track) : null;
    if (was && next) {
      moved.set(getTrackId(was.track), next);
      diag('copies', `"${was.track.title}" was ${r.was ?? 'another recording'}`);
    }
  }
  diag('copies', `checked ${results.length}, replaced ${moved.size}`);
  checked.set([...done].slice(-MAX_CHECKED));
  if (moved.size) {
    mapPlaylistTrackLists(list => withMoved(list, moved));
    mapLikeList(list => withMoved(list, moved));
  }
}
