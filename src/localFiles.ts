/**
 * What is on this phone, and which file each song is.
 *
 * Kept here, not only on the tracks from a disk scan, because a song reaches
 * the player from everywhere else too: Liked Songs, a playlist, Search, Home.
 * Those copies have no `file_path`, so a song sitting on the phone streamed
 * anyway, and with no internet it would not play at all. withLocalFile answers
 * for all of them.
 *
 * Persisted, so the answer is there at launch, before the engine has started
 * and whether or not it ever scans. The disk stays the truth: each scan
 * replaces the list.
 */
import type {Track} from './backend';
import {asArray, createStore, useStoreSelector} from './storage';
import {getDownloadKey} from './tracks';

type LocalFiles = {
  /** The songs, as the last scan read them. */
  tracks: Track[];
  /** Song identity -> path. Holds more than the scan's own names: the name the
   *  catalog gave a song stays with its file, as the two can differ. */
  paths: Record<string, string>;
};

const store = createStore<LocalFiles>(
  'mp.localFiles.v1',
  {tracks: [], paths: {}},
  raw => {
    const r = (raw ?? {}) as Partial<LocalFiles>;
    return {
      tracks: asArray<Track>(r.tracks),
      paths: r.paths && typeof r.paths === 'object' ? r.paths : {},
    };
  },
);

function keysOf(t: Track): string[] {
  return [getDownloadKey(t), ...(t.isrc ? [`isrc:${t.isrc}`] : [])];
}

function pathOf(t: Track): string | undefined {
  const {paths} = store.get();
  for (const key of keysOf(t)) {
    if (paths[key]) {
      return paths[key];
    }
  }
  return undefined;
}

/**
 * `t` pointing at its file when the phone has it, or `t` as it is.
 *
 * The rest of the copy stays: its sources are still what Like, radio and "Wrong
 * song?" work from, and `file_path` is what makes it play from the phone.
 */
export function withLocalFile(t: Track): Track {
  if (t.file_path) {
    return t;
  }
  const path = pathOf(t);
  if (!path) {
    return t;
  }
  const scanned = store.get().tracks.find(x => x.file_path === path);
  return {
    ...t,
    file_path: path,
    has_embedded_art: scanned?.has_embedded_art,
  };
}

/** Put a scan's answer in place of the last one. A catalog name stays while its
 *  file does, and a file gone from the folder takes its names with it. */
export function setLocalFiles(tracks: Track[]): void {
  const onDisk = new Set(tracks.map(t => t.file_path));
  const paths: Record<string, string> = {};
  Object.entries(store.get().paths).forEach(([key, path]) => {
    if (onDisk.has(path)) {
      paths[key] = path;
    }
  });
  tracks.forEach(t => keysOf(t).forEach(key => (paths[key] = t.file_path!)));
  // A YouTube .webm has no tags to read a length from; the catalog's stays.
  const before = new Map(store.get().tracks.map(t => [t.file_path, t]));
  store.set({
    tracks: tracks.map(t =>
      t.duration_ms
        ? t
        : {...t, duration_ms: before.get(t.file_path)?.duration_ms},
    ),
    paths,
  });
}

/** A download landed: this song is that file, by the catalog's name for it.
 *  Listed at once, ahead of the scan that will fill in the rest. */
export function addLocalFile(t: Track, path: string): void {
  const {tracks, paths} = store.get();
  const next = {...paths};
  keysOf(t).forEach(key => (next[key] = path));
  store.set({
    tracks: tracks.some(x => x.file_path === path)
      ? tracks
      : [...tracks, {...t, file_path: path}],
    paths: next,
  });
}

/** These files are gone. */
export function dropLocalFiles(gone: Track[]): void {
  const dead = new Set(gone.map(t => withLocalFile(t).file_path));
  const {tracks, paths} = store.get();
  store.set({
    tracks: tracks.filter(t => !dead.has(t.file_path)),
    paths: Object.fromEntries(
      Object.entries(paths).filter(([, path]) => !dead.has(path)),
    ),
  });
}

export function readLocalTracks(): Track[] {
  return store.get().tracks;
}

export function useLocalTracks(): Track[] {
  return useStoreSelector(store, s => s.tracks);
}

/** Is THIS song on the phone. A boolean, so a row re-renders only when its own
 *  answer changes, not whenever any download finishes. */
export function useIsDownloaded(track: Track | null | undefined): boolean {
  return useStoreSelector(
    store,
    () => !!track && (!!track.file_path || !!pathOf(track)),
  );
}
