/**
 * Recap: your listening told as a short run of full-screen cards, one fact
 * each, like a story. Tap the right side for the next card and the left side
 * for the previous one, hold to pause, swipe down to put it away; each card
 * moves on by itself after CARD_MS and the last one stays.
 *
 * Every card is a flat, loud colour field with its own piece of artwork framed
 * around the fact — a starburst, a day ring round the cover, sunburst rays, a
 * spinning record — and the Relaxify mark in the same corner throughout. The
 * palettes are dealt again each time the Recap opens.
 *
 * Drawn on a 360-wide canvas and scaled to the phone's width, so the artwork
 * lands where it was designed on every screen; only the height stretches, and
 * `Y()` spreads the vertical positions over it. Reanimated, gesture-handler and
 * react-native-svg only, all already in the app. The figures come from
 * recap.ts; the only network use is the artists' photos (artistPhotos.ts).
 */
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  BackHandler,
  findNodeHandle,
  type LayoutChangeEvent,
  NativeModules,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import {Gesture, GestureDetector} from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import {logEvent} from '../analytics';
import {useArtistPhotos} from '../artistPhotos';
import {PALS} from '../brandArt';
import {LogoMark} from '../components/Logo';
import {Share as ShareGlyph} from '../glyphs';
import {inviteMessage} from '../links';
import {buildRecap, type RecapMode} from '../recap';
import {buildCards} from './recap/cards';
import {CW, styles} from './recap/styles';
import {useStatsState} from '../stats';
import {toast} from '../toast';

/** ImageShareModule.kt: a picture of a view, with text, to the share sheet. */
const imageShare = NativeModules.ImageShare as
  | {shareView(tag: number, text: string): Promise<void>}
  | undefined;

/** How long a card stays before the next one. */
const CARD_MS = 5000;
function shuffled<T>(xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** The art swings in once per card: a slight turn and scale, settling. */
function Canvas({
  h,
  animate,
  children,
}: {
  h: number;
  animate: boolean;
  children: React.ReactNode;
}) {
  const t = useSharedValue(animate ? 0 : 1);
  useEffect(() => {
    t.value = withTiming(1, {
      duration: 700,
      easing: Easing.bezier(0.2, 1.4, 0.4, 1),
    });
  }, [t]);
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [0, 0.4], [0, 1], 'clamp'),
    transform: [
      {scale: interpolate(t.value, [0, 1], [0.88, 1])},
      {rotate: `${(1 - t.value) * -5}deg`},
    ],
  }));
  return (
    <Animated.View style={[{width: CW, height: h}, style]}>
      {children}
    </Animated.View>
  );
}

export function RecapScreen({onClose}: {onClose: () => void}) {
  const stats = useStatsState();
  const [mode, setMode] = useState<RecapMode>('week');
  const recap = useMemo(
    () => buildRecap(stats, Date.now(), mode),
    [stats, mode],
  );
  const faces = useArtistPhotos(recap.topArtists.map(a => a.name));
  const cards = useMemo(() => buildCards(recap, faces), [recap, faces]);

  // The palettes, dealt again each time the Recap opens.
  const [deal] = useState(() => shuffled(PALS));

  const win = useWindowDimensions();
  const [box, setBox] = useState({w: win.width, h: win.height});
  const onLayout = (e: LayoutChangeEvent) => {
    const {width, height} = e.nativeEvent.layout;
    if (width !== box.w || height !== box.h) {
      setBox({w: width, h: height});
    }
  };
  const scale = box.w / CW;
  const logicalH = box.h / scale;

  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const at = Math.min(index, cards.length - 1);
  const card = cards[at];
  const pal = deal[at % deal.length];

  // ── Progress and auto-advance ─────────────────────────────────────────
  const prog = useSharedValue(0);
  const last = useRef(cards.length - 1);
  last.current = cards.length - 1;
  const shown = useRef('');

  const advance = useCallback(
    () => setIndex(i => Math.min(i + 1, last.current)),
    [],
  );

  useEffect(() => {
    const now = `${mode}:${at}`;
    const fresh = shown.current !== now;
    if (fresh) {
      shown.current = now;
      prog.value = 0;
    }
    if (paused) {
      cancelAnimation(prog);
      return;
    }
    // Never read `prog` straight after writing it. A write from JS is QUEUED
    // for the UI thread while a read is synchronous, so the read still saw the
    // finished card's 1: the next card got a zero-length timer and advanced at
    // once, cascading to the last card — and a tap back bounced forward again.
    const from = fresh ? 0 : prog.value;
    prog.value = withTiming(
      1,
      {duration: (1 - from) * CARD_MS, easing: Easing.linear},
      done => {
        if (done) {
          runOnJS(advance)();
        }
      },
    );
    return () => cancelAnimation(prog);
  }, [mode, at, paused, prog, advance]);

  const fill = useAnimatedStyle(() => ({width: `${prog.value * 100}%`}));

  const go = useCallback(
    (d: 1 | -1) => setIndex(i => Math.max(0, Math.min(i + d, last.current))),
    [],
  );
  const pick = (m: RecapMode) => {
    setMode(m);
    setIndex(0);
  };

  // ── Share the last card: a picture of it and the link to get the app ──
  const rootRef = useRef<View>(null);
  const [capturing, setCapturing] = useState(false);
  const canShare = at === cards.length - 1 && recap.songs > 0 && !!imageShare;
  const share = () => {
    // The button hides for the picture; two frames lets that reach the
    // screen before the native side draws the view.
    setCapturing(true);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const tag = findNodeHandle(rootRef.current);
        const lead =
          mode === 'week'
            ? 'My week in music on Relaxify 🎧'
            : 'My music on Relaxify 🎧';
        (tag != null
          ? imageShare!.shareView(tag, inviteMessage(lead))
          : Promise.reject()
        )
          .then(() => logEvent('recap_shared', {mode}))
          .catch(() => toast('Could not share the Recap'))
          .finally(() => setCapturing(false));
      }),
    );
  };

  // ── Swipe down to put it away ────────────────────────────────────────
  const reduce = useReducedMotion();
  const drag = useSharedValue(reduce ? 0 : box.h * 0.12);
  useEffect(() => {
    drag.value = withSpring(0, {damping: 20, stiffness: 190});
  }, [drag]);

  const closing = useRef(false);
  const dismiss = useCallback(
    (velocity = 0) => {
      if (closing.current) {
        return;
      }
      closing.current = true;
      drag.value = withTiming(
        box.h,
        {
          duration: Math.max(160, 320 - Math.abs(velocity) / 8),
          easing: Easing.in(Easing.cubic),
        },
        done => {
          if (done) {
            runOnJS(onClose)();
          }
        },
      );
    },
    [drag, box.h, onClose],
  );

  // Back puts it away the same way a swipe does.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      dismiss();
      return true;
    });
    return () => sub.remove();
  }, [dismiss]);

  const gesture = useMemo(() => {
    const pan = Gesture.Pan()
      .activeOffsetY(12)
      .failOffsetX([-24, 24])
      .onStart(() => runOnJS(setPaused)(true))
      .onUpdate(e => {
        drag.value = Math.max(0, e.translationY);
      })
      .onEnd(e => {
        if (e.translationY > box.h * 0.2 || e.velocityY > 900) {
          runOnJS(dismiss)(e.velocityY);
        } else {
          drag.value = withSpring(0, {damping: 18, stiffness: 220});
          runOnJS(setPaused)(false);
        }
      });
    const hold = Gesture.LongPress()
      .minDuration(220)
      .onStart(() => runOnJS(setPaused)(true))
      .onFinalize(() => runOnJS(setPaused)(false));
    const tap = Gesture.Tap()
      .maxDuration(250)
      .onEnd((e, ok) => {
        if (ok) {
          runOnJS(go)(e.x < box.w * 0.32 ? -1 : 1);
        }
      });
    return Gesture.Race(pan, hold, tap);
  }, [drag, box.h, box.w, dismiss, go]);

  // Pulled down, the story shrinks and rounds off like a card being lifted
  // away, the way the full player folds into the mini player.
  const sheet = useAnimatedStyle(() => {
    const p = Math.min(1, drag.value / box.h);
    return {
      opacity: interpolate(p, [0, 0.6, 1], [1, 0.9, 0]),
      borderRadius: interpolate(p, [0, 0.15], [0, 28], 'clamp'),
      transform: [
        {translateY: drag.value * 0.9},
        {scale: interpolate(p, [0, 1], [1, 0.82])},
      ],
    };
  });

  const ink = {color: pal.ink};
  return (
    <Animated.View
      ref={rootRef}
      collapsable={false}
      style={[styles.wrap, {backgroundColor: pal.bg}, sheet]}
      onLayout={onLayout}>
      <GestureDetector gesture={gesture}>
        <View style={styles.stage}>
          {/* The 360-wide canvas, scaled about its centre to fill the screen. */}
          <View
            style={[
              styles.canvas,
              {
                height: logicalH,
                left: (box.w - CW) / 2,
                top: (box.h - logicalH) / 2,
                transform: [{scale}],
              },
            ]}>
            <Canvas key={`${mode}:${card.key}`} h={logicalH} animate={!reduce}>
              {card.draw(pal, logicalH)}
            </Canvas>
          </View>
        </View>
      </GestureDetector>

      {/* Over the stage but outside the gesture, so the switch is a plain
          button and a tap on it is never also a "next card". */}
      <View style={styles.chrome} pointerEvents="box-none">
        <View style={styles.bars} pointerEvents="none">
          {cards.map((c, i) => (
            <View
              key={c.key}
              style={[styles.bar, {backgroundColor: `${pal.ink}33`}]}>
              {i < at && (
                <View style={[styles.barFill, {backgroundColor: pal.ink}]} />
              )}
              {i === at && (
                <Animated.View
                  style={[styles.barFill, {backgroundColor: pal.ink}, fill]}
                />
              )}
            </View>
          ))}
        </View>
        <View style={styles.row}>
          {/* The watermark: the same corner on every card. */}
          <View style={styles.mark} pointerEvents="none">
            <LogoMark size={24} color={pal.ink} />
            <Text style={[styles.markText, ink]}>Relaxify</Text>
          </View>
          <View style={styles.modes}>
            {canShare && !capturing && (
              <TouchableOpacity
                onPress={share}
                style={[styles.share, {backgroundColor: pal.ink}]}
                hitSlop={8}>
                <ShareGlyph size={16} color={pal.bg} />
              </TouchableOpacity>
            )}
            {(['week', 'all'] as const).map(m => {
              const on = m === mode;
              return (
                <TouchableOpacity
                  key={m}
                  onPress={() => pick(m)}
                  style={[
                    styles.mode,
                    {borderColor: pal.ink},
                    on && {backgroundColor: pal.ink},
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{selected: on}}>
                  <Text
                    style={[styles.modeText, {color: on ? pal.bg : pal.ink}]}>
                    {m === 'week' ? 'This week' : 'All time'}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>
      <View
        style={[styles.grip, {backgroundColor: pal.ink}]}
        pointerEvents="none"
      />
    </Animated.View>
  );
}
