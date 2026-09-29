/**
 * Auto quality that follows a weak signal.
 *
 * With Streaming quality on Auto, two stalls (the song stops to buffer by
 * itself, not after a seek or a skip) within three minutes lower the ceiling
 * one rung for the songs that start next: 320, 160, then 96 kbps. Five
 * minutes without a stall raises it one rung again, checked as songs change.
 *
 * The ceiling lives in the engine (mobile_server.py _quality_cap), not in the
 * queued URLs, so songs already queued at 320 pick it up too. A song that has
 * started keeps its rung: its seeks must land in the same file.
 */
import {State} from 'react-native-track-player';
import {setQualityCap} from './backend';
import {logEvent} from './analytics';
import {readSettings} from './store';
import {toast} from './toast';

const RUNGS = [320, 160, 96];
const STALLS_TO_DROP = 2;
const STALL_WINDOW_MS = 3 * 60 * 1000;
const STEADY_MS = 5 * 60 * 1000;
/** A buffer this soon after the person seeked or skipped is theirs, not a stall. */
const USER_MOVE_GRACE_MS = 3000;

/** The ceiling in kbps; 0 = none. */
let cap = 0;
let stalls: number[] = [];
let lastStallAt = 0;
let prevState: State | undefined;

const isAuto = () => readSettings().audioQuality === 0;

function push(kbps: number): void {
  cap = kbps;
  setQualityCap(kbps).catch(() => {});
}

/** Every playback state. `sinceUserMoveMs`: since the last seek or skip. */
export function noteState(state: State | undefined, sinceUserMoveMs: number): void {
  const was = prevState;
  prevState = state;
  // Quality taken off Auto: its ceiling goes with it, at the next event.
  if (cap && !isAuto()) {
    resetQualityCap();
  }
  if (
    state !== State.Buffering ||
    was !== State.Playing ||
    sinceUserMoveMs < USER_MOVE_GRACE_MS
  ) {
    return;
  }
  const now = Date.now();
  lastStallAt = now;
  logEvent('playback_rebuffer', {auto: isAuto() ? 1 : 0, cap: cap || 320});
  if (!isAuto()) {
    return;
  }
  stalls = [...stalls.filter(t => now - t < STALL_WINDOW_MS), now];
  const at = RUNGS.indexOf(cap || 320);
  if (stalls.length < STALLS_TO_DROP || at >= RUNGS.length - 1) {
    return;
  }
  stalls = [];
  push(RUNGS[at + 1]);
  logEvent('quality_auto', {kbps: cap});
  toast(`Weak signal: the next songs stream at ${cap} kbps`, 'info');
}

/** Every track change: after a steady stretch, one rung back up. */
export function noteTrackChange(): void {
  if (!cap || Date.now() - lastStallAt < STEADY_MS) {
    return;
  }
  const up = RUNGS[RUNGS.indexOf(cap) - 1];
  push(up === RUNGS[0] ? 0 : up);
  // One rung per steady stretch, not all the way back at once.
  lastStallAt = Date.now();
  logEvent('quality_auto', {kbps: cap || RUNGS[0]});
}

/** At startup (the engine may have outlived the app's JS) and once the
 *  setting leaves Auto: no ceiling. */
export function resetQualityCap(): void {
  stalls = [];
  push(0);
}
