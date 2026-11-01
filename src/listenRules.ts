/**
 * What counts as listening to a song, for the Recap and for Analytics.
 *
 * A play counts once it has been LISTENED to for 30 s (half the song, if it is
 * shorter than a minute): Spotify's rule, so a song you skip every time does not
 * become your song of the week.
 */
const PLAY_COUNTS_AFTER = 30;

function playThreshold(duration: number): number {
  return duration > 0
    ? Math.min(PLAY_COUNTS_AFTER, duration / 2)
    : PLAY_COUNTS_AFTER;
}

/** True when a play heard from `from` to `position` has earned its count. */
export function earnedPlay(
  from: number,
  position: number,
  duration: number,
): boolean {
  const need = playThreshold(duration);
  return position >= need && (from < need || position - from >= need);
}

/** How a listen ended. `full`: it reached the end, or the last few seconds
 *  a crossfade overlaps (the next song starts up to `crossfade` seconds
 *  early, which read as "not finished" with the old 5 s rule). `partial`:
 *  it earned a play (the Recap's rule), `skip`: it did not. */
export function listenOutcome(
  position: number,
  duration: number,
  crossfade: number,
): 'full' | 'partial' | 'skip' {
  if (duration > 0 && position >= duration - 5 - Math.max(0, crossfade)) {
    return 'full';
  }
  return position >= playThreshold(duration) ? 'partial' : 'skip';
}
