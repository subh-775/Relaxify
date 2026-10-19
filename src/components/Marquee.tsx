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
 * `fade` does the same with a mask instead of a colour: the text itself turns
 * transparent at the edges, so it works over a background that isn't one
 * colour (the big player's cover glow, where colour fades showed as boxes).
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
import MaskedView from '@react-native-masked-view/masked-view';
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
  fade = false,
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
  /** Fade the edges to transparent with a mask, over any background. */
  fade?: boolean;
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

  const lane = (
    <Animated.View style={[styles.lane, {transform: [{translateX: shift}]}]}>
      <Text style={[style, styles.text]} numberOfLines={1} onLayout={onText}>
        {text}
        {!!tail && <Text style={tailStyle}>{tail}</Text>}
      </Text>
    </Animated.View>
  );

  if (fade) {
    // The right edge always fades (a line too long for the box runs into it,
    // moving or not); the left one only while the text is away from its
    // start, by covering that fade with solid mask at rest.
    return (
      <MaskedView
        style={styles.clip}
        onLayout={onBox}
        maskElement={
          <View style={styles.mask}>
            <View style={styles.maskEdge}>
              <Ramp from="left" />
              <Animated.View
                style={[
                  styles.maskSolid,
                  StyleSheet.absoluteFill,
                  {
                    opacity: shift.interpolate({
                      inputRange: [-FADE, 0],
                      outputRange: [0, 1],
                      extrapolate: 'clamp',
                    }),
                  },
                ]}
              />
            </View>
            <View style={[styles.maskSolid, styles.maskMiddle]} />
            <View style={styles.maskEdge}>
              <Ramp from="right" />
            </View>
          </View>
        }>
        {lane}
      </MaskedView>
    );
  }

  return (
    <View style={styles.clip} onLayout={onBox}>
      {lane}
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

/** A mask edge: see-through at the box's edge, solid FADE pixels in. Only the
 *  alpha counts in a mask, so the colour is arbitrary. */
function Ramp({from}: {from: 'left' | 'right'}) {
  const id = `marqueeRamp-${from}`;
  return (
    <Svg width="100%" height="100%">
      <Defs>
        <LinearGradient
          id={id}
          x1={from === 'left' ? '0' : '1'}
          y1="0"
          x2={from === 'left' ? '1' : '0'}
          y2="0">
          <Stop offset="0" stopColor="#000" stopOpacity="0" />
          <Stop offset="1" stopColor="#000" stopOpacity="1" />
        </LinearGradient>
      </Defs>
      <Rect width="100%" height="100%" fill={`url(#${id})`} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  clip: {overflow: 'hidden'},
  mask: {flex: 1, flexDirection: 'row'},
  maskEdge: {width: FADE},
  maskMiddle: {flex: 1},
  maskSolid: {backgroundColor: '#000'},
  lane: {flexDirection: 'row', width: LANE},
  // Width must be intrinsic for onLayout to report the real text width; a
  // flexed Text would just report the box and never scroll.
  text: {alignSelf: 'flex-start', flexShrink: 0},
  fade: {position: 'absolute', top: 0, bottom: 0, width: FADE},
  fadeLeft: {left: 0},
  fadeRight: {right: 0},
});
