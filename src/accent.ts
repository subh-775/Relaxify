/**
 * The greeting's current colour pair, for everything that should match it.
 *
 * The Home header picks a new pair on each arrival; the playing tile's ring,
 * the Library's active chip and the search hints wear the same one, so the
 * app changes colour together rather than in unrelated places. Memory only:
 * a new launch picks a new pair anyway.
 */
import {useSyncExternalStore} from 'react';

/** Colour pairs; the first of each is the lead. Every colour is bright enough
 *  to read on #000 and to carry dark type. */
export const PAIRS: [string, string][] = [
  ['#FF5A5F', '#00B4FF'], // coral · sky
  ['#FF9F1C', '#B388FF'], // orange · lavender
  ['#8AE234', '#FF6FD8'], // lime · pink
  ['#2EC4B6', '#FFD23F'], // teal · sun
  ['#7B8CFF', '#FF9F1C'], // periwinkle · orange
  ['#FF6FD8', '#2EC4B6'], // pink · teal
  ['#FFD23F', '#7B8CFF'], // sun · periwinkle
  ['#00B4FF', '#8AE234'], // sky · lime
];

let current = 0;
const listeners = new Set<() => void>();

export function setAccent(index: number): void {
  if (index !== current && PAIRS[index]) {
    current = index;
    listeners.forEach(l => l());
  }
}

export function useAccent(): [string, string] {
  const i = useSyncExternalStore(
    l => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
  return PAIRS[i];
}
