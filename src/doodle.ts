/**
 * Today's doodle: the Home header's "Relaxify", drawn a different way each day.
 *
 * The doodles are not in this repo. They are animated images on Firebase
 * Hosting, listed in MANIFEST with their colours and the festival dates, so a
 * new doodle or a new festival reaches every phone without a release.
 *
 * Which one a day gets:
 *   - a festival's own doodle on its days (the manifest's dates: lunar
 *     festivals move every year, so they are listed per year);
 *   - otherwise one of the everyday doodles, the same all day. Each comes
 *     round once in every run of N days (N = how many there are), in a
 *     shuffled order, and never on two days running.
 *
 * The manifest is kept in storage, so the header has its doodle at launch and
 * offline; it is fetched again when it is older than STALE_MS. The images go
 * through React Native's own image cache (Fresco's, on disk).
 */
import {useSyncExternalStore} from 'react';
import {AppState, Image} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const MANIFEST = 'https://relaxify-observability.web.app/doodles/manifest.json';
const KEY = 'mp.doodles.v1';
const STALE_MS = 6 * 3600 * 1000;

export type Doodle = {
  id: string;
  name: string;
  kind: 'fest' | 'every';
  /** Paths under the manifest's `base`. */
  anim: string;
  still: string;
  /** Index into PAIRS (accent.ts): the app's colour while it shows. */
  accent: number;
};
export type Festival = {
  id: string;
  caption: string;
  /** One year's dates, YYYY-MM-DD, inclusive... */
  from?: string;
  to?: string;
  /** ...or every year's, MM-DD; it may wrap the new year (12-31 to 01-01). */
  md?: [string, string];
};
export type Manifest = {
  version: number;
  base: string;
  /** The band the images are drawn for, in dp. */
  width: number;
  height: number;
  doodles: Doodle[];
  festivals: Festival[];
};
export type Pick = {
  doodle: Doodle;
  /** What tapping it says. */
  caption: string;
  anim: string;
  still: string;
  /** Width over height. */
  aspect: number;
};

/** The phone's own date, YYYY-MM-DD. */
export function localDay(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function festivalOn(day: string, festivals: Festival[]): Festival | undefined {
  const md = day.slice(5);
  return festivals.find(f => {
    if (f.from && f.to) {
      return day >= f.from && day <= f.to;
    }
    if (!f.md) {
      return false;
    }
    const [a, b] = f.md;
    return a <= b ? md >= a && md <= b : md >= a || md <= b;
  });
}

/* eslint-disable no-bitwise -- mulberry32: a seeded generator, so a day's
   shuffle is the same on every phone. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled(n: number, seed: number): number[] {
  const r = rng(Math.imul(seed, 2654435761));
  const a = Array.from({length: n}, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
/* eslint-enable no-bitwise */

/** The everyday doodle for a day: a shuffled run of all of them, and a run
 *  never starts with the one the last run ended on. */
export function everydayOn<T>(day: string, list: T[]): T | undefined {
  const n = list.length;
  if (!n) {
    return undefined;
  }
  const d = Math.floor(Date.parse(day + 'T00:00:00Z') / 86400000);
  const run = Math.floor(d / n);
  const order = shuffled(n, run);
  const prev = shuffled(n, run - 1);
  if (n > 1 && order[0] === prev[n - 1]) {
    [order[0], order[1]] = [order[1], order[0]];
  }
  return list[order[d - run * n]];
}

export function pickFor(day: string, m: Manifest): Pick | null {
  const fest = festivalOn(day, m.festivals);
  const doodle =
    (fest && m.doodles.find(d => d.id === fest.id)) ||
    everydayOn(day, m.doodles.filter(d => d.kind === 'every'));
  if (!doodle) {
    return null;
  }
  const caption =
    fest && fest.id === doodle.id ? fest.caption : `Today's doodle: ${doodle.name}`;
  return {
    doodle,
    caption,
    anim: m.base + doodle.anim,
    still: m.base + doodle.still,
    aspect: m.width / m.height,
  };
}

// ---- the store ----

let manifest: Manifest | null = null;
let day = localDay();
let pick: Pick | null = null;
let fetchedAt = 0;
let started = false;
const listeners = new Set<() => void>();

function update() {
  const next = manifest ? pickFor(day, manifest) : null;
  if (next?.anim === pick?.anim && next?.caption === pick?.caption) {
    return;
  }
  pick = next;
  if (pick) {
    Image.prefetch(pick.still).catch(() => {});
    Image.prefetch(pick.anim).catch(() => {});
  }
  listeners.forEach(l => l());
}

function valid(m: unknown): m is Manifest {
  const x = m as Manifest;
  return !!x && typeof x.base === 'string' && Array.isArray(x.doodles) && Array.isArray(x.festivals);
}

async function refresh() {
  if (Date.now() - fetchedAt < STALE_MS) {
    return;
  }
  try {
    const res = await fetch(MANIFEST, {headers: {'Cache-Control': 'no-cache'}});
    const m = await res.json();
    if (!res.ok || !valid(m)) {
      return;
    }
    manifest = m;
    fetchedAt = Date.now();
    update();
    AsyncStorage.setItem(KEY, JSON.stringify({fetchedAt, manifest: m})).catch(() => {});
  } catch {
    // Offline: the stored manifest stands, and the next return to the app
    // tries again.
  }
}

/** Load the stored manifest, then refresh it now and on each return to the
 *  app, which is also when a new day is noticed. */
function start() {
  if (started) {
    return;
  }
  started = true;
  AsyncStorage.getItem(KEY)
    .then(raw => {
      const saved = raw ? JSON.parse(raw) : null;
      if (!manifest && valid(saved?.manifest)) {
        manifest = saved.manifest;
        fetchedAt = Number(saved.fetchedAt) || 0;
        update();
      }
    })
    .catch(() => {})
    .finally(refresh);
  AppState.addEventListener('change', s => {
    if (s === 'active') {
      day = localDay();
      update();
      refresh();
    }
  });
}

/** Today's doodle, or null until there is a manifest. */
export function useDoodle(): Pick | null {
  return useSyncExternalStore(
    l => {
      start();
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => pick,
  );
}
