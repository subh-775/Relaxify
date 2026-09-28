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
 * Changes arrive through the database's live stream (server-sent events, read
 * with an XMLHttpRequest that reports text as it comes), about a second after
 * they are written; a slow poll backs it up, and every track change fetches
 * at once (a native event, so also with the screen off). Clocks
 * differ between phones, so positions are timed against the database's own
 * clock (bestOffset), re-measured with every heartbeat.
 *
 * Keeping in step: the Jam's `now` is a timeline (at server time `at`, the
 * song was at `pos`). Every phone, the chooser too, checks itself against it
 * every ALIGN_MS and corrects: a gap under a few hundredths of a second is
 * left alone, a small one is closed by playing a few percent faster or
 * slower for a moment (ExoPlayer keeps the pitch, so it is not heard), and a
 * big one by a jump. What no app can see is the delay after the phone, such
 * as Bluetooth headphones adding a fifth of a second.
 *
 * A code is six characters from 32 unambiguous ones: about a billion codes, so
 * a Jam cannot be found without being given its code. The database rules
 * (firebase/database.rules.json) allow nothing else.
 */
import {AppState, Platform} from 'react-native';
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
  playbackRate,
  sourceTrackFor,
  topUpFromRadio,
  warmTrack,
} from './player';
import {getTrackId} from './tracks';
import {logEvent} from './analytics';
import {toast} from './toast';

export const JAM_DB =
  'https://relaxify-observability-default-rtdb.asia-southeast1.firebasedatabase.app';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LEN = 6;
/** A slow backup: changes arrive through the live stream (listen). */
const POLL_MS = 5000;
/** How often each phone checks itself against the Jam's timeline. */
const ALIGN_MS = 2000;
/** Closer than this counts as together: about a video frame. */
export const SYNC_OK_S = 0.03;
/** Further than this, a speed nudge would take too long: jump instead. */
export const SEEK_S = 0.4;
/** A nudge plays this much faster or slower (4%), pitch kept. */
export const NUDGE = 0.04;
/** A jump lands this far ahead, since playback takes a moment to restart. */
const SEEK_LEAD_S = 0.08;
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
let stream: XMLHttpRequest | null = null;

/**
 * The live stream: the database pushes an event whenever the Jam changes, and
 * each event triggers a fetch of the whole (small) record. Uncompressed on
 * purpose: gzip makes the server hold events back until a buffer fills.
 * Reopened when it drops, and every half megabyte, since the text piles up.
 */
function listen(code: string): void {
  const xhr = new XMLHttpRequest();
  stream = xhr;
  let seen = 0;
  xhr.onprogress = () => {
    const text = xhr.responseText || '';
    const chunk = text.slice(seen);
    seen = text.length;
    if (/event: (put|patch)/.test(chunk)) {
      sync().catch(() => {});
    }
    if (text.length > 512 * 1024) {
      xhr.abort();
    }
  };
  const again = () => {
    if (stream === xhr && view?.code === code) {
      setTimeout(() => stream === xhr && listen(code), 2000);
    }
  };
  xhr.onerror = again;
  xhr.onload = again;
  xhr.onabort = again;
  xhr.open('GET', url(`jams/${code}`));
  xhr.setRequestHeader('Accept', 'text/event-stream');
  xhr.setRequestHeader('Accept-Encoding', 'identity');
  xhr.send();
}

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

/** The name a phone shows in a Jam when nobody typed one: its model. */
function phoneName(): string {
  const c = Platform.constants as {Model?: string};
  return (c?.Model || 'Friend').slice(0, 24);
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

export type ClockSample = {offset: number; rtt: number};

/**
 * The server clock's offset from ours, NTP's way: each timed write gives an
 * estimate that can be wrong by up to half its round trip, so the fastest
 * round trip of the recent ones is the one to trust. One sample, as before,
 * could be a quarter of a second out on a slow moment.
 */
export function bestOffset(samples: ClockSample[]): number {
  return samples.reduce((b, x) => (x.rtt < b.rtt ? x : b)).offset;
}

let clock: ClockSample[] = [];

/** One timed write (also the member heartbeat), kept as a clock sample. */
async function sampleClock(code: string): Promise<void> {
  const t0 = Date.now();
  const seen = await call<number>(`jams/${code}/members/${myId}/seen`, 'PUT', SERVER_TIME);
  const t1 = Date.now();
  if (typeof seen === 'number') {
    clock = [...clock.slice(-7), {offset: seen - (t0 + t1) / 2, rtt: t1 - t0}];
    offset = bestOffset(clock);
  }
}

async function measureOffset(code: string): Promise<void> {
  clock = [];
  for (let i = 0; i < 4; i++) {
    await sampleClock(code).catch(() => {});
  }
}
const serverNow = () => Date.now() + offset;

// ── keeping in step ──────────────────────────────────────────────────────
export type Correction =
  | {kind: 'none'}
  | {kind: 'seek'}
  | {kind: 'nudge'; rate: number; forMs: number};

/**
 * What to do about being `drift` seconds off the Jam (positive: ahead),
 * playing at `base` speed. A nudge runs just long enough to close the gap.
 */
export function correction(drift: number, base = 1): Correction {
  const gap = Math.abs(drift);
  if (gap <= SYNC_OK_S) {
    return {kind: 'none'};
  }
  if (gap > SEEK_S) {
    return {kind: 'seek'};
  }
  const rate = base * (drift > 0 ? 1 - NUDGE : 1 + NUDGE);
  return {kind: 'nudge', rate, forMs: Math.round((gap / (base * NUDGE)) * 1000)};
}

/** Where the Jam's song is now, by the shared timeline. */
function expectedAt(now: Now, serverMs: number): number {
  return now.pos + (now.playing ? Math.max(0, serverMs - now.at) / 1000 : 0);
}

let nudging: ReturnType<typeof setTimeout> | null = null;

function endNudge(): void {
  if (nudging) {
    clearTimeout(nudging);
    nudging = null;
    TrackPlayer.setRate(playbackRate()).catch(() => {});
  }
}

/** Check this phone against the Jam's timeline and correct it. */
async function align(): Promise<void> {
  const now = view?.now;
  if (!now || !now.playing || nudging) {
    return;
  }
  const active = sourceTrackFor((await TrackPlayer.getActiveTrack()) ?? null);
  if (!same(active, now.track)) {
    return;
  }
  const {state} = await TrackPlayer.getPlaybackState();
  if (state !== State.Playing) {
    return; // buffering or paused: the position is not moving yet
  }
  // The position is read over a native round trip; time it at the middle.
  const t0 = Date.now();
  const {position} = await TrackPlayer.getProgress();
  const mid = (t0 + Date.now()) / 2;
  const drift = position - expectedAt(now, mid + offset);
  const fix = correction(drift, playbackRate());
  if (fix.kind === 'seek') {
    echoUntil = Date.now() + ECHO_MS;
    await TrackPlayer.seekTo(expectedAt(now, serverNow()) + SEEK_LEAD_S);
  } else if (fix.kind === 'nudge') {
    await TrackPlayer.setRate(fix.rate);
    // Back to normal speed once the gap is closed (clearing a timer that
    // has already fired, as endNudge does then, is harmless).
    nudging = setTimeout(endNudge, fix.forMs);
  }
}

/** Wait (briefly) for a freshly loaded song to actually be playing. */
async function untilPlaying(ms = 8000): Promise<void> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const {state} = await TrackPlayer.getPlaybackState();
    if (state === State.Playing) {
      return;
    }
    await new Promise(r => setTimeout(r, 100));
  }
}

// ── publishing a choice made on this phone ──────────────────────────────
let seq = 0;
async function publish(code: string): Promise<void> {
  try {
    const active = await TrackPlayer.getActiveTrack();
    const track = sourceTrackFor(active ?? null);
    if (!track) {
      return;
    }
    // Timed at the middle of the native round trip, so `at` is when the
    // position was really read, not a little after.
    const t0 = Date.now();
    const [{position}, {state}] = await Promise.all([
      TrackPlayer.getProgress(),
      TrackPlayer.getPlaybackState(),
    ]);
    const readAt = (t0 + Date.now()) / 2 + offset;
    const nextRow = peekAdjacentTrack(1);
    const next = nextRow ? sourceTrackFor(nextRow) : null;
    seq = Math.max(seq, appliedSeq) + 1;
    appliedSeq = seq;
    const now: Now = {
      track: shareable(track),
      next: next ? shareable(next) : null,
      pos: position,
      playing: state === State.Playing || state === State.Buffering,
      at: readAt,
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
  // Held only while someone else is choosing; with no chooser (they left),
  // this phone plays on by itself.
  holdAutoplay(!!now.by && now.by !== myId);
  endNudge();
  const active = sourceTrackFor((await TrackPlayer.getActiveTrack()) ?? null);
  if (!same(active, now.track)) {
    const track = await playable(now.track);
    const next = now.next ? await playable(now.next) : null;
    await playTrack(track, next ? [track, next] : [track]);
    echoUntil = Date.now() + ECHO_MS;
    // Start resolving the song after this one now, so when the Jam moves on
    // this phone is not the one everyone waits for.
    warmTrack(next);
    if (now.playing) {
      await TrackPlayer.play();
      // Where the Jam is once this phone is actually playing, not where it
      // was before the song loaded: that is what left a gap of the loading
      // time (and none was made up at all under two seconds).
      await untilPlaying();
      echoUntil = Date.now() + ECHO_MS;
      await TrackPlayer.seekTo(expectedAt(now, serverNow()) + SEEK_LEAD_S);
    } else {
      await TrackPlayer.seekTo(now.pos);
    }
  } else if (!now.playing) {
    await TrackPlayer.seekTo(now.pos);
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
    sampleClock(v.code).catch(() => {}); // the heartbeat, and a clock sample
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
    takeOverIfStuck(code).catch(() => {});
  });
  const c = AppState.addEventListener('change', s => {
    if (s === 'active') {
      sync().catch(() => {});
    }
  });
  const aligner = setInterval(() => align().catch(() => {}), ALIGN_MS);
  unsubs = [
    () => a.remove(),
    () => b.remove(),
    () => clearInterval(seekWatch),
    () => clearInterval(aligner),
    endNudge,
    () => q.remove(),
    () => c.remove(),
  ];
}

/**
 * This phone ran out of songs. If the Jam has moved on, follow it; if not,
 * whoever was choosing has left or stopped, so this phone carries the Jam on:
 * similar songs, then tells everyone. Without this a Jam whose chooser left
 * went silent on every other phone, with Next doing nothing.
 */
async function takeOverIfStuck(code: string): Promise<void> {
  const rec = await call<Record_ | null>(`jams/${code}`).catch(() => null);
  if (!view || view.code !== code) {
    return;
  }
  const now = rec?.now;
  const active = sourceTrackFor((await TrackPlayer.getActiveTrack()) ?? null);
  if (now && now.seq > appliedSeq && now.by !== myId && !same(active, now.track)) {
    appliedSeq = now.seq;
    await follow(now);
    return;
  }
  holdAutoplay(false);
  await topUpFromRadio(true);
  try {
    await TrackPlayer.skipToNext();
    await TrackPlayer.play();
    echoUntil = 0;
    await publish(code);
  } catch {
    // Nothing to play on even after asking the radio: stay stopped.
  }
}

function begin(code: string, host: boolean): void {
  view = {code, me: myId, host, members: [], now: null, queue: []};
  appliedSeq = -1;
  emit();
  watchLocal(code);
  poll = setInterval(() => sync().catch(() => {}), POLL_MS);
  listen(code);
  sync().catch(() => {});
}

function stop(): void {
  if (poll) {
    clearInterval(poll);
    poll = null;
  }
  unsubs.forEach(u => u());
  unsubs = [];
  const s = stream;
  stream = null;
  s?.abort();
  holdAutoplay(false);
  view = null;
  emit();
}

// ── what the Jam screen calls ────────────────────────────────────────────
export async function startJam(name: string): Promise<string> {
  myId = myId || newCode();
  myName = name.trim() || phoneName();
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
  myName = name.trim() || phoneName();
  await call(`jams/${code}/members/${myId}`, 'PUT', {name: myName, seen: SERVER_TIME});
  await measureOffset(code);
  begin(code, false);
  logEvent('jam_joined', {});
  return true;
}

export async function leaveJam(): Promise<void> {
  const v = view;
  const choosing = v?.now?.by === myId;
  stop();
  if (v) {
    if (!v.host && choosing) {
      // Nobody is choosing now; the next phone to run out carries it on.
      await call(`jams/${v.code}/now/by`, 'PUT', '').catch(() => {});
    }
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
