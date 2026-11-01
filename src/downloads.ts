/**
 * In-flight downloads, with live progress.
 *
 * The backend runs each download as a task and reports percentage on
 * /api/download/<id>, so this holds the set of tasks the user has started and
 * polls them until they finish. Without it a download was invisible until it
 * completed and popped into the folder, which reads as "nothing happened".
 *
 * Tasks live in memory only. A download that was still running when the app
 * closed is finished by the backend regardless, and the file appears on the
 * next disk scan — so persisting a stale "in progress" row would be a lie.
 */
import {useMemo, useSyncExternalStore} from 'react';
import {AppState, PermissionsAndroid, Platform} from 'react-native';
import {
  apiUrl,
  getDownloadStatus,
  getLocalLibrary,
  getLyrics,
  startDownload,
  waitForBackend,
  type Track,
} from './backend';
import {
  addLocalFile,
  dropLocalFiles,
  setLocalFiles,
  useLocalTracks,
  withLocalFile,
} from './localFiles';
import {isOffline} from './offline';
import {onLikesChange, onMobileData, readLikes, readSettings} from './store';
import {getBestArtworkUrl, getDownloadKey} from './tracks';
import {createStore, asArray} from './storage';
import {toast} from './toast';
import {logEvent, songParams} from './analytics';
import {createEmitter} from './emitter';

/**
 * Artwork for downloaded songs, persisted.
 *
 * The disk scan deliberately returns no cover art (reading embedded art for
 * every file on every scan is heavy), so a scanned track arrives artless. The
 * cover IS known at the moment the download starts — the catalog track has it
 * — so it's remembered here, keyed by track identity, and laid back over the
 * scan results. Capped so it can't grow forever.
 */
const artCache = createStore<Array<[string, string]>>(
  'mp.downloadArt.v1',
  [],
  raw =>
    asArray<unknown>(raw).filter(
      (x): x is [string, string] => Array.isArray(x) && x.length === 2,
    ),
);

function rememberArtwork(track: Track): void {
  const art = getBestArtworkUrl(track);
  if (!art) {
    return;
  }
  // Keyed the way the SCAN will ask for it — see getDownloadKey. Storing this
  // under the catalog id meant the lookup below could never hit.
  const id = getDownloadKey(track);
  const rest = artCache.get().filter(([k]) => k !== id);
  const entry: [string, string] = [id, art];
  artCache.set([entry, ...rest].slice(0, 500));
}

/** The web address of a download's cover, for sending to another phone. */
export function rememberedArtwork(track: Track): string | undefined {
  return new Map(artCache.get()).get(getDownloadKey(track));
}

/** The cover inside a downloaded file, which is there with no internet. */
export function embeddedArtworkUrl(path: string): string {
  return apiUrl(`/local/artwork?path=${encodeURIComponent(path)}`);
}

/** Fill in artwork for disk-scanned tracks: the cover in the file itself first,
 *  then the one remembered at download time, a web address that needs the
 *  internet or an image cache that still has it. */
function overlayDownloadArtwork(tracks: Track[]): Track[] {
  const map = new Map(artCache.get());
  return tracks.map(t => {
    if (t.file_path && t.has_embedded_art) {
      return {
        ...t,
        artwork_url: embeddedArtworkUrl(t.file_path),
        artwork_urls: undefined,
      };
    }
    if (t.artwork_url) {
      return t;
    }
    const remembered = map.get(getDownloadKey(t));
    if (remembered) {
      return {...t, artwork_url: remembered};
    }
    // `has_embedded_art` is undefined on an older backend, in which case try
    // anyway — that is the previous behaviour, and a miss costs one 404.
    if (t.file_path && t.has_embedded_art !== false) {
      return {...t, artwork_url: embeddedArtworkUrl(t.file_path)};
    }
    return t;
  });
}

// ─── What's already on disk ─────────────────────────────────────────────────

const accessAsked = createStore<boolean>(
  'mp.musicAccessAsked.v1',
  false,
  raw => raw === true,
);

/**
 * Android shows an app only the files it wrote itself, so after a reinstall
 * every song in the Download folder is there but invisible, until this is
 * allowed. Asked once, where the songs would be missing from.
 */
export async function askForMusicAccess(): Promise<void> {
  if (accessAsked.get()) {
    return;
  }
  accessAsked.set(true);
  await PermissionsAndroid.request(
    Number(Platform.Version) >= 33
      ? PermissionsAndroid.PERMISSIONS.READ_MEDIA_AUDIO
      : PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE,
  ).catch(() => {});
}

/** One scan at a time; a request during one is answered by one more after. */
let scanning: Promise<void> | null = null;
let scanAgain = false;

/**
 * Read the folder again: what every screen lists, and how every queue finds a
 * song's file. A failed scan leaves the last answer standing, which is what
 * keeps the list there while the engine is busy or restarting.
 */
export function refreshDownloads(): Promise<void> {
  if (scanning) {
    scanAgain = true;
    return scanning;
  }
  scanning = (async () => {
    do {
      scanAgain = false;
      try {
        const {tracks} = await getLocalLibrary();
        setLocalFiles(tracks);
        // Anything finishing during that scan may have landed behind it.
        jobs
          .filter(j => j.status === 'done' && j.filePath)
          .forEach(j => addLocalFile(j.track, j.filePath!));
      } catch {}
    } while (scanAgain);
    scanning = null;
  })();
  return scanning;
}

/** Enough at once to make headway, few enough to leave the music its network. */
const MAX_AUTO_JOBS = 3;

/**
 * "Keep Liked Songs offline": fetch the likes not yet on the phone, a few at a
 * time. Each one finishing calls this again, which is what works through a
 * long list. Never on mobile data, where nobody asked to spend it.
 */
export function downloadLikes(): void {
  if (!readSettings().keepLikedOffline || isOffline() || onMobileData()) {
    return;
  }
  const running = jobs.filter(
    j => j.status === 'queued' || j.status === 'downloading',
  ).length;
  readLikes()
    .filter(
      t =>
        !withLocalFile(t).file_path &&
        !jobs.some(j => getDownloadKey(j.track) === getDownloadKey(t)),
    )
    .slice(0, Math.max(0, MAX_AUTO_JOBS - running))
    .forEach(t => enqueueDownload(t).catch(() => {}));
}

/** The first scan once the engine is up, then every return to the app, which
 *  is when a file may have been removed outside it. */
export function watchDownloads(): () => void {
  waitForBackend().then(async ok => {
    if (ok) {
      await refreshDownloads();
      downloadLikes();
    }
  });
  const sub = AppState.addEventListener('change', s => {
    if (s === 'active') {
      refreshDownloads().then(downloadLikes);
    }
  });
  const stopLikes = onLikesChange(downloadLikes);
  return () => {
    sub.remove();
    stopLikes();
  };
}

/** The downloaded songs, covers included. Every list of them is this one. */
export function useDownloads(): Track[] {
  const tracks = useLocalTracks();
  return useMemo(() => overlayDownloadArtwork(tracks), [tracks]);
}

export type DownloadJob = {
  taskId: string;
  track: Track;
  /** 0..1, or null while the backend has only queued it. */
  progress: number | null;
  status: 'queued' | 'downloading' | 'done' | 'error';
  error?: string;
  filePath?: string;
};

let jobs: DownloadJob[] = [];
const changes = createEmitter();
let timer: ReturnType<typeof setInterval> | null = null;
let polling = false;

function emit() {
  jobs = [...jobs];
  changes.emit();
}

function stopPolling() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

/** Poll every active task. Stops by itself once nothing is in flight. */
function ensurePolling() {
  if (timer) {
    return;
  }
  timer = setInterval(async () => {
    // A tick can outlast the 500 ms while the engine is busy. A second one
    // running alongside it would report the same finished download twice.
    if (polling) {
      return;
    }
    const active = jobs.filter(
      j => j.status === 'queued' || j.status === 'downloading',
    );
    if (!active.length) {
      stopPolling();
      return;
    }
    polling = true;
    await Promise.all(
      active.map(async job => {
        try {
          const t = await getDownloadStatus(job.taskId);
          const raw = Number(t.progress);
          // The backend reports 0..100; normalise once, here.
          job.progress = Number.isFinite(raw)
            ? Math.min(1, raw / 100)
            : job.progress;
          if (t.status === 'completed' || t.status === 'done') {
            job.status = 'done';
            job.progress = 1;
            if (t.file_path) {
              job.filePath = t.file_path;
              addLocalFile(job.track, t.file_path);
            }
            // Re-scan now, not on the next Library visit. Until this existed,
            // the Downloaded collection and every ⋮ sheet outside Library were
            // stale until you happened to open the tab.
            refreshDownloads();
            logEvent('song_downloaded', songParams(job.track));
            downloadLikes();
            // Fetched now while there is internet: the engine keeps them on
            // disk, so they are there when this song plays without it.
            getLyrics(
              job.track.title,
              job.track.artist,
              job.track.duration_ms ?? 0,
            ).catch(() => {});
          } else if (t.status === 'failed' || t.status === 'error') {
            job.status = 'error';
            job.error = t.error;
            logEvent('download_failed', {
              ...songParams(job.track),
              error: String(t.error ?? ''),
            });
          } else {
            job.status = 'downloading';
          }
        } catch {
          // Transient; the next tick tries again.
        }
      }),
    );
    polling = false;
    emit();

    // Clear finished rows a moment later so the bar is seen completing.
    const settled = jobs.filter(j => j.status === 'done');
    if (settled.length) {
      setTimeout(() => {
        jobs = jobs.filter(j => j.status !== 'done');
        emit();
      }, 1500);
    }
  }, 500);
}

/** A download is gone: drop it from the record, or every row keeps its tick
 *  and the queue keeps asking for a file that is not there. */
export function forgetDownloads(tracks: Track[]): void {
  dropLocalFiles(tracks);
  refreshDownloads();
}

/** Start a download and track it. Ignores a track already in flight — and one
 *  already ON DISK, which used to be re-downloadable indefinitely. */
export async function enqueueDownload(track: Track): Promise<void> {
  const id = getDownloadKey(track);
  if (withLocalFile(track).file_path) {
    toast('Already downloaded');
    return;
  }
  if (isOffline()) {
    toast("You're offline. Download this when you're back.");
    return;
  }
  if (jobs.some(j => getDownloadKey(j.track) === id && j.status !== 'error')) {
    return;
  }
  const res = await startDownload(track);
  if (!res.task_id) {
    toast(res.error || 'Could not start that download');
    return;
  }
  logEvent('download_started', songParams(track));
  rememberArtwork(track);
  jobs = [
    ...jobs,
    {taskId: res.task_id, track, progress: null, status: 'queued'},
  ];
  emit();
  ensurePolling();
}

export function useDownloadJobs(): DownloadJob[] {
  return useSyncExternalStore(
    changes.subscribe,
    () => jobs,
  );
}
