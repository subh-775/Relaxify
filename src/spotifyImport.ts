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
  /** YouTube songs kept as their YouTube original (nothing else matched). */
  kept?: number;
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
  const pl = createPlaylist(res.name || `${importSourceName(url)} playlist`);
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
    kept: res.kept || 0,
  });
  toast(`Saved "${pl.name}" to Your Library, ${res.matched} songs`);
  logEvent('spotify_import_done', {
    found: res.matched,
    total: res.total,
    source: res.source || 'spotify',
    kept: res.kept || 0,
  });
}

/** The words for a failed import, from the engine's error. */
export function importProblem(error: string | null, found: number): string {
  if (!error) {
    return found === 0 ? 'None of its songs were found' : '';
  }
  if (error === NO_ENGINE) {
    return "Relaxify's music engine did not answer";
  }
  const e = error.toLowerCase();
  if (e.includes('google login')) {
    return 'Your own likes and Watch later are private';
  }
  if (e.includes('public') || e.includes('read that playlist')) {
    return 'That playlist is private';
  }
  if (e.includes('not a spotify') || e.includes('not a playlist')) {
    return 'That is not a playlist link';
  }
  return 'Check your connection';
}

/** Set as the error when the engine stops answering, so the card can say so. */
const NO_ENGINE = 'engine did not answer';
/** Set as the error when the engine refuses the link itself. */
export const BAD_LINK = 'Not a playlist link';
/** Your own YouTube lists (Liked videos, Liked music, Watch later): they need
 *  a Google login, which Relaxify does not ask for. Known from the link, so
 *  the import says why at once instead of failing on the engine. */
export const PRIVATE_LIST = 'Private playlist: needs a Google login';
const privateYouTubeList = (url: string) =>
  isYouTubePlaylistUrl(url) && /[?&]list=(?:LL|LM|WL)(?:[&#]|$)/.test(url);
/** Failed checks in a row before an import gives up on the engine. */
const MAX_FAILURES = 6;
/** No new song checked for this long: the card says it is slow. */
export const STALL_MS = 45_000;
const POLL_MS = 1000;

export type ImportState = ImportSnapshot & {
  url: string | null;
  /** Running, but nothing has moved for STALL_MS. */
  stalled: boolean;
};

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
    stalled: false,
  };
}

let state: ImportState = empty();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | null = null;
/** Bumped by every start and stop, so a poll already in flight for an old
 *  run cannot write into the new one. */
let run = 0;
let failures = 0;
let lastMove = 0;

function emit() {
  // New identity each tick so useSyncExternalStore re-renders.
  state = {...state};
  listeners.forEach(l => l());
}

function stop() {
  run += 1;
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
}

/** A public Spotify playlist/album link (or spotify: URI). */
export function isSpotifyUrl(text: string): boolean {
  const s = (text || '').trim();
  return (
    /open\.spotify\.com\/(?:intl-[a-z]{2}\/)?(playlist|album)\//i.test(s) ||
    /^spotify:(playlist|album):/i.test(s)
  );
}

/** A YouTube or YouTube Music link that carries a playlist (list=). The
 *  engine's components/youtube_playlist.py parse_url is the same rule. */
export function isYouTubePlaylistUrl(text: string): boolean {
  const s = (text || '').trim();
  return (
    /^(?:https?:\/\/)?(?:(?:www|m|music)\.)?(?:youtube\.com|youtu\.be)\//i.test(s) &&
    /[?&]list=[A-Za-z0-9_-]+/.test(s)
  );
}

/** Any link the import takes: Spotify, YouTube or YouTube Music. */
export function isImportUrl(text: string): boolean {
  return isSpotifyUrl(text) || isYouTubePlaylistUrl(text);
}

/** Where a link is from, in the words a person uses. */
export function importSourceName(url: string | null): string {
  const s = url || '';
  if (/music\.youtube\.com/i.test(s)) {
    return 'YouTube Music';
  }
  return isYouTubePlaylistUrl(s) ? 'YouTube' : 'Spotify';
}

/**
 * Start (or resume) importing a URL.
 *
 * Idempotent for the same URL while it runs or after it succeeded: re-entering
 * the screen picks up where it got to. After a failure, nothing found, or a
 * cancel, the same URL starts over (the engine starts a fresh job too).
 *
 * Polls one request at a time. It used to fire every 800 ms regardless, and
 * swallowed every failure: with the engine not answering, the card sat on
 * "0 found" for ever with no way out. Now a stall is reported after STALL_MS
 * and MAX_FAILURES failed checks in a row end the import with a reason.
 */
export function startImport(url: string): void {
  if (!url) {
    return;
  }
  const again = state.url === url;
  if (again && !state.error && !state.cancelled && !(state.finished && state.matched <= 0)) {
    return;
  }
  stop();
  if (privateYouTubeList(url)) {
    state = {...empty(), url, error: PRIVATE_LIST, finished: true};
    emit();
    return;
  }
  const mine = run;
  savedUrls.delete(url); // a fresh run of the same link saves again
  state = {...empty(), url};
  failures = 0;
  lastMove = Date.now();
  emit();
  logEvent('spotify_import', {
    again: again ? 1 : 0,
    source: isYouTubePlaylistUrl(url) ? 'youtube' : 'spotify',
  });

  const poll = async () => {
    try {
      const res = await importSpotify(url);
      if (mine !== run) {
        return; // cancelled, dismissed, or superseded meanwhile
      }
      failures = 0;
      if (res.done !== state.done || res.total !== state.total) {
        lastMove = Date.now();
      }
      state = {url, ...res, stalled: !res.finished && Date.now() - lastMove > STALL_MS};
      listeners.forEach(l => l());
      if (res.finished && !res.error && res.matched > 0) {
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
        return;
      }
    } catch (e) {
      if (mine !== run) {
        return;
      }
      failures += 1;
      // A 400 is the engine saying the link itself is wrong: no point asking again.
      const bad = String(e).includes('HTTP 400');
      if (bad || failures >= MAX_FAILURES) {
        state = {...state, error: bad ? BAD_LINK : NO_ENGINE, finished: true};
        emit();
        logEvent('spotify_import_failed', {error: bad ? 'bad link' : 'no engine', total: state.total});
        return;
      }
    }
    timer = setTimeout(poll, POLL_MS);
  };
  poll();
}

/** "Keep waiting" on a slow import: the stall clock starts again. */
export function keepWaiting(): void {
  lastMove = Date.now();
  state = {...state, stalled: false};
  emit();
}

/** Start the current import over (after a failure or nothing found). */
export function retryImport(): void {
  if (state.url) {
    startImport(state.url);
  }
}

/**
 * Stop a running import. The engine keeps what it found so far; with any
 * found, the card asks whether to save them. With none, it just ends.
 */
export async function cancelImport(): Promise<void> {
  const url = state.url;
  if (!url) {
    return;
  }
  stop();
  logEvent('spotify_import_cancelled', {done: state.done, total: state.total});
  let res: ImportSnapshot | null = null;
  try {
    res = await importSpotify(url, true);
  } catch {
    // The engine may be the reason for cancelling; keep what the last check had.
  }
  if (state.url !== url) {
    return;
  }
  const found = res?.tracks?.length ? res : null;
  if (!found) {
    dismissImport();
    return;
  }
  state = {...state, ...found, url, cancelled: true, finished: true, stalled: false};
  emit();
}

/** After a cancel: save what was found as a playlist. */
export function saveCancelled(): void {
  if (state.url && state.cancelled) {
    saveFinished(state.url, {...state, error: null});
    dismissImport();
  }
}

/** Put the import card back to asking for a link. */
export function dismissImport(): void {
  stop();
  state = empty();
  emit();
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
