/**
 * The maths of a queue: where a row is, and what order things go back in. Pure,
 * and keyed on `_qid`, the identity player.ts stamps on every queue row, which
 * is the right key because the same song queued twice is two rows.
 */

/**
 * Where the playing row sits in `queue`, found by its row identity (`_qid`).
 *
 * The engine's index was read in a separate call from its queue, and songs
 * inserted in between (a list starting, the earlier songs going in front)
 * left it pointing at a different row. The swipe then drew that row as the
 * next song, and Next showed its name and cover for a moment before the
 * engine's own event put the real one back. The index is the fallback only.
 */
export function rowIndex<T>(
  queue: T[],
  active: T | null | undefined,
  fallback: number,
): number {
  const qid = (t: T | null | undefined) => (t as {_qid?: unknown} | null)?._qid;
  const want = qid(active);
  const at = want ? queue.findIndex(t => qid(t) === want) : -1;
  return at >= 0 ? at : fallback;
}

/**
 * The original order of whatever is STILL upcoming.
 *
 * This is the whole of the shuffle-off bug, and it is worth being explicit
 * about. `preShuffleUpcoming` is a snapshot taken at the moment shuffle was
 * turned on — but the queue keeps moving afterwards. Songs play, so they leave
 * the upcoming list; radio appends more; a swipe skips two at once. Re-adding
 * that snapshot wholesale put songs back that had already been heard and
 * dropped ones added since, so turning shuffle OFF produced a queue that looked
 * every bit as random as turning it on. From the outside both directions
 * reshuffled, and neither ever restored anything.
 *
 * Filtering the snapshot by what is genuinely still ahead fixes it in one line
 * of intent: keep the ORDER from the snapshot, keep the MEMBERSHIP from the
 * live queue. `_qid` is the per-row identity toQueueItem already stamps — the
 * right key here, because the same song queued twice is two rows and only one
 * of them may still be upcoming.
 */
export function restoreOrder<T>(snapshot: T[], liveUpcoming: T[]): T[] {
  // RNTP's Track carries an index signature rather than a declared `_qid`, so
  // the key is read through a cast rather than constrained on T — constraining
  // it would stop the engine's own queue type from being passed at all.
  const qid = (t: T) => (t as {_qid?: unknown})._qid;
  const live = new Set(liveUpcoming.map(qid));
  return snapshot.filter(t => qid(t) !== undefined && live.has(qid(t)));
}

/**
 * The source list re-ordered to follow the engine after a shuffle.
 *
 * Shuffle reorders the ENGINE queue, and the source list is read by index
 * against it — the resume note above all. Left in the old order, the saved
 * index pointed at a different song, so a restart reopened on the wrong one.
 * Matched by `_qid`, not by title, so a song queued twice keeps both rows.
 */
export function alignUpcoming<S, R>(
  source: S[],
  index: number,
  before: R[],
  after: R[],
): S[] {
  const qid = (r: R) => (r as {_qid?: unknown})._qid;
  const byQid = new Map(before.map((r, i) => [qid(r), source[index + 1 + i]]));
  const upcoming = after
    .map(r => byQid.get(qid(r)))
    .filter((t): t is S => t !== undefined);
  return [...source.slice(0, index + 1), ...upcoming];
}

/** Fisher-Yates, and it must not return the identity for a short list — a
 *  shuffle that visibly changes nothing reads as a broken button. */
export function shuffleUpcoming<T>(rest: T[]): T[] {
  const out = [...rest];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
