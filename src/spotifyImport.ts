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
