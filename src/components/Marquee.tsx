/**
 * A title that scrolls itself when it's too long to fit.
 *
 * Only animates when the text actually overflows — a short title sits still,
 * because text that drifts for no reason is worse than text that's clipped.
 * There's a pause at each end so the start is readable rather than perpetually
 * sliding past.
 *
 * `ticker` is the other motion: the line drifts right to left until it is gone,
 * re-enters from the right edge and settles back at its start, then rests.
 * For a credit with several artists, which gets it whether or not it fits —
 * the drift is what says "there is more than one name here".
 *
 * `shrinkTo` is the third: a title that would rather get smaller than move.
 * Too long for its line, it is set smaller until it fits, down to that share
 * of its size; only a title still too long at the floor scrolls, at the floor
 * size. The line's height stays where it was (give the style a lineHeight),
 * so a long name never nudges the controls under it.
 *
 * The text sits in a lane far wider than the box, so it is laid out at its
 * full width and clipped by the box. Laid out IN the box, Android set it at
 * the box's width and cut it with "…" before this ever saw the overflow: the
 * long credit stopped at "Arij…" and never moved.
 */
import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type TextStyle,
} from 'react-native';

const SPEED = 33; // px per second — slow enough to read while it moves
const PAUSE = 1200;
/** Wider than any line of text: the lane the text is laid out in. */
const LANE = 4000;

export function Marquee({
  text,
  style,
  ticker = false,
  paused = false,
  shrinkTo,
}: {
  text: string;
  style?: StyleProp<TextStyle>;
  ticker?: boolean;
  /** Hold still — for a copy that is laid out but not on screen, where a
   *  native loop would still run every frame for nobody. */
  paused?: boolean;
  /** Shrink a long line to fit before scrolling it, down to this share of
   *  its size (0.75 = three quarters). */
  shrinkTo?: number;
}) {
  const [boxWidth, setBoxWidth] = useState(0);
  /** The text's width at its own size, whatever size it is shown at. */
  const [naturalWidth, setNaturalWidth] = useState(0);
  const shift = useRef(new Animated.Value(0)).current;

  // How far a long line is shrunk. Width scales with size; the 0.985 covers
  // the letter-spacing, which does not.
  const baseSize = StyleSheet.flatten(style)?.fontSize ?? 14;
  const fit =
    shrinkTo && boxWidth > 0 && naturalWidth - boxWidth > 4
      ? Math.max(
          shrinkTo,
          Math.floor((boxWidth / naturalWidth) * 0.985 * 100) / 100,
        )
      : 1;
  const textWidth = naturalWidth * fit;
  const overflow = textWidth - boxWidth;
  const scrolls =
    !paused && (ticker ? textWidth > 0 && boxWidth > 0 : overflow > 4);

  const onBox = useCallback((e: LayoutChangeEvent) => {
    setBoxWidth(e.nativeEvent.layout.width);
  }, []);
  const onText = useCallback((e: LayoutChangeEvent) => {
    setNaturalWidth(e.nativeEvent.layout.width);
  }, []);

  useEffect(() => {
    shift.stopAnimation();
    shift.setValue(0);
    if (!scrolls) {
      return;
    }
    if (ticker) {
      // Out past the left edge, jump to just beyond the right one, glide home.
      // The jump happens while nothing is visible, so it never reads as one.
      const out = Animated.timing(shift, {
        toValue: -textWidth,
        duration: (textWidth / SPEED) * 1000,
        easing: Easing.linear,
        useNativeDriver: true,
      });
      const jump = Animated.timing(shift, {
        toValue: boxWidth,
        duration: 0,
        useNativeDriver: true,
      });
      const home = Animated.timing(shift, {
        toValue: 0,
        duration: (boxWidth / SPEED) * 1000,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      });
      const tick = Animated.loop(
        Animated.sequence([Animated.delay(PAUSE * 2), out, jump, home]),
      );
      tick.start();
      return () => tick.stop();
    }
    const travel = (overflow / SPEED) * 1000;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(PAUSE),
        Animated.timing(shift, {
          toValue: -overflow,
          duration: travel,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
        Animated.delay(PAUSE),
        Animated.timing(shift, {
          toValue: 0,
          duration: travel,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
    // text is in the deps so a track change restarts from the beginning.
  }, [scrolls, overflow, shift, text, ticker, textWidth, boxWidth]);

  return (
    <View style={styles.clip} onLayout={onBox}>
      <Animated.View style={[styles.lane, {transform: [{translateX: shift}]}]}>
        <Text
          style={[style, styles.text, fit < 1 && {fontSize: baseSize * fit}]}
          numberOfLines={1}>
          {text}
        </Text>
        {/* The measure: the same line at its own size, never seen. The
            shown copy cannot be it once it has been shrunk. */}
        <Text
          style={[style, styles.text, styles.measure]}
          numberOfLines={1}
          onLayout={onText}
          accessible={false}
          importantForAccessibility="no">
          {text}
        </Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  clip: {overflow: 'hidden'},
  lane: {flexDirection: 'row', width: LANE},
  // Width must be intrinsic for onLayout to report the real text width; a
  // flexed Text would just report the box and never scroll.
  text: {alignSelf: 'flex-start', flexShrink: 0},
  measure: {position: 'absolute', left: 0, top: 0, opacity: 0},
});
