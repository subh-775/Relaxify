/**
 * A title that scrolls itself when it's too long to fit.
 *
 * Only animates when the text actually overflows — a short title sits still,
 * because text that drifts for no reason is worse than text that's clipped.
 *
 * One way only, as Spotify's: the line rests at its start, drifts right to
 * left until it is gone, re-enters from the right edge and slows to a stop
 * back at its start, then rests again. It never slides back left to right.
 *
 * `ticker` scrolls the line whether or not it fits: for a credit with
 * several artists, the drift is what says "there is more than one name here".
 *
 * The box's edges fade (`fadeColor`, the colour behind it) rather than cut,
 * so the text slips in and out instead of crossing a hard line. The left fade
 * is there only while the text is away from its start, so a line at rest
 * begins crisp.
 *
 * A line is always set at its own size: a long one floats, it never shrinks.
 *
 * `tail` continues the same line in `tailStyle` (the mini player's
 * "Song • Artists", where only the song is bold).
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
import Svg, {Defs, LinearGradient, Rect, Stop} from 'react-native-svg';

const SPEED = 33; // px per second — slow enough to read while it moves
const PAUSE = 2400;
/** How wide each edge's fade is. */
const FADE = 18;
/** Wider than any line of text: the lane the text is laid out in. */
const LANE = 4000;

export function Marquee({
  text,
  style,
  ticker = false,
  paused = false,
  tail,
  tailStyle,
  fadeColor,
}: {
  text: string;
  style?: StyleProp<TextStyle>;
  ticker?: boolean;
  /** Hold still — for a copy that is laid out but not on screen, where a
   *  native loop would still run every frame for nobody. */
  paused?: boolean;
  /** More of the same line, in its own style. */
  tail?: string;
  tailStyle?: StyleProp<TextStyle>;
  /** The colour behind the line, which its edges fade into. No fade without
   *  it. */
  fadeColor?: string;
}) {
  const [boxWidth, setBoxWidth] = useState(0);
  const [textWidth, setTextWidth] = useState(0);
  const shift = useRef(new Animated.Value(0)).current;

  const overflow = textWidth - boxWidth;
  const scrolls =
    !paused && (ticker ? textWidth > 0 && boxWidth > 0 : overflow > 4);

  const onBox = useCallback((e: LayoutChangeEvent) => {
    setBoxWidth(e.nativeEvent.layout.width);
  }, []);
  const onText = useCallback((e: LayoutChangeEvent) => {
    setTextWidth(e.nativeEvent.layout.width);
  }, []);

  useEffect(() => {
    shift.stopAnimation();
    shift.setValue(0);
    if (!scrolls) {
      return;
    }
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
      Animated.sequence([Animated.delay(PAUSE), out, jump, home]),
    );
    tick.start();
    return () => tick.stop();
    // text is in the deps so a track change restarts from the beginning.
  }, [scrolls, shift, text, tail, textWidth, boxWidth]);

  return (
    <View style={styles.clip} onLayout={onBox}>
      <Animated.View style={[styles.lane, {transform: [{translateX: shift}]}]}>
        <Text style={[style, styles.text]} numberOfLines={1} onLayout={onText}>
          {text}
          {!!tail && <Text style={tailStyle}>{tail}</Text>}
        </Text>
      </Animated.View>
      {scrolls && !!fadeColor && (
        <>
          <Animated.View
            pointerEvents="none"
            style={[
              styles.fade,
              styles.fadeLeft,
              {
                opacity: shift.interpolate({
                  inputRange: [-FADE, 0],
                  outputRange: [1, 0],
                  extrapolate: 'clamp',
                }),
              },
            ]}>
            <Edge color={fadeColor} from="left" />
          </Animated.View>
          <View pointerEvents="none" style={[styles.fade, styles.fadeRight]}>
            <Edge color={fadeColor} from="right" />
          </View>
        </>
      )}
    </View>
  );
}

/** One edge's fade: solid at the box's edge, clear FADE pixels in. */
function Edge({color, from}: {color: string; from: 'left' | 'right'}) {
  const id = `marqueeFade-${from}`;
  return (
    <Svg width="100%" height="100%">
      <Defs>
        <LinearGradient
          id={id}
          x1={from === 'left' ? '0' : '1'}
          y1="0"
          x2={from === 'left' ? '1' : '0'}
          y2="0">
          <Stop offset="0" stopColor={color} stopOpacity="1" />
          <Stop offset="1" stopColor={color} stopOpacity="0" />
        </LinearGradient>
      </Defs>
      <Rect width="100%" height="100%" fill={`url(#${id})`} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  clip: {overflow: 'hidden'},
  lane: {flexDirection: 'row', width: LANE},
  // Width must be intrinsic for onLayout to report the real text width; a
  // flexed Text would just report the box and never scroll.
  text: {alignSelf: 'flex-start', flexShrink: 0},
  fade: {position: 'absolute', top: 0, bottom: 0, width: FADE},
  fadeLeft: {left: 0},
  fadeRight: {right: 0},
});
