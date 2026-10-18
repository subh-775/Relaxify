/**
 * A grab-and-drag scroll thumb for long lists: a slim dark pill with three
 * grip lines, a little in from the right edge. It keeps its colour while held.
 *
 * It used to be a white half-disc with grey chevrons, which read as a tab
 * stuck to the edge rather than as a handle. Grip lines say "hold and drag",
 * and a dark pill stays quiet over bright covers until it is touched.
 *
 * Appears while the list is moving and fades after it stops. Drag it and the
 * list follows proportionally, so the far end of a long library is one thumb
 * movement away instead of a dozen flings. Only offered when there is enough
 * list to need it (over two and a half screens): on a short list a scroll
 * thumb is just something sitting on top of the rows.
 *
 * Everything runs on the UI thread — the scroll offset arrives in a worklet
 * scroll handler and the drag writes back with Reanimated's scrollTo — so a
 * busy JS thread cannot make the thumb trail the finger. JS hears about it
 * exactly twice per scroll session, when the thumb becomes touchable and when
 * it stops being so.
 */
import React, {useState} from 'react';
import {StyleSheet, View} from 'react-native';
import {Gesture, GestureDetector} from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  scrollTo,
  useAnimatedReaction,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
  type AnimatedRef,
  type SharedValue,
} from 'react-native-reanimated';
import {C} from '../theme';

/** The pill: its height, its width, and its gap from the screen edge. */
const THUMB = 52;
const THUMB_W = 24;
const INSET = 4;
/** Breathing room above and below the thumb's travel. */
const EDGE = 8;
/** How long the thumb stays after the list stops. */
const HIDE_AFTER_MS = 1300;
/** The list must be this many screens longer than the window to get a thumb. */
const WORTH_SCREENS = 1.5;

type FastScrollState = {
  scrollY: SharedValue<number>;
  contentH: SharedValue<number>;
  viewH: SharedValue<number>;
  shown: SharedValue<number>;
  dragging: SharedValue<boolean>;
};

/** The list's side: a scroll handler to hand the list, and the state the
 *  thumb reads. */
export function useFastScroll() {
  const scrollY = useSharedValue(0);
  const contentH = useSharedValue(0);
  const viewH = useSharedValue(0);
  const shown = useSharedValue(0);
  const dragging = useSharedValue(false);

  const onScroll = useAnimatedScrollHandler(e => {
    scrollY.value = e.contentOffset.y;
    // The event carries both sizes, so no onLayout / onContentSizeChange —
    // and before the first scroll the thumb is hidden anyway.
    contentH.value = e.contentSize.height;
    viewH.value = e.layoutMeasurement.height;
    if (!dragging.value) {
      // FULL at once, on the first scroll event in either direction — no
      // fade-in. A fade (and the slide that went with it) meant the thumb
      // arrived grey and half-there, and became grabbable only once it had
      // finished growing. Restarted on every event, so it goes away
      // HIDE_AFTER_MS after the LAST one; withDelay holds it at 1 until then.
      shown.value = 1;
      shown.value = withDelay(HIDE_AFTER_MS, withTiming(0, {duration: 260}));
    }
  });

  const state: FastScrollState = {scrollY, contentH, viewH, shown, dragging};
  return {onScroll, state};
}

/** Where the thumb's travel starts and how long it is, for a window this tall. */
function trackLength(viewH: number, bottomInset: number): number {
  'worklet';
  return Math.max(1, viewH - bottomInset - THUMB - EDGE * 2);
}

export function FastScroll({
  listRef,
  state,
  bottomInset = 0,
}: {
  /** Any scrollable — a FlatList here, but scrollTo takes them all. */
  listRef: AnimatedRef<any>;
  state: FastScrollState;
  /** The part of the window the floating bars cover; the thumb stops above it. */
  bottomInset?: number;
}) {
  const {scrollY, contentH, viewH, shown, dragging} = state;
  const dragTop = useSharedValue(0);
  const startTop = useSharedValue(0);
  // Touchable only while visible — an invisible thumb must not eat taps on the
  // rows under it.
  const [live, setLive] = useState(false);

  useAnimatedReaction(
    () =>
      shown.value > 0.5 &&
      contentH.value - viewH.value > viewH.value * WORTH_SCREENS,
    (on, prev) => {
      if (on !== prev) {
        runOnJS(setLive)(on);
      }
    },
  );

  const thumbStyle = useAnimatedStyle(() => {
    const vh = viewH.value;
    const max = Math.max(0, contentH.value - vh);
    const len = trackLength(vh, bottomInset);
    const top = dragging.value
      ? dragTop.value
      : max > 0
      ? (scrollY.value / max) * len
      : 0;
    const worth = max > vh * WORTH_SCREENS;
    return {
      opacity: worth ? shown.value : 0,
      backgroundColor: REST,
      transform: [{translateY: EDGE + Math.min(len, Math.max(0, top))}],
    };
  });

  const drag = Gesture.Pan()
    .minDistance(0)
    .hitSlop({left: 18, right: INSET, top: 10, bottom: 10})
    .onStart(() => {
      const vh = viewH.value;
      const max = Math.max(0, contentH.value - vh);
      const len = trackLength(vh, bottomInset);
      const top = max > 0 ? (scrollY.value / max) * len : 0;
      startTop.value = top;
      dragTop.value = top;
      dragging.value = true;
      shown.value = 1;
    })
    .onUpdate(e => {
      const vh = viewH.value;
      const max = Math.max(0, contentH.value - vh);
      const len = trackLength(vh, bottomInset);
      const top = Math.min(len, Math.max(0, startTop.value + e.translationY));
      dragTop.value = top;
      scrollTo(listRef, 0, (top / len) * max, false);
    })
    .onFinalize(() => {
      dragging.value = false;
      shown.value = withDelay(HIDE_AFTER_MS, withTiming(0, {duration: 260}));
    });

  return (
    <GestureDetector gesture={drag}>
      <Animated.View
        style={[styles.thumb, thumbStyle]}
        pointerEvents={live ? 'auto' : 'none'}>
        <View style={styles.grip} pointerEvents="none">
          <View style={styles.line} />
          <View style={styles.line} />
          <View style={styles.line} />
        </View>
      </Animated.View>
    </GestureDetector>
  );
}

/** Dark glass at rest; the background is animated, so it lives here. */
const REST = 'rgba(60,60,66,0.92)';

const styles = StyleSheet.create({
  // Pinned top-right and moved with a transform, so the travel never costs a
  // layout pass. A full pill, inset from the edge, with a hairline rim so it
  // still has an outline over a black row.
  thumb: {
    position: 'absolute',
    top: 0,
    right: INSET,
    width: THUMB_W,
    height: THUMB,
    borderRadius: THUMB_W / 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 8,
    shadowOffset: {width: 0, height: 2},
  },
  grip: {gap: 4},
  line: {width: 10, height: 2, borderRadius: 1, backgroundColor: C.text},
});
