/**
 * "Wrong song?": the copy you picked, remembered for that song everywhere.
 *
 * Search finds a song on several sources and one of them is chosen to play.
 * Sometimes that choice is wrong: a cover, a remix, a lofi flip, a different
 * song with the same name. Picking the right copy once (WrongSongSheet) is
 * kept here, keyed by the song's title and artist, and every place that
 * builds a queue plays the pick instead: albums, playlists, Liked Songs,
 * Recents, radio, a restored session.
 *
 * Keyed like downloads (getDownloadKey: title + artist, no ISRC), because two
 * copies of one song rarely share an ISRC, and "this song" is what the person
 * meant. A downloaded file is never replaced here: it is exactly what is on
 * the phone, and the sheet offers to replace the download instead.
 */
import type {Track} from './backend';
import {createStore, useStoreValue} from './storage';
import {getDownloadKey, getPlayableSources} from './tracks';

/** Enough for every correction a person will ever make; the oldest go first. */
const MAX_CHOICES = 500;

type Choices = Record<string, Track>;

const choices = createStore<Choices>('mp.songChoice.v1', {}, raw =>
  raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Choices) : {},
);

export const useSongChoices = () => useStoreValue(choices);

/** The copy to play for `t`: your pick if you made one, else `t` itself. */
export function chosenCopy(t: Track): Track {
  if (t.file_path) {
    return t;
  }
  return choices.get()[getDownloadKey(t)] ?? t;
}

/**
 * Remember `pick` as the copy of `original`'s song. Returns what was
 * remembered before (null for none), which is what Undo puts back.
 */
export function setChoice(original: Track, pick: Track | null): Track | null {
  const key = getDownloadKey(original);
  const all = {...choices.get()};
  const before = all[key] ?? null;
  delete all[key]; // re-inserted last, so it counts as the newest
  if (pick) {
    all[key] = pick;
  }
  const keys = Object.keys(all);
  keys.slice(0, Math.max(0, keys.length - MAX_CHOICES)).forEach(k => delete all[k]);
  choices.set(all);
  return before;
}

/**
 * The other copies already found for this song: one per playable source
 * besides the one it plays from now. Each is the same Track pointed at that
 * source, which is exactly how the player picks a source to stream.
 */
export function otherCopies(t: Track): Track[] {
  const current = t.playable_source || t.primary_source || '';
  return getPlayableSources(t)
    .filter(s => s.source !== current)
    .map(s => ({...t, primary_source: s.source, playable_source: s.source}));
}

/** Is `a` the same copy as `b`: the same source, at the same address. */
export function sameCopy(a: Track, b: Track): boolean {
  const sa = a.playable_source || a.primary_source || '';
  const sb = b.playable_source || b.primary_source || '';
  if (a.file_path || b.file_path) {
    return a.file_path === b.file_path;
  }
  return sa === sb && a.sources?.[sa]?.url === b.sources?.[sb]?.url;
}
