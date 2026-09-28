/**
 * The active Spotify import.
 *
 * The matching itself runs on the backend as a job keyed by URL — it keeps
 * going whether or not this screen is open. This only polls it and holds the
 * latest snapshot, which is what lets you leave the import, come back, and see
 * real progress instead of a restart.
 */
import {useSyncExternalStore} from 'react';
import {importSpotify, type ImportSnapshot} from './backend';
import {logEvent} from './analytics';
import {createStore, useStoreValue} from './storage';
import {addTracksToPlaylist, createPlaylist} from './playlists';
import {normalizeTracks} from './tracks';
import {toast} from './toast';

/**
 * The last finished import, for Home's import card: shown as "Imported, saved
 * to Your Library" until the playlist has been opened once.
 */
export type LastImport = {
  url: string;
  name: string;
  image: string;
  playlistId: string;
  found: number;
  total: number;
  opened: boolean;
};
const lastImport = createStore<LastImport | null>('mp.lastImport.v1', null, raw =>
  raw && typeof raw === 'object' && typeof (raw as LastImport).playlistId === 'string'
    ? (raw as LastImport)
    : null,
);
export const useLastImport = () => useStoreValue(lastImport);
export function markImportOpened(): void {
  const l = lastImport.get();
  if (l && !l.opened) {
    lastImport.set({...l, opened: true});
  }
}

/** Saved already, by url: a finished job is polled more than once. */
const savedUrls = new Set<string>();

/**
 * A finished import saves itself. It used to wait for "Add to library" on the
 * import screen, and switching tabs closes that screen, so an import that ran
 * to the end in the background was simply never saved: that is what "import
 * does not work" was.
 */
function saveFinished(url: string, res: ImportSnapshot): void {
  if (savedUrls.has(url) || !res.finished || res.error || res.matched <= 0) {
    return;
  }
  savedUrls.add(url);
  const tracks = normalizeTracks(res.tracks);
  const pl = createPlaylist(res.name || 'Spotify playlist');
  if (!pl) {
    return;
  }
  addTracksToPlaylist(pl.id, tracks);
  lastImport.set({
    url,
    name: pl.name,
    image: res.image || '',
    playlistId: pl.id,
    found: res.matched,
    total: res.total,
    opened: false,
  });
  toast(`Saved "${pl.name}" to Your Library, ${res.matched} songs`);
  logEvent('spotify_import_done', {found: res.matched, total: res.total});
}

/** The words for a failed import, from the engine's error. */
export function importProblem(error: string | null, found: number): string {
  if (!error) {
    return found === 0 ? 'None of its songs were found' : '';
  }
  const e = error.toLowerCase();
  if (e.includes('public') || e.includes('read that playlist')) {
    return 'That playlist is private';
  }
  if (e.includes('not a spotify')) {
    return 'That is not a playlist link';
  }
  return 'Check your connection';
}

/** Put the import card back to asking for a link. */
export function dismissImport(): void {
  stop();
  state = empty();
  emit();
}

/** Set by the first import that brought songs in; Home's card then goes. */
const importedOnce = createStore<boolean>('mp.spotifyImported.v1', false, raw => raw === true);
export const useImportedOnce = () => useStoreValue(importedOnce);

export type ImportState = ImportSnapshot & {url: string | null};

function empty(): ImportState {
  return {
    url: null,
    name: '',
    image: '',
    total: 0,
    done: 0,
    matched: 0,
    tracks: [],
    missing: [],
    finished: false,
    error: null,
  };
}

let state: ImportState = empty();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function emit() {
  // New identity each tick so useSyncExternalStore re-renders.
  state = {...state};
  listeners.forEach(l => l());
}

function stop() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

/**
 * Start (or resume) importing a URL.
 *
 * Idempotent for the same URL: calling again while it's already running does
 * NOT restart the backend job, so re-entering the screen picks up where it got
 * to rather than throwing away the work.
 */
/** A public Spotify playlist/album link (or spotify: URI). */
export function isSpotifyUrl(text: string): boolean {
  const s = (text || '').trim();
  return (
    /open\.spotify\.com\/(?:intl-[a-z]{2}\/)?(playlist|album)\//i.test(s) ||
    /^spotify:(playlist|album):/i.test(s)
  );
}

export function startImport(url: string): void {
  if (!url || (state.url === url && !state.error)) {
    return;
  }
  stop();
  state = {...empty(), url};
  emit();
  logEvent('spotify_import');

  const poll = async () => {
    try {
      const res = await importSpotify(url);
      if (state.url !== url) {
        return; // superseded by a newer import
      }
      state = {url, ...res};
      listeners.forEach(l => l());
      if (res.finished && !res.error && res.matched > 0) {
        importedOnce.set(true); // Home's import card has done its job
        saveFinished(url, res);
      }
      if (res.finished && (res.error || res.matched <= 0)) {
        // Reported, so a failure can be traced from Analytics next time.
        logEvent('spotify_import_failed', {
          error: String(res.error || 'no songs found'),
          total: res.total,
        });
      }
      if (res.finished || res.error) {
        stop();
      }
    } catch {
      // Transient — the next tick tries again.
    }
  };
  poll();
  timer = setInterval(poll, 800);
}

export function useSpotifyImport(): ImportState {
  return useSyncExternalStore(
    l => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}
