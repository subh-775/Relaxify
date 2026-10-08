/**
 * Recent searches — the list under the search field before you've typed.
 *
 * Most-recent first, de-duplicated case-insensitively (searching the same thing
 * twice moves it to the top rather than adding a second row), capped so the
 * list stays scannable.
 */
import {createStore, asArray, useStoreValue} from './storage';

const MAX = 20;

/**
 * A pasted link (a Spotify or YouTube Music playlist, song or album, or a
 * message with one in it) is a destination, not a search: an unreadable row
 * in Recent searches. Exported for the test.
 */
const LINK_MARKS = [
  'http://',
  'https://',
  'www.',
  'open.spotify.com',
  'spotify.link',
  'youtube.com',
  'youtu.be',
];
export function hasLink(text: string): boolean {
  const t = text.toLowerCase();
  return LINK_MARKS.some(m => t.includes(m));
}

const store = createStore<string[]>('mp.searchHistory.v1', [], raw =>
  asArray<string>(raw)
    // Links saved by earlier versions drop out here.
    .filter(x => typeof x === 'string' && x.trim() && !hasLink(x))
    .slice(0, MAX),
);

export function rememberSearch(query: string): void {
  const q = (query || '').trim();
  if (!q || hasLink(q)) {
    return;
  }
  store.update(list => [
    q,
    ...list.filter(x => x.toLowerCase() !== q.toLowerCase()),
  ].slice(0, MAX));
}

export function forgetSearch(query: string): void {
  store.update(list => list.filter(x => x !== query));
}

export function clearSearchHistory(): void {
  store.set([]);
}

export function useSearchHistory(): string[] {
  return useStoreValue(store);
}
