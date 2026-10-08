/**
 * Liked songs and user settings.
 *
 * Identity comes from tracks.ts — this file used to carry its own `trackKey`
 * (lowercased title+artist, no ISRC, no cleanText), which meant likes and
 * playlist dedup were judging "the same song" by two different rules. One rule
 * now, in one place.
 */
import {useCallback, useSyncExternalStore} from 'react';
import {
  createStore,
  asArray,
  hydrateAll,
  useStoreSelector,
  useStoreValue,
} from './storage';
import {getTrackId} from './tracks';
import type {Track} from './backend';
import {logEvent, songParams} from './analytics';
// Imported for side effect: creating a store registers it for hydration, so a
// store no screen has rendered yet is still loaded at startup.
import './playlists';
import './pins';
import './searchHistory';
import './stats';
import './collections';
import './artists';

export type Settings = {
  audioQuality: number; // 0 = auto, else kbps
  showSourceBadge: boolean;
  showQualityBadge: boolean;
  /** Check GitHub for a new release on launch (at most once a day). */
  autoUpdateCheck: boolean;
  autoplay: boolean;
  crossfadeDuration: number; // seconds; 0 = off
  /** Playback speed, 1 = normal. ExoPlayer pitch-corrects, so a voice at 1.5x
   *  is faster and not higher. Carried across songs on purpose: a speed is a
   *  way of listening, not a property of one track. */
  playbackRate: number;
  normalizeVolume: boolean;
  eqEnabled: boolean;
  eqPreset: string;
  eqGains: number[] | null;
  /** Clear the cache by itself once it passes this many MB; 0 = never. */
  cacheLimitMb: number;
  /** Each output device (headphones, speaker, car) keeps its own equalizer. */
  deviceMemory: boolean;
  /** Carry on playing when headphones connect. */
  resumeOnConnect: boolean;
  /** Home's rows and Search's Browse come in these (JioSaavn's names). */
  homeLanguages: string[];
  /** Stream at DATA_SAVER_KBPS while on mobile data. */
  dataSaver: boolean;
};

/** The quality streamed on mobile data with the data saver on. */
export const DATA_SAVER_KBPS = 96;

/** Whether the phone is on mobile data right now (network.ts keeps it). */
let cellular = false;
export function setOnCellular(v: boolean): void {
  cellular = v;
}

/** Data saver is on AND the phone is on mobile data: hold background fetches. */
export const savingData = () => settingsStore.get().dataSaver && cellular;

export const DEFAULT_SETTINGS: Settings = {
  audioQuality: 320,
  showSourceBadge: true,
  showQualityBadge: true,
  autoUpdateCheck: true,
  autoplay: true,
  crossfadeDuration: 0,
  playbackRate: 1,
  normalizeVolume: false,
  // Off by default: an untouched signal path is the one guaranteed to play
  // everywhere, and an effect the user didn't ask for is a bug report.
  eqEnabled: false,
  eqPreset: 'flat',
  eqGains: null,
  // On by default: a downloaded update alone is ~48 MB and stayed in the cache
  // after installing, and a cache is re-fetchable by definition.
  cacheLimitMb: 100,
  deviceMemory: true,
  resumeOnConnect: false,
  homeLanguages: ['hindi', 'english'],
  dataSaver: true,
};

/** At most this many Home languages: more and Home turns into a blur. */
export const MAX_LANGUAGES = 2;

/** Home's tuner: the pair after tuning to `lang`. It leads and the one you
 *  were on follows, so landing on the second swaps them. */
export function retune(pair: string[], lang: string): string[] {
  return lang === pair[0] ? pair : [lang, pair[0]].filter(Boolean);
}
/** The sizes "Clear cache automatically" steps through, in MB; 0 = off. */
export const CACHE_STEPS = [0, 10, 20, 50, 100, 200, 500];

/** A stored cache limit (the old slider allowed any multiple of 10), on the
 *  nearest step. */
export const nearestCacheStep = (mb: number) =>
  CACHE_STEPS.reduce((a, b) => (Math.abs(b - mb) < Math.abs(a - mb) ? b : a));

const likesStore = createStore<Track[]>('mp.likes.v1', [], asArray);
const settingsStore = createStore<Settings>(
  'mp.settings.v1',
  DEFAULT_SETTINGS,
  raw => {
    const s = {...DEFAULT_SETTINGS, ...(raw as Partial<Settings>)};
    return {
      ...s,
      homeLanguages: Array.isArray(s.homeLanguages)
        ? s.homeLanguages.slice(0, MAX_LANGUAGES)
        : DEFAULT_SETTINGS.homeLanguages,
      cacheLimitMb: nearestCacheStep(Number(s.cacheLimitMb) || 0),
    };
  },
);

// ─── Likes ──────────────────────────────────────────────────────────────────

export function isLiked(t: Track): boolean {
  const k = getTrackId(t);
  return likesStore.get().some(x => getTrackId(x) === k);
}

/** Returns the new state (true = now liked). Newest likes go on top. */
export function toggleLike(t: Track): boolean {
  const k = getTrackId(t);
  const list = likesStore.get();
  const had = list.some(x => getTrackId(x) === k);
  likesStore.set(had ? list.filter(x => getTrackId(x) !== k) : [t, ...list]);
  logEvent(had ? 'song_unliked' : 'song_liked', songParams(t));
  return !had;
}

export const readLikes = likesStore.get;

/** Rewrite liked songs in place (coverRepair.ts); order and ids unchanged. */
export function mapLikes(fn: (t: Track) => Track): void {
  likesStore.update(list => list.map(fn));
}

// ─── Settings ───────────────────────────────────────────────────────────────

export function writeSetting<K extends keyof Settings>(
  key: K,
  value: Settings[K],
): void {
  settingsStore.update(s => ({...s, [key]: value}));
  logSetting(key, value);
}

export function writeSettings(patch: Partial<Settings>): void {
  settingsStore.update(s => ({...s, ...patch}));
  for (const [key, value] of Object.entries(patch)) {
    logSetting(key, value);
  }
}

/** Every settings write is a person changing something: nothing else calls
 *  writeSetting. `setting_value`, not `value`: GA reserves `value` for money. */
function logSetting(key: string, value: unknown): void {
  logEvent('setting_changed', {setting: key, setting_value: String(value)});
}

export function resetSettings(): void {
  settingsStore.set({...DEFAULT_SETTINGS});
}

export const readSettings = settingsStore.get;
/** Run `fn` after every settings change. Returns the unsubscribe. */
export const onSettingsChange = (fn: () => void) => settingsStore.subscribe(fn);

/** Effective streaming bitrate. "Auto" (0) resolves to 320 — the backend walks
 *  its own ladder down from there if the source can't serve it. */
export function currentQuality(): number {
  const s = settingsStore.get();
  const q = s.audioQuality && s.audioQuality > 0 ? s.audioQuality : 320;
  // The data saver caps it on mobile data only; Wi-Fi gets the choice as set.
  return s.dataSaver && cellular ? Math.min(q, DATA_SAVER_KBPS) : q;
}

/** The chosen languages as the engine wants them: "hindi,english". */
export function homeLanguageParam(): string {
  const l = settingsStore.get().homeLanguages;
  return (Array.isArray(l) && l.length ? l : ['hindi', 'english']).join(',');
}

// ─── Hydration + hooks ──────────────────────────────────────────────────────

/**
 * Load everything persisted, once, at startup.
 *
 * Stores register themselves with the storage registry when created, so this
 * doesn't need to know which stores exist — which is what keeps store.ts from
 * having to import collections.ts, which imports store.ts right back.
 *
 * Importing the modules for side effect is what puts them in that registry;
 * without these, a store nothing has rendered yet would never be loaded.
 */
export async function hydrate(): Promise<void> {
  await hydrateAll();
}

export const useSettings = () => useStoreValue(settingsStore);
export const useLikes = () => useStoreValue(likesStore);

/** Both halves at once, for screens that need them together. */
export function useStore(): {likes: Track[]; settings: Settings} {
  const likes = useSyncExternalStore(likesStore.subscribe, likesStore.get);
  const settings = useSyncExternalStore(
    settingsStore.subscribe,
    settingsStore.get,
  );
  return {likes, settings};
}

/** Liked state for one track, plus a toggle bound to it. */
export function useLike(track: Track | null) {
  // A BOOLEAN subscription, not the whole array. Reading `likes` here meant
  // liking one song re-rendered every row in every mounted list; now a row
  // re-renders only when its own liked-ness actually changes.
  const id = track ? getTrackId(track) : '';
  const liked = useStoreSelector(likesStore, list =>
    id ? list.some(x => getTrackId(x) === id) : false,
  );
  const toggle = useCallback(() => {
    if (track) {
      toggleLike(track);
    }
  }, [track]);
  return {liked, toggle};
}
