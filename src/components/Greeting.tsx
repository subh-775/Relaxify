/**
 * "Listen up Buddy!" — the header on Home, centred.
 *
 * "Listen" and "Buddy" wear a matched pair of colours, "up" stays white. The
 * pair changes only when you arrive: each launch, and each time you come back
 * to Home from another tab. While Home is on screen it holds still — a header
 * that kept changing under you was a distraction, not a greeting.
 *
 * Pairs, not two independent random picks: every entry in PAIRS is two colours
 * chosen to sit well together on true black, so any combination looks
 * deliberate. A new visit never repeats the pair the last one showed.
 *
 * Three SIBLING Texts, each with its own weight, not one Text with nested
 * spans. The app's default font (src/font.ts) names the family on every Text;
 * on Android a nested span that names a family without a weight resets to that
 * family's REGULAR weight, which made the words thin and look like another
 * typeface.
 *
 * It blushes in on mount — a short fade and rise — so opening the app feels
 * like arriving somewhere rather than a list appearing.
 *
 * Each arrival then answers itself: "Listen up Buddy!" for a beat, then
 * "You aren't ready for this", which stays until the next arrival. Each line
 * is ONE line, sized from the font's own measurements to fill the same width,
 * so the reply is a little smaller than the call and the two read as one
 * block. (Wrapped, the reply's second line fell outside the header and was
 * cut off by the page.) The first line sets the header's height; the reply
 * sits over it, so the swap moves nothing below.
 *
 * The reply lands word by word: one animated value, staggered by
 * interpolation, so it stays on the native driver.
 */
import React, {useEffect, useRef, useState} from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  StyleSheet,
  Text,
  type LayoutChangeEvent,
} from 'react-native';
import {C} from '../theme';

/** [Listen, Buddy]. Each pair is complementary or split-complementary, and
 *  every colour is bright enough to read on #000. */
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

/** The largest size the line is set at; narrower phones get less. */
const MAX_SIZE = 32;
/** The line's width at font size 1, word gaps excluded: "Listen", "up" and
 *  "Buddy!" in Plus Jakarta Sans ExtraBold with this tracking, measured from
 *  the font file. */
const LINE_EM = 7.381;
const WORD_GAP = 8;
/** The reply, word by word, and its width at font size 1 (same measurement). */
const REPLY = ['You', "aren't", 'ready', 'for', 'this'];
const REPLY_EM = 10.23;

/** How long "Listen up Buddy!" stays before the reply, and the cross-fade. */
const HOLD_MS = 2500;
const SWAP_MS = 350;

/** The font size that fits "Listen up Buddy!" in `room` dp: MAX_SIZE on most
 *  phones, smaller where the screen is narrow, never wrapped or clipped. The
 *  reply shares it. Exported for the test. */
export function fitSize(room: number): number {
  if (!(room > 0)) {
    return MAX_SIZE;
  }
  return Math.min(MAX_SIZE, Math.floor((room - 2 * WORD_GAP) / LINE_EM));
}

/** The same for the reply: the largest size that keeps it on one line. */
export function fitReplySize(room: number): number {
  if (!(room > 0)) {
    return MAX_SIZE;
  }
  const gaps = (REPLY.length - 1) * WORD_GAP;
  return Math.min(MAX_SIZE, Math.floor((room - gaps) / REPLY_EM));
}

/**
 * The index of the next pair: any pair except the current one. Exported for
 * the test.
 */
export function nextPair(
  current: number,
  count: number = PAIRS.length,
  rand: () => number = Math.random,
): number {
  if (count < 2) {
    return 0;
  }
  if (current < 0 || current >= count) {
    return Math.floor(rand() * count); // a launch: any pair at all
  }
  // Pick among the other count-1 pairs, then step over the current one.
  const pick = Math.floor(rand() * (count - 1));
  return pick >= current ? pick + 1 : pick;
}

export function Greeting({visible = true}: {visible?: boolean}) {
  const bloom = useRef(new Animated.Value(0)).current;
  // A fresh pair per launch: the initial pick is random, not the first entry.
  const [pair, setPair] = useState(() => nextPair(-1));

  // A new pair on each ARRIVAL at Home — the moment `visible` turns true. The
  // tab is hidden when this runs, so the new colours are already in place
  // when it appears; nothing changes while you are looking at it.
  const wasVisible = useRef(visible);
  useEffect(() => {
    if (visible && !wasVisible.current) {
      setPair(cur => nextPair(cur));
    }
    wasVisible.current = visible;
  }, [visible]);

  // The exchange, replayed on each arrival: 0 shows "Listen up Buddy!", 1 the
  // reply, where it ends. Leaving Home stops it and resets to the first line,
  // so the next arrival starts from the top.
  const swap = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    swap.stopAnimation();
    swap.setValue(0);
    if (!visible) {
      return;
    }
    let run: Animated.CompositeAnimation | null = null;
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then(reduce => {
        if (reduce || cancelled) {
          return; // Reduce motion: the first line only.
        }
        const to = (v: number, duration: number) =>
          Animated.timing(swap, {
            toValue: v,
            duration,
            easing: Easing.linear, // each word eases on its own, below
            useNativeDriver: true,
          });
        run = Animated.sequence([Animated.delay(HOLD_MS), to(1, SWAP_MS * 3)]);
        run.start();
      });
    return () => {
      cancelled = true;
      run?.stop();
    };
  }, [visible, swap]);

  useEffect(() => {
    Animated.timing(bloom, {
      toValue: 1,
      duration: 620,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [bloom]);

  const [listen, buddy] = PAIRS[pair];

  // Sized to the room it is given (see fitSize). Before the first layout it
  // is set at the full size; the fade-in covers the one-frame adjustment.
  const [room, setRoom] = useState(0);
  const onBox = (e: LayoutChangeEvent) => setRoom(e.nativeEvent.layout.width);
  const set = (size: number) => ({
    fontSize: size,
    lineHeight: Math.round(size * 1.28),
    letterSpacing: -size * (1.1 / 32),
  });
  const word = set(fitSize(room));
  const replyWord = set(fitReplySize(room));

  // The first line leaves in the first third of the swap; then each reply
  // word rises in turn, overshooting a hair, like it was dropped into place.
  const exit = swap.interpolate({
    inputRange: [0, 0.3],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });
  const land = (i: number) => {
    const from = 0.2 + i * 0.12;
    return {
      opacity: swap.interpolate({
        inputRange: [from, from + 0.18],
        outputRange: [0, 1],
        extrapolate: 'clamp',
      }),
      transform: [
        {
          translateY: swap.interpolate({
            inputRange: [from, from + 0.2, from + 0.32],
            outputRange: [14, -2, 0],
            extrapolate: 'clamp',
          }),
        },
      ],
    };
  };

  return (
    <Animated.View
      accessible
      accessibilityRole="header"
      accessibilityLabel="Listen up Buddy! You aren't ready for this"
      onLayout={onBox}
      style={[
        styles.wrap,
        {
          opacity: bloom,
          transform: [
            {
              translateY: bloom.interpolate({
                inputRange: [0, 1],
                outputRange: [6, 0],
              }),
            },
          ],
        },
      ]}>
      <Animated.View
        style={[
          styles.line,
          {
            opacity: exit,
            transform: [
              {
                translateY: swap.interpolate({
                  inputRange: [0, 0.3],
                  outputRange: [0, -10],
                  extrapolate: 'clamp',
                }),
              },
            ],
          },
        ]}>
        <Text
          style={[styles.word, word, {color: listen}]}
          maxFontSizeMultiplier={1}>
          Listen
        </Text>
        <Text style={[styles.word, word, styles.up]} maxFontSizeMultiplier={1}>
          up
        </Text>
        <Text
          style={[styles.word, word, {color: buddy}]}
          maxFontSizeMultiplier={1}>
          Buddy!
        </Text>
      </Animated.View>
      {/* The reply, over the first line and centred on it. Coloured like the
          first line: the first and last word take the pair. */}
      <Animated.View pointerEvents="none" style={[styles.line, styles.reply]}>
        {REPLY.map((w, i) => (
          <Animated.Text
            key={w}
            style={[
              styles.word,
              replyWord,
              i === 0
                ? {color: listen}
                : i === REPLY.length - 1
                ? {color: buddy}
                : styles.up,
              land(i),
            ]}
            maxFontSizeMultiplier={1}>
            {w}
          </Animated.Text>
        ))}
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {flex: 1, minWidth: 0},
  // Centred in its box; the box itself is centred on the screen by Home's
  // header (the mark on the left, a spacer of the same width on the right).
  // A word gap, not a space character: each word is its own Text.
  line: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: WORD_GAP,
  },
  // The reply over "Listen up Buddy!", centred in the height the first sets.
  reply: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  // Each word states its weight itself — see the note at the top. The size,
  // line height (room for the 'y' descender) and tracking come from fitSize.
  // maxFontSizeMultiplier={1} on each word: a display line sized to fit
  // exactly must not be scaled up by the system font size.
  word: {fontWeight: '900'},
  up: {color: C.text},
});
