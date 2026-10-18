/**
 * Soft edges on a song-swipe window, the floating lines' fade (Marquee) for
 * the swipe: the song coming in slips in from the edge instead of crossing a
 * hard cut, and the one leaving slips out.
 *
 * Only while a song is between places. At rest (and at the far end of a
 * glide, where the neighbour sits exactly where the song was) the edges are
 * clear, so a song that has landed begins crisp — the same rule as Marquee's
 * left fade, and the reason the swap at the end of a swipe can't flash.
 *
 * The edge is filled with what is behind the window: `top` to `bottom`,
 * because the mini player's bar is a vertical gradient. A mask gives it the
 * sideways fade, so a one-colour strip doesn't show as a band across it.
 */
import React from 'react';
import {StyleSheet} from 'react-native';
import Animated, {
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, {Defs, LinearGradient, Mask, Rect, Stop} from 'react-native-svg';

/** How wide each edge's fade is. */
const WIDTH = 24;
/** Pixels of travel over which the edges come in, from either rest point. */
const RAMP = 16;

export function SwipeEdges({
  slide,
  span,
  top,
  bottom = top,
}: {
  slide: SharedValue<number>;
  span: SharedValue<number>;
  /** The colour behind the window's top edge, and its bottom one. */
  top: string;
  bottom?: string;
}) {
  const style = useAnimatedStyle(() => {
    const s = Math.abs(slide.value);
    const w = span.value;
    const away = w > 0 ? Math.min(s, Math.abs(w - s)) : s;
    return {opacity: Math.min(1, away / RAMP)};
  });
  return (
    <>
      <Animated.View
        pointerEvents="none"
        style={[styles.edge, styles.left, style]}>
        <Edge side="left" top={top} bottom={bottom} />
      </Animated.View>
      <Animated.View
        pointerEvents="none"
        style={[styles.edge, styles.right, style]}>
        <Edge side="right" top={top} bottom={bottom} />
      </Animated.View>
    </>
  );
}

function Edge({
  side,
  top,
  bottom,
}: {
  side: 'left' | 'right';
  top: string;
  bottom: string;
}) {
  const id = `swipeEdge-${side}`;
  return (
    <Svg width="100%" height="100%">
      <Defs>
        <LinearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={top} />
          <Stop offset="1" stopColor={bottom} />
        </LinearGradient>
        <LinearGradient
          id={`${id}-alpha`}
          x1={side === 'left' ? '0' : '1'}
          y1="0"
          x2={side === 'left' ? '1' : '0'}
          y2="0">
          <Stop offset="0" stopColor="#fff" stopOpacity="1" />
          <Stop offset="1" stopColor="#fff" stopOpacity="0" />
        </LinearGradient>
        <Mask id={`${id}-mask`}>
          <Rect width="100%" height="100%" fill={`url(#${id}-alpha)`} />
        </Mask>
      </Defs>
      <Rect
        width="100%"
        height="100%"
        fill={`url(#${id}-fill)`}
        mask={`url(#${id}-mask)`}
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  edge: {position: 'absolute', top: 0, bottom: 0, width: WIDTH},
  left: {left: 0},
  right: {right: 0},
});
