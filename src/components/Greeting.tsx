/**
 * "Listen up ___!" — the header on Home, centred.
 *
 * "Listen up" holds still; the last word is a slot reel. On each arrival (each
 * launch, and each time you come back to Home from another tab) the reel spins
 * through a few names and lands on one at random — Legend, GOAT, Maestro,
 * Bestie — in a pill of the greeting's colour. While Home is on screen it holds
 * still: a header that kept changing under you was a distraction, not a
 * greeting. A new visit never lands on the word or colour the last one showed.
 *
 * Sized from the font's own measurements, not by wrapping: "Listen up" plus
 * the LONGEST word, pill padding included, fits the room on every phone, so the
 * line is always one line and the header's height never changes. The pill
 * itself is as wide as the word it lands on; while the reel spins, longer
 * words pass through that window clipped, like a real slot.
 *
 * Separate Texts, each stating its own weight, never nested spans: the app's
 * default font (src/font.ts) names the family on every Text, and on Android a
 * nested span that names a family without a weight falls back to REGULAR.
 *
 * The spin is one Animated.Value on the native driver.
 */
import React, {useEffect, useRef, useState} from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import {C} from '../theme';

/** Colour pairs for the greeting; the pill takes the first. Every colour is
 *  bright enough to read on #000 and to carry dark type. */
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

/**
 * What the reel can land on, each with its width at font size 1 in Plus
 * Jakarta Sans ExtraBold at this tracking, measured from the font file. Add a
 * word only with its measurement; nothing longer than Rockstar!, or the line
 * has to shrink on every phone to make room for it.
 */
export const WORDS: [string, number][] = [
  ['Buddy!', 3.431],
  ['Legend!', 3.848],
  ['Maestro!', 4.204],
  ['Rockstar!', 4.511],
  ['Cutie!', 2.857],
  ['Champ!', 3.75],
  ['Boss!', 2.599],
  ['Fam!', 2.361],
  ['Bestie!', 3.267],
  ['GOAT!', 3.194],
  ['MVP!', 2.535],
  ['OG!', 1.979],
  ['Hero!', 2.608],
  ['Icon!', 2.376],
  ['Bro!', 1.989],
  ['King!', 2.422],
  ['Queen!', 3.492],
  ['Chief!', 2.846],
  ['DJ!', 1.432],
  ['VIP!', 1.911],
  ['BFF!', 2.126],
  ['Genius!', 3.547],
  ['Star!', 2.265],
];

/** The largest size the line is set at; narrower phones get less. */
const MAX_SIZE = 32;
/** "Listen up" at font size 1, measured the same way. */
const LISTEN_EM = 4.096;
const LONGEST_EM = Math.max(...WORDS.map(w => w[1]));
const GAP = 7;
/** The pill's padding either side of its word. */
const PAD = 9;
/** Words the reel passes before it lands. */
const SPIN_WORDS = 7;
const SPIN_MS = 1400;

/** The font size that fits "Listen up" and the longest word, pill included,
 *  in `room` dp. Exported for the test. */
export function fitSize(room: number): number {
  if (!(room > 0)) {
    return MAX_SIZE;
  }
  return Math.min(
    MAX_SIZE,
    Math.floor((room - GAP - 2 * PAD) / (LISTEN_EM + LONGEST_EM)),
  );
}

/**
 * The index of the next pick: anything except the current one (a launch,
 * `current` -1, can be anything). Used for both the colour and the word.
 * Exported for the test.
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
    return Math.floor(rand() * count);
  }
  // Pick among the other count-1, then step over the current one.
  const pick = Math.floor(rand() * (count - 1));
  return pick >= current ? pick + 1 : pick;
}

/** A reel ending on `land`: random words, never the same one twice running. */
export function buildReel(
  land: number,
  rand: () => number = Math.random,
): number[] {
  const reel = [land];
  while (reel.length < SPIN_WORDS + 1) {
    reel.unshift(nextPair(reel[0], WORDS.length, rand));
  }
  return reel;
}

export function Greeting({visible = true}: {visible?: boolean}) {
  const bloom = useRef(new Animated.Value(0)).current;
  const spin = useRef(new Animated.Value(0)).current;
  const [pair, setPair] = useState(() => nextPair(-1));
  const [reel, setReel] = useState(() => buildReel(nextPair(-1, WORDS.length)));
  const land = reel[reel.length - 1];

  // A new colour and a new word on each ARRIVAL at Home — the moment `visible`
  // turns true — and the reel spins to it. Leaving Home changes nothing.
  const first = useRef(true);
  useEffect(() => {
    if (!visible) {
      return;
    }
    if (!first.current) {
      setPair(cur => nextPair(cur));
      setReel(cur => buildReel(nextPair(cur[cur.length - 1], WORDS.length)));
    }
    first.current = false;
    spin.stopAnimation();
    spin.setValue(0);
    let run: Animated.CompositeAnimation | null = null;
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then(reduce => {
        if (cancelled) {
          return;
        }
        if (reduce) {
          spin.setValue(1); // reduce motion: the word, no spin
          return;
        }
        run = Animated.sequence([
          Animated.delay(250),
          Animated.timing(spin, {
            toValue: 1,
            duration: SPIN_MS,
            // Slows into the word and nudges past it, like a reel settling.
            easing: Easing.bezier(0.15, 0.9, 0.25, 1.08),
            useNativeDriver: true,
          }),
        ]);
        run.start();
      });
    return () => {
      cancelled = true;
      run?.stop();
    };
  }, [visible, spin]);

  useEffect(() => {
    Animated.timing(bloom, {
      toValue: 1,
      duration: 620,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [bloom]);

  // Sized to the room it is given (see fitSize). Before the first layout it
  // is set at the full size; the fade-in covers the one-frame adjustment.
  const [room, setRoom] = useState(0);
  const onBox = (e: LayoutChangeEvent) => setRoom(e.nativeEvent.layout.width);
  const size = fitSize(room);
  const lineH = Math.round(size * 1.28);
  const word = {
    fontSize: size,
    lineHeight: lineH,
    letterSpacing: -size * (1.1 / 32),
  };
  const pillW = Math.ceil(WORDS[land][1] * size) + 2 * PAD;

  return (
    <Animated.View
      accessible
      accessibilityRole="header"
      accessibilityLabel={`Listen up ${WORDS[land][0]}`}
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
      <View style={styles.line}>
        <Text style={[styles.word, styles.lead, word]} maxFontSizeMultiplier={1}>
          Listen up
        </Text>
        <View
          style={[
            styles.pill,
            {width: pillW, height: lineH, backgroundColor: PAIRS[pair][0]},
          ]}>
          <Animated.View
            style={{
              transform: [
                {
                  translateY: spin.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, -(reel.length - 1) * lineH],
                  }),
                },
              ],
            }}>
            {reel.map((w, i) => (
              <Text
                key={i}
                numberOfLines={1}
                style={[styles.word, styles.slot, word, {width: pillW}]}
                maxFontSizeMultiplier={1}>
                {WORDS[w][0]}
              </Text>
            ))}
          </Animated.View>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {flex: 1, minWidth: 0},
  // Centred in its box; the box itself is centred on the screen by Home's
  // header (the mark on the left, a spacer of the same width on the right).
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: GAP,
  },
  // maxFontSizeMultiplier={1} on each: a display line sized to fit exactly
  // must not be scaled up by the system font size.
  word: {fontWeight: '900'},
  lead: {color: C.text},
  pill: {borderRadius: 10, overflow: 'hidden'},
  slot: {color: '#111014', textAlign: 'center'},
});
