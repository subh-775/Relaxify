/**
 * Jam: friends listening together, each phone streaming the music itself.
 *
 * Only four things are shared, through a Firebase Realtime Database record
 * under the Jam's code: which song, where in it, playing or paused, and a
 * queue anyone can add to. No audio travels between phones.
 *
 *   jams/{code} = {
 *     expiresAt, members: {id: {name, seen}},
 *     now: {track, next, pos, playing, at, by, seq},
 *     queue: {key: {track, by}},
 *   }
 *
 * Everyone controls: a song picked, a pause, a play or a jump within a song on
 * any phone is written as the new `now`, and every other phone follows. The
 * phone that made the last choice (`now.by`) is also the one that moves on
 * when a song ends: it plays the Jam queue's first song if there is one, and
 * shares what comes after (`next`). The other phones keep that `next` queued
 * locally with their own autoplay held, so when a song ends they move on in
 * step even with the screen off, without asking the network.
 *
 * Phones check the record every POLL_MS while the app is open, and at once on
 * every track change (a native event, so also with the screen off). Clocks
 * differ between phones, so positions are timed against the database's own
 * clock, measured once when joining.
 *
 * A code is six characters from 32 unambiguous ones: about a billion codes, so
 * a Jam cannot be found without being given its code. The database rules
 * (firebase/database.rules.json) allow nothing else.
 */
import {AppState} from 'react-native';
import {useSyncExternalStore} from 'react';
import {search, type Track} from './backend';
import {
  Event,
  State,
  TrackPlayer,
  addToQueue,
  holdAutoplay,
  peekAdjacentTrack,
  playTrack,
  sourceTrackFor,
} from './player';
import {getTrackId} from './tracks';
import {logEvent} from './analytics';
import {toast} from './toast';

export const JAM_DB =
  'https://relaxify-observability-default-rtdb.asia-southeast1.firebasedatabase.app';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LEN = 6;
const POLL_MS = 1500;
/** Past this much disagreement, a following phone jumps to the Jam's spot. */
const DRIFT_S = 1.5;
/** Local player events this soon after following the Jam are the echo of
 *  that, not a choice made on this phone. */
const ECHO_MS = 2500;
/** A Jam nobody ends stops being joinable after this long. */
const LIFETIME_MS = 6 * 60 * 60 * 1000;
/** A member not heard from for this long is no longer shown. */
const MEMBER_STALE_MS = 30_000;

type Now = {
  track: Track;
  next?: Track | null;
  pos: number;
  playing: boolean;
  at: number;
  by: string;
  seq: number;
};
type Member = {name: string; seen: number};
type QueueItem = {track: Track; by: string};
type Record_ = {
  expiresAt?: number;
  members?: Record<string, Member>;
  now?: Now;
  queue?: Record<string, QueueItem>;
};

export type JamView = {
  code: string;
  me: string;
  host: boolean;
  members: {id: string; name: string}[];
  now: Now | null;
  queue: {key: string; track: Track; by: string}[];
};

// ── state ────────────────────────────────────────────────────────────────
let view: JamView | null = null;
const listeners = new Set<() => void>();
function emit() {
  listeners.forEach(l => l());
}
export function useJam(): JamView | null {
  return useSyncExternalStore(
    l => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => view,
  );
}
export function inJam(): boolean {
  return !!view;
}

let myId = '';
let myName = '';
let offset = 0; // server clock minus this phone's clock, in ms
let appliedSeq = -1;
let echoUntil = 0;
let poll: ReturnType<typeof setInterval> | null = null;
let lastBeat = 0;
let unsubs: (() => void)[] = [];

// ── REST ─────────────────────────────────────────────────────────────────
const url = (path: string) => `${JAM_DB}/${path}.json`;
const SERVER_TIME = {'.sv': 'timestamp'};

async function call<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const res = await fetch(url(path), {
    method,
    headers: body === undefined ? undefined : {'Content-Type': 'application/json'},
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Jam ${method} ${res.status}`);
  }
  return (await res.json()) as T;
}

export function newCode(rand: () => number = Math.random): string {
  let c = '';
  for (let i = 0; i < CODE_LEN; i++) {
    c += ALPHABET[Math.floor(rand() * ALPHABET.length)];
  }
  return c;
}

export function normalizeCode(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .replace(/O/g, '0')
    .replace(/I/g, '1')
    .slice(0, CODE_LEN);
}

export function validCode(code: string): boolean {
  return (
    code.length === CODE_LEN && [...code].every(ch => ALPHABET.includes(ch))
  );
}

/** What travels for a song: enough to play it, nothing from this phone's disk. */
function shareable(t: Track): Track {
  const rest = {...t};
  delete rest.file_path;
  delete rest.has_embedded_art;
  return rest;
}

/** The server clock's offset from ours, from one timed write. */
async function measureOffset(code: string): Promise<void> {
  const t0 = Date.now();
  const seen = await call<number>(`jams/${code}/members/${myId}/seen`, 'PUT', SERVER_TIME);
  const t1 = Date.now();
  if (typeof seen === 'number') {
    offset = seen - (t0 + t1) / 2;
  }
}
const serverNow = () => Date.now() + offset;

// ── publishing a choice made on this phone ──────────────────────────────
let seq = 0;
async function publish(code: string): Promise<void> {
  try {
    const active = await TrackPlayer.getActiveTrack();
    const track = sourceTrackFor(active ?? null);
    if (!track) {
      return;
    }
    const [{position}, {state}] = await Promise.all([
      TrackPlayer.getProgress(),
      TrackPlayer.getPlaybackState(),
    ]);
    const nextRow = peekAdjacentTrack(1);
    const next = nextRow ? sourceTrackFor(nextRow) : null;
    seq = Math.max(seq, appliedSeq) + 1;
    appliedSeq = seq;
    const now: Now = {
      track: shareable(track),
      next: next ? shareable(next) : null,
      pos: position,
      playing: state === State.Playing || state === State.Buffering,
      at: serverNow(),
      by: myId,
      seq,
    };
    await call(`jams/${code}/now`, 'PUT', now);
    holdAutoplay(false); // the phone that chose plays on by itself
  } catch {
    // A missed write is caught up by the next choice or the next poll.
  }
}

// ── following the Jam ────────────────────────────────────────────────────
function same(a?: Track | null, b?: Track | null): boolean {
  return !!a && !!b && getTrackId(a) === getTrackId(b);
}

/** A shared song this phone may not have a source for: find it by name. */
async function playable(t: Track): Promise<Track> {
  if (t.sources && Object.keys(t.sources).length) {
    return t;
  }
  const [hit] = await search(`${t.title} ${t.artist}`, 1).catch(() => []);
  return hit ?? t;
}

async function follow(now: Now): Promise<void> {
  echoUntil = Date.now() + ECHO_MS;
  holdAutoplay(now.by !== myId);
  const active = sourceTrackFor((await TrackPlayer.getActiveTrack()) ?? null);
  const expected =
    now.pos + (now.playing ? Math.max(0, serverNow() - now.at) / 1000 : 0);
  if (!same(active, now.track)) {
    const track = await playable(now.track);
    const next = now.next ? await playable(now.next) : null;
    await playTrack(track, next ? [track, next] : [track]);
    echoUntil = Date.now() + ECHO_MS;
    if (expected > 2) {
      await TrackPlayer.seekTo(expected);
    }
  } else {
    const {position} = await TrackPlayer.getProgress();
    if (Math.abs(position - expected) > DRIFT_S) {
      await TrackPlayer.seekTo(expected);
    }
  }
  const {state} = await TrackPlayer.getPlaybackState();
  const playingHere = state === State.Playing || state === State.Buffering;
  if (now.playing && !playingHere) {
    await TrackPlayer.play();
  } else if (!now.playing && playingHere) {
    await TrackPlayer.pause();
  }
}

async function sync(): Promise<void> {
  const v = view;
  if (!v) {
    return;
  }
  let rec: Record_ | null;
  try {
    rec = await call<Record_ | null>(`jams/${v.code}`);
  } catch {
    return; // offline for a moment; the next poll tries again
  }
  if (!view || view.code !== v.code) {
    return;
  }
  if (!rec || (rec.expiresAt && rec.expiresAt < serverNow())) {
    stop();
    toast('The Jam has ended');
    return;
  }
  const t = serverNow();
  const members = Object.entries(rec.members ?? {})
    .filter(([, m]) => m && t - (m.seen || 0) < MEMBER_STALE_MS)
    .map(([id, m]) => ({id, name: m.name || 'Friend'}));
  const queue = Object.entries(rec.queue ?? {}).map(([key, q]) => ({
    key,
    track: q.track,
    by: q.by,
  }));
  view = {...v, members, now: rec.now ?? null, queue};
  emit();

  if (rec.now && rec.now.seq > appliedSeq && rec.now.by !== myId) {
    appliedSeq = rec.now.seq;
    follow(rec.now).catch(() => {});
  }
  if (t - lastBeat > 10_000) {
    lastBeat = t;
    call(`jams/${v.code}/members/${myId}/seen`, 'PUT', SERVER_TIME).catch(() => {});
  }
}

// ── this phone's own player, while in a Jam ──────────────────────────────
function watchLocal(code: string): void {
  const a = TrackPlayer.addEventListener(
    Event.PlaybackActiveTrackChanged,
    async e => {
      if (!view || Date.now() < echoUntil) {
        return;
      }
      // Arriving at the Jam's own song is following, however late the
      // stream took to start: never a choice to announce.
      if (same(sourceTrackFor(e.track ?? null), view.now?.track)) {
        return;
      }
      const dur = Number(e.lastTrack?.duration) || 0;
      const ended = !!e.lastTrack && dur > 0 && (e.lastPosition || 0) >= dur - 2;
      const iChose = view.now?.by === myId;
      if (!ended) {
        await publish(code); // a skip or a tap here: a choice
        return;
      }
      if (!iChose) {
        sync().catch(() => {}); // someone else moves the Jam on
        return;
      }
      // The song I chose ended: the Jam queue goes first.
      const head = view.queue[0];
      if (head) {
        try {
          echoUntil = Date.now() + ECHO_MS;
          await playTrack(await playable(head.track), [head.track]);
          await call(`jams/${code}/queue/${head.key}`, 'DELETE');
        } catch {}
      }
      await publish(code);
    },
  );
  const b = TrackPlayer.addEventListener(Event.PlaybackState, e => {
    if (!view || Date.now() < echoUntil) {
      return;
    }
    if (e.state === State.Playing || e.state === State.Paused) {
      const was = view.now?.playing;
      const is = e.state === State.Playing;
      if (was !== is) {
        publish(code).catch(() => {});
      }
    }
  });
  // A jump within the song: the position moved further than time did.
  let lastPos = -1;
  let lastAt = 0;
  const seekWatch = setInterval(async () => {
    if (!view || Date.now() < echoUntil) {
      lastPos = -1;
      return;
    }
    try {
      const {position} = await TrackPlayer.getProgress();
      const elapsed = (Date.now() - lastAt) / 1000;
      if (lastPos >= 0 && Math.abs(position - (lastPos + elapsed)) > 3) {
        publish(code).catch(() => {});
      }
      lastPos = position;
      lastAt = Date.now();
    } catch {}
  }, 1000);
  // A following phone that ran out of songs asks the Jam what is next.
  const q = TrackPlayer.addEventListener(Event.PlaybackQueueEnded, () => {
    sync().catch(() => {});
  });
  const c = AppState.addEventListener('change', s => {
    if (s === 'active') {
      sync().catch(() => {});
    }
  });
  unsubs = [
    () => a.remove(),
    () => b.remove(),
    () => clearInterval(seekWatch),
    () => q.remove(),
    () => c.remove(),
  ];
}

function begin(code: string, host: boolean): void {
  view = {code, me: myId, host, members: [], now: null, queue: []};
  appliedSeq = -1;
  emit();
  watchLocal(code);
  poll = setInterval(() => sync().catch(() => {}), POLL_MS);
  sync().catch(() => {});
}

function stop(): void {
  if (poll) {
    clearInterval(poll);
    poll = null;
  }
  unsubs.forEach(u => u());
  unsubs = [];
  holdAutoplay(false);
  view = null;
  emit();
}

// ── what the Jam screen calls ────────────────────────────────────────────
export async function startJam(name: string): Promise<string> {
  myId = myId || newCode();
  myName = name.trim() || 'Friend';
  let code = newCode();
  for (let i = 0; i < 3; i++) {
    const taken = await call<Record_ | null>(`jams/${code}/expiresAt`).catch(() => null);
    if (!taken) {
      break;
    }
    code = newCode();
  }
  await call(`jams/${code}`, 'PUT', {
    expiresAt: Date.now() + LIFETIME_MS,
    members: {[myId]: {name: myName, seen: SERVER_TIME}},
  });
  await measureOffset(code);
  begin(code, true);
  await publish(code); // what is playing now is where the Jam starts
  logEvent('jam_started', {});
  return code;
}

export async function joinJam(raw: string, name: string): Promise<boolean> {
  const code = normalizeCode(raw);
  if (!validCode(code)) {
    return false;
  }
  const rec = await call<Record_ | null>(`jams/${code}`).catch(() => null);
  if (!rec || (rec.expiresAt && rec.expiresAt < Date.now())) {
    return false;
  }
  myId = myId || newCode();
  myName = name.trim() || 'Friend';
  await call(`jams/${code}/members/${myId}`, 'PUT', {name: myName, seen: SERVER_TIME});
  await measureOffset(code);
  begin(code, false);
  logEvent('jam_joined', {});
  return true;
}

export async function leaveJam(): Promise<void> {
  const v = view;
  stop();
  if (v) {
    if (v.host) {
      await call(`jams/${v.code}`, 'DELETE').catch(() => {});
    } else {
      await call(`jams/${v.code}/members/${v.me}`, 'DELETE').catch(() => {});
    }
  }
}

/** Add a song to the Jam's shared queue (instead of this phone's queue). */
export async function addToJam(track: Track): Promise<void> {
  const v = view;
  if (!v) {
    await addToQueue(track);
    return;
  }
  await call(`jams/${v.code}/queue`, 'POST', {track: shareable(track), by: myName});
  sync().catch(() => {});
}
