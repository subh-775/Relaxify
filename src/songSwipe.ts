/**
 * Swipe the cover sideways to change song: the gesture both players share,
 * built to feel like the player's morph.
 *
 * What makes the morph feel good is that it never cuts: the cover is under
 * the finger 1:1, and a release carries on at the finger's speed. The swipe
 * used to do neither. It moved at half the finger's speed, and on release the
 * cover flew out, jumped to the far side and came back in as the new song:
 * two animations with a cut between them.
 *
 * Now it is a carousel of three:
 *   - both neighbours (previous and next song) sit one `span` to either side,
 *     drawn in advance whenever the song changes, and move with the finger.
 *     A drag itself does no React work at all, only UI-thread transforms: the
 *     first version built the neighbour when the drag began, and that rebuild
 *     showed up on the phone as slow UI-thread frames right as the finger
 *     started moving;
 *   - a release glides on with the finger's velocity until the neighbour is
 *     exactly where the cover was;
 *   - then the swap. The neighbour stays parked in the middle until the real
 *     cover underneath shows the same song, loaded, and only then is the
 *     offset reset (offscreen, in one UI-thread step). So the moment of the
 *     swap is invisible: both views show the same picture.
 *
 * `span` is the distance between neighbours: the width of the clip the slides
 * live in. The caller sets it.
 */
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Gesture} from 'react-native-gesture-handler';
import {
  runOnJS,
  runOnUI,
  useSharedValue,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';
import type {Track as RNTPTrack} from 'react-native-track-player';
import {getBestArtworkUrl} from './tracks';
import {
  onQueueChanged,
  peekAdjacentTrack,
  skipNext,
  skipPrevious,
  sourceTrackFor,
} from './player';
import {logEvent} from './analytics';

/** Distance, or a flick, that commits a swipe. */
const COMMIT_PX = 64;
const FLICK = 700;
/** After the glide, how long the swap waits for the real cover to say it has
 *  loaded. Short: the neighbour drawn in the middle already decoded the same
 *  picture, so the real cover comes from memory, and waiting longer only kept
 *  the next swipe blocked (rc2 measured 0.7 s timeouts on a Redmi). */
const LAND_TIMEOUT_MS = 150;
/** The longest a committed swipe may hold the cover, glide included. */
const LAND_GUARD_MS = 1500;

export type Neighbour = {dir: 1 | -1; track: RNTPTrack; art: string};
export type Sides = {prev: Neighbour | null; next: Neighbour | null};

const NONE: Sides = {prev: null, next: null};

/** Swipes landed since the process started: the first one after opening the
 *  app is the one reported as sticking for a second or two. */
let swipeCount = 0;

function side(dir: 1 | -1): Neighbour | null {
  const t = peekAdjacentTrack(dir);
  return t ? {dir, track: t, art: coverUrl(t)} : null;
}

function same(a: Neighbour | null, b: Neighbour | null): boolean {
  return (
    a === b ||
    (!!a && !!b && a.art === b.art && trackKey(a.track) === trackKey(b.track))
  );
}

/** The cover URL a player shows for this track — the same rule both use. */
export function coverUrl(t: RNTPTrack | null | undefined): string {
  if (!t) {
    return '';
  }
  const src = sourceTrackFor(t);
  return src ? getBestArtworkUrl(src) : String(t.artwork ?? '');
}

export function trackKey(t: RNTPTrack | null | undefined): string {
  return t ? `${t.title ?? ''}\u0000${t.artist ?? ''}` : '';
}

export function useSongSwipe({
  slide,
  active,
  failY,
}: {
  /** The horizontal offset the caller's cover and title are drawn at. */
  slide: SharedValue<number>;
  active: RNTPTrack | null | undefined;
  /** Vertical travel that hands the touch to the other gesture. */
  failY: number;
}) {
  const span = useSharedValue(0);
  /** Set from a commit until the swap: a second swipe waits for it. */
  const busy = useSharedValue(false);
  const [sides, setSides] = useState<Sides>(NONE);
  const sidesRef = useRef(sides);
  sidesRef.current = sides;
  // Mirrored for the gesture, so the glide can start on the UI thread the
  // instant the finger lifts, without asking JS whether there is a cover
  // to glide to.
  const hasPrev = useSharedValue(false);
  const hasNext = useSharedValue(false);
  /** This drag reached onEnd. A drag that never does (the gesture was
   *  cancelled from outside) is put back to rest in onFinalize. */
  const ended = useSharedValue(true);
  useEffect(() => {
    hasPrev.value = !!sides.prev;
    hasNext.value = !!sides.next;
  }, [sides, hasPrev, hasNext]);

  const landing = useRef<{
    key: string;
    art: string;
    glided: boolean;
    /** When commit ran, and how long after the finger lifted it ran: the
     *  wait for the JS thread, which is the suspect in the first-swipe stall. */
    at: number;
    jsLag: number;
    /** When the glide ended, the new song was published, the cover loaded:
     *  which of the three a slow landing waited for. */
    glidedAt?: number;
    keyAt?: number;
    coverAt?: number;
    timer?: ReturnType<typeof setTimeout>;
    /** The backstop: however the landing went, it ends by this. */
    guard?: ReturnType<typeof setTimeout>;
  } | null>(null);
  const loadedArt = useRef('');
  const activeKey = trackKey(active);
  const activeKeyRef = useRef(activeKey);
  activeKeyRef.current = activeKey;

  /** Re-read both neighbours from the queue. Not while landing: the one being
   *  landed on must stay exactly as it is until the swap. A no-op render when
   *  nothing changed. */
  const refresh = useCallback(() => {
    if (landing.current) {
      return;
    }
    const prev = side(-1);
    const next = side(1);
    setSides(cur =>
      same(cur.prev, prev) && same(cur.next, next) ? cur : {prev, next},
    );
  }, []);

  useEffect(refresh, [activeKey, refresh]);
  // A shuffle, a Play next or a radio top-up changes the songs either side
  // without changing this one; the drawn neighbours must follow, or a swipe
  // shows the song that USED to be next for a moment.
  useEffect(() => onQueueChanged(refresh), [refresh]);

  const settle = useCallback((how: 'landed' | 'timeout' | 'guard') => {
    const l = landing.current;
    if (!l) {
      return;
    }
    clearTimeout(l.timer);
    clearTimeout(l.guard);
    landing.current = null;
    // `swipe_land`: lift-to-commit (js_lag) and commit-to-swap (ms), and how
    // the swap came about. A slow first swipe with a big js_lag is the JS
    // thread; a big ms with a small js_lag is the cover or the engine.
    const since = (t?: number) => (t ? t - l.at : -1);
    logEvent('swipe_land', {
      ms: Date.now() - l.at,
      js_lag: l.jsLag,
      glide_ms: since(l.glidedAt),
      publish_ms: since(l.keyAt),
      cover_ms: since(l.coverAt),
      end: how,
      // A string: rc2's numeric 0/1 came through GA as blank.
      first: swipeCount++ === 0 ? 'yes' : 'no',
    });
    // The offset in one UI-thread step; the neighbours are re-read only
    // after, once they are both back off screen.
    runOnUI(() => {
      'worklet';
      slide.value = 0;
      busy.value = false;
      runOnJS(refresh)();
    })();
  }, [slide, busy, refresh]);

  const tryLand = useCallback(() => {
    const l = landing.current;
    if (l && !l.keyAt && activeKeyRef.current === l.key) {
      l.keyAt = Date.now();
    }
    if (l && !l.coverAt && l.art && loadedArt.current === l.art) {
      l.coverAt = Date.now();
    }
    if (
      l?.glided &&
      activeKeyRef.current === l.key &&
      (!l.art || loadedArt.current === l.art)
    ) {
      settle('landed');
    }
  }, [settle]);

  useEffect(tryLand, [activeKey, tryLand]);

  /** Wire to the real cover's Image onLoad. */
  const onCoverLoad = useCallback(
    (url: string) => {
      loadedArt.current = url;
      tryLand();
    },
    [tryLand],
  );

  const onGlided = useCallback(() => {
    const l = landing.current;
    if (!l) {
      return;
    }
    l.glided = true;
    l.glidedAt = Date.now();
    l.timer = setTimeout(() => settle('timeout'), LAND_TIMEOUT_MS);
    tryLand();
  }, [settle, tryLand]);

  /**
   * The JS half of a committed swipe. The glide itself was already started on
   * the UI thread by the gesture: it used to start HERE, so it waited for the
   * JS thread, which at that moment is busy starting the next song. The cover
   * froze where the finger left it, then jumped.
   */
  const commit = useCallback(
    (d: 1 | -1, liftedAt: number) => {
      // Skip NOW, so the engine and the title move while the cover glides.
      (d === 1 ? skipNext() : skipPrevious(true)).catch(() => {});
      const n = d === 1 ? sidesRef.current.next : sidesRef.current.prev;
      if (!n) {
        // Nothing drawn to glide to (the end of the queue, or the queue
        // changed under the finger): back to rest, and the new song replaces
        // this one in place.
        busy.value = false;
        slide.value = withSpring(0, {damping: 20, stiffness: 220});
        return;
      }
      landing.current = {
        key: trackKey(n.track),
        art: n.art,
        glided: false,
        at: Date.now(),
        jsLag: Date.now() - liftedAt,
        // A landing that never hears its glide end (the glide was cut short,
        // the JS thread was held up at startup) used to keep `busy` set for
        // good: every later swipe was ignored and the cover sat wherever it
        // stopped until the app was restarted. Now it always ends.
        guard: setTimeout(() => settle('guard'), LAND_GUARD_MS),
      };
    },
    [slide, busy, settle],
  );

  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-14, 14])
        .failOffsetY([-failY, failY])
        .onStart(() => {
          ended.value = false;
          // Catches a queue edited since the song began (play next, a
          // shuffle). Renders nothing unless a neighbour actually changed.
          runOnJS(refresh)();
        })
        .onUpdate(e => {
          if (!busy.value) {
            slide.value = e.translationX;
          }
        })
        .onEnd((e, success) => {
          ended.value = true;
          if (busy.value) {
            return;
          }
          const x = e.translationX;
          const vx = e.velocityX;
          const next = success && x < 0 && (x <= -COMMIT_PX || vx < -FLICK);
          const prev = success && x > 0 && (x >= COMMIT_PX || vx > FLICK);
          if (next || prev) {
            const d = next ? 1 : -1;
            busy.value = true;
            if (next ? hasNext.value : hasPrev.value) {
              slide.value = withSpring(
                -d * span.value,
                {damping: 26, stiffness: 260, overshootClamping: true, velocity: vx},
                // Finished or cut short, the landing hears about it: a glide
                // that was interrupted must still end in a settle, or the
                // cover stays wherever the interruption left it.
                () => {
                  runOnJS(onGlided)();
                },
              );
            }
            // Queued before the glide's end on the same JS queue, so the
            // landing is always set up before onGlided arrives.
            runOnJS(commit)(d, Date.now());
            return;
          }
          slide.value = withSpring(0, {
            damping: 20,
            stiffness: 220,
            overshootClamping: true,
            velocity: vx,
          });
        })
        .onFinalize(() => {
          if (!ended.value && !busy.value) {
            ended.value = true;
            slide.value = withSpring(0, {damping: 20, stiffness: 220, overshootClamping: true});
          }
        }),
    [failY, slide, busy, refresh, commit, onGlided, span, hasPrev, hasNext, ended],
  );

  return {gesture, sides, span, onCoverLoad};
}
