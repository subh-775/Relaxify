/**
 * Shared playlists: send a friend a code, and they follow your playlist.
 *
 * In the Jam database (firebase/database.rules.json), under shared/{code}:
 *   data  = {name, by, v, tracks}   readable by anyone who has the code
 *   key   = the owner's secret      written once, never readable
 *   proof = "{key}:{version}"       new with every change, never readable
 * The rules take a change to `data` only when the same write brings a NEW
 * `proof` that begins with `key`. Only the phone that shared it knows the
 * key, so only it can change the playlist, with no account or sign-in. The
 * proof has to be new each time because an old one stays stored: a check
 * against the stored value alone let a stranger edit a single field. Six characters from 32 give about a billion codes,
 * and nothing lists them, as with a Jam.
 *
 * Owner: sharing makes the code and pushes the playlist; every later change
 * to it is pushed (debounced); deleting it or "Stop sharing" empties `data`,
 * and followers keep what they had as their own playlist.
 *
 * Follower: a code opens the playlist into the Library (playlists.ts
 * followPlaylist). It refreshes after the app opens and when it comes back
 * to the front: a new version replaces it quietly and shows as New.
 */
import {AppState} from 'react-native';
import type {Track} from './backend';
import {
  call,
  newCode,
  normalizeCode,
  phoneName,
  savedName,
  validCode,
} from './jam';
import {createStore, useStoreValue} from './storage';
import {
  followPlaylist,
  onPlaylistsChanged,
  readPlaylists,
  updateFollowed,
  type Playlist,
  type SharedCopy,
} from './playlists';
import {logEvent} from './analytics';

/** What the owner's phone keeps per shared playlist: its code and secret. */
type Share = {code: string; key: string; v: number};

const shares = createStore<Record<string, Share>>('mp.sharedOut.v1', {}, raw =>
  raw && typeof raw === 'object' && !Array.isArray(raw)
    ? (raw as Record<string, Share>)
    : {},
);

export const useShares = () => useStoreValue(shares);

/** The most songs one shared playlist carries. */
const MAX_TRACKS = 500;
/** Edits in a burst go out as one push. */
const PUSH_DEBOUNCE_MS = 2000;

const KEY_CHARS =
  'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

function newKey(): string {
  let k = '';
  for (let i = 0; i < 40; i++) {
    k += KEY_CHARS[Math.floor(Math.random() * KEY_CHARS.length)];
  }
  return k;
}

/** The name a friend sees: the one you use in a Jam, or your phone's. */
export function shareName(): string {
  return (savedName.get().trim() || phoneName()).slice(0, 24);
}

/**
 * A song as it travels: enough to play it and draw it. Nothing from this
 * phone's disk, and only sources that can actually play. The database
 * rejects `undefined`, so absent fields are left out rather than sent.
 */
export function slimTrack(t: Track): Track {
  const sources: Record<string, {url: string}> = {};
  for (const [s, d] of Object.entries(t.sources || {})) {
    if (d?.url) {
      sources[s] = {url: d.url};
    }
  }
  const out: Record<string, unknown> = {
    title: t.title || '',
    artist: t.artist || '',
    sources,
  };
  for (const k of [
    'album',
    'duration_ms',
    'isrc',
    'primary_source',
    'playable_source',
    'artwork_url',
  ] as const) {
    if (t[k] != null && t[k] !== '') {
      out[k] = t[k];
    }
  }
  return out as Track;
}

function snapshot(p: Playlist, v: number) {
  return {
    name: p.name.slice(0, 100),
    by: shareName(),
    v,
    tracks: (p.tracks || [])
      .filter(t => !t.file_path || Object.keys(t.sources || {}).length)
      .slice(0, MAX_TRACKS)
      .map(slimTrack),
  };
}

/** The code this playlist is shared under, or null. */
export function shareCodeOf(playlistId: string): string | null {
  return shares.get()[playlistId]?.code ?? null;
}

/**
 * Share a playlist of yours. Returns its code: a new one the first time,
 * the same one after that (and the latest songs are pushed again).
 */
export async function sharePlaylist(p: Playlist): Promise<string> {
  const have = shares.get()[p.id];
  if (have) {
    await push(p.id);
    return have.code;
  }
  // A code someone already holds is refused by the rules (its key exists):
  // try another. Three misses in a billion means something else is wrong.
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = newCode();
    const key = newKey();
    const v = Date.now();
    try {
      await call(`shared/${code}`, 'PATCH', {
        key,
        proof: `${key}:${v}`,
        data: snapshot(p, v),
      });
    } catch (e) {
      if (String(e).includes(' 401') || String(e).includes(' 403')) {
        continue;
      }
      throw e;
    }
    shares.set({...shares.get(), [p.id]: {code, key, v}});
    logEvent('playlist_shared', {songs: p.tracks.length});
    return code;
  }
  throw new Error('Could not make a code. Try again.');
}

/** Send the playlist's current songs to the people following it. */
async function push(playlistId: string): Promise<void> {
  const s = shares.get()[playlistId];
  const p = readPlaylists().find(x => x.id === playlistId);
  if (!s) {
    return;
  }
  if (!p) {
    // Deleted: followers keep their copy.
    await stopSharing(playlistId);
    return;
  }
  const v = Math.max(Date.now(), s.v + 1);
  await call(`shared/${s.code}`, 'PATCH', {
    proof: `${s.key}:${v}`,
    data: snapshot(p, v),
  });
  shares.set({...shares.get(), [playlistId]: {...s, v}});
}

/** Stop sharing: followers keep what they have, as their own playlist. */
export async function stopSharing(playlistId: string): Promise<void> {
  const s = shares.get()[playlistId];
  if (!s) {
    return;
  }
  const v = Math.max(Date.now(), s.v + 1);
  await call(`shared/${s.code}`, 'PATCH', {proof: `${s.key}:${v}`, data: null});
  const rest = {...shares.get()};
  delete rest[playlistId];
  shares.set(rest);
  logEvent('playlist_share_stopped', {});
}

/** A code, or a pasted share message, as the code it carries (or ''). */
export function codeIn(text: string): string {
  const s = (text || '').trim();
  const word = normalizeCode(s);
  // A bare code only when it looks like one: typed in capitals, or with a
  // digit. "butter" typed into Search is a search, not a code.
  if (
    s.length === 6 &&
    validCode(word) &&
    (s === s.toUpperCase() || /\d/.test(s))
  ) {
    return word;
  }
  // The link (".../p/?c=K7QX2M") first: a playlist named "CHILLS" is a
  // capitalised six-letter word too, and it comes earlier in the message.
  const link = s.match(/[?&]c=([A-Za-z0-9]{6})\b/);
  if (link && validCode(normalizeCode(link[1]))) {
    return normalizeCode(link[1]);
  }
  // An older message: "...enter K7QX2M..." — the code is the one capitalised
  // six-character word in it.
  if (/relaxify/i.test(s)) {
    const m = s.match(/\b[A-HJ-NP-Z2-9]{6}\b/);
    return m ? m[0] : '';
  }
  return '';
}

function asCopy(raw: unknown): SharedCopy | null {
  const d = raw as {name?: string; by?: string; v?: number; tracks?: unknown};
  if (!d || typeof d !== 'object' || d.v == null) {
    return null;
  }
  // An empty playlist has no `tracks` at all: the database drops empty lists.
  const list = !d.tracks
    ? []
    : Array.isArray(d.tracks)
    ? d.tracks
    : Object.values(d.tracks as Record<string, Track>);
  return {
    name: String(d.name || ''),
    by: String(d.by || ''),
    v: Number(d.v) || 0,
    tracks: (list as Track[]).filter(t => t && t.title),
  };
}

/**
 * Open a friend's code into your Library. Resolves to the playlist's id, or
 * rejects with words to show.
 */
export async function openShared(raw: string): Promise<string> {
  const code = codeIn(raw) || normalizeCode(raw);
  if (!validCode(code)) {
    throw new Error('That code has six letters and numbers, like K7QX2M');
  }
  const copy = asCopy(await call(`shared/${code}/data`));
  if (!copy) {
    throw new Error('No shared playlist has that code');
  }
  logEvent('playlist_followed', {songs: copy.tracks.length});
  return followPlaylist(code, copy);
}

/** Bring every followed playlist up to date. Quiet: a failure waits for the
 *  next time. */
export async function refreshFollowed(): Promise<void> {
  const codes = readPlaylists()
    .filter(p => p.follow && !p.follow.stopped)
    .map(p => p.follow!.code);
  await Promise.all(
    codes.map(code =>
      call(`shared/${code}/data`)
        .then(raw => updateFollowed(code, asCopy(raw)))
        .catch(() => {}),
    ),
  );
}

/**
 * Start both sides: followed playlists refresh now and whenever the app
 * comes back to the front; your shared playlists push their changes.
 * Returns a stop function.
 */
export function startSharing(): () => void {
  refreshFollowed().catch(() => {});
  const fg = AppState.addEventListener('change', s => {
    if (s === 'active') {
      refreshFollowed().catch(() => {});
    }
  });
  // Push only what changed: the store notifies on every playlist edit.
  const last = new Map<string, Playlist | undefined>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const seed = () => {
    const all = readPlaylists();
    Object.keys(shares.get()).forEach(id =>
      last.set(id, all.find(p => p.id === id)),
    );
  };
  seed();
  const off = onPlaylistsChanged(() => {
    const all = readPlaylists();
    for (const id of Object.keys(shares.get())) {
      const now = all.find(p => p.id === id);
      if (now === last.get(id)) {
        continue;
      }
      last.set(id, now);
      clearTimeout(timers.get(id));
      timers.set(
        id,
        setTimeout(() => push(id).catch(() => {}), PUSH_DEBOUNCE_MS),
      );
    }
  });
  return () => {
    fg.remove();
    off();
    timers.forEach(t => clearTimeout(t));
  };
}
