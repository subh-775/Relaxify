/**
 * Music already on the phone that did not come from this app, as Android's
 * media library lists it (DeviceModule.localMusic). Kept here so the list is
 * there at launch, and marked `on_device`: these are the person's own files,
 * so the app plays them and never offers to delete or download them.
 * usePhoneMusic adds the app's own downloads back, for "On this phone".
 */
import {NativeModules} from 'react-native';
import {useMemo} from 'react';
import type {Track} from './backend';
import {getBestArtworkUrl} from './tracks';
import {readLocalTracks, useLocalTracks} from './localFiles';
import {asArray, createStore, useStoreValue} from './storage';

/** Shorter than this is a clip or a sound effect, not a song. */
const MIN_SONG_MS = 30_000;

/** Android's media library files these under music too. */
const NOT_MUSIC =
  /\/(whatsapp|telegram|recordings?|call|calls|voice recorder|ringtones|notifications|alarms)\/|\/android\/(data|media)\//i;

type DeviceSong = {
  title?: string;
  artist?: string;
  album?: string;
  duration_ms?: number;
  file_path?: string;
  artwork_url?: string;
  file_size?: number;
};

type DeviceNative = {localMusic?: () => Promise<DeviceSong[]>};

const store = createStore<Track[]>('mp.localMusic.v1', [], asArray);

/** A song from the media library, or null for what is not one. */
export function toLocalTrack(song: DeviceSong): Track | null {
  const path = song.file_path;
  if (
    !path ||
    (song.duration_ms ?? 0) < MIN_SONG_MS ||
    NOT_MUSIC.test(path)
  ) {
    return null;
  }
  return {...song, title: song.title || 'Unknown song', on_device: true} as Track;
}

let reading = false;

/** Ask Android again. Empty without the permission, which leaves the row out. */
export async function refreshLocalMusic(): Promise<void> {
  const native = NativeModules.Device as DeviceNative | undefined;
  if (reading || !native?.localMusic) {
    return;
  }
  reading = true;
  try {
    const songs = await native.localMusic();
    store.set(
      songs.map(toLocalTrack).filter((t): t is Track => t !== null),
    );
  } catch {
    // The last list stands.
  } finally {
    reading = false;
  }
}

/** Without what this app downloaded, which has its own list. */
function others(tracks: Track[], downloads: Track[]): Track[] {
  const ours = new Set(downloads.map(t => t.file_path));
  return tracks.filter(t => !ours.has(t.file_path));
}

export function readLocalMusic(): Track[] {
  return others(store.get(), readLocalTracks());
}

export function useLocalMusic(): Track[] {
  const tracks = useStoreValue(store);
  const downloads = useLocalTracks();
  return useMemo(() => others(tracks, downloads), [tracks, downloads]);
}

/** Every song on the phone, for "On this phone": the app's downloads too,
 *  which a person counts as on their phone ("Smiling" was missing from it).
 *  A download is listed as the app's own row, so it can still be deleted,
 *  and one Android has not indexed yet is listed all the same. */
function everything(tracks: Track[], downloads: Track[]): Track[] {
  const ours = new Map(downloads.map(t => [t.file_path, t]));
  const listed = new Set<string | undefined>();
  const all = tracks.map(t => {
    listed.add(t.file_path);
    const own = ours.get(t.file_path);
    // A download that lost its cover (a YouTube .webm carries none) wears
    // the one Android found for the file.
    return own
      ? getBestArtworkUrl(own)
        ? own
        : {...own, artwork_url: t.artwork_url}
      : t;
  });
  const fresh = downloads.filter(t => !listed.has(t.file_path));
  if (!fresh.length) {
    return all;
  }
  return [...all, ...fresh].sort((a, b) =>
    (a.title || '').localeCompare(b.title || '', undefined, {
      sensitivity: 'base',
    }),
  );
}

export function usePhoneMusic(): Track[] {
  const tracks = useStoreValue(store);
  const downloads = useLocalTracks();
  return useMemo(() => everything(tracks, downloads), [tracks, downloads]);
}
