/**
 * Placeholders shaped like what is loading: grey boxes where the covers,
 * titles and artists will be, breathing softly. A spinner said "wait";
 * these say what is coming and where, and the page does not jump when it
 * lands, because the boxes are the rows' own size.
 */
import React, {useEffect} from 'react';
import {StyleSheet, View, type DimensionValue} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import {S} from '../theme';
import {TRACK_ROW_HEIGHT} from './TrackRow';

const BOX = '#1f1f1f';

/** One slow breath, on the UI thread: a busy JS thread does not stall it. */
function Pulse({children}: {children: React.ReactNode}) {
  const o = useSharedValue(1);
  useEffect(() => {
    o.value = withRepeat(
      withTiming(0.45, {duration: 850, easing: Easing.inOut(Easing.ease)}),
      -1,
      true,
    );
  }, [o]);
  const style = useAnimatedStyle(() => ({opacity: o.value}));
  return <Animated.View style={style}>{children}</Animated.View>;
}

/** A bar standing in for one line of text. */
export function SkeletonBar({
  width,
  height = 12,
  style,
}: {
  width: DimensionValue;
  height?: number;
  style?: object;
}) {
  return (
    <Pulse>
      <View style={[styles.bar, {width, height}, style]} />
    </Pulse>
  );
}

// Titles and artists are not all one length; equal bars read as a pattern.
const TITLE: DimensionValue[] = [
  '62%',
  '48%',
  '70%',
  '55%',
  '40%',
  '66%',
  '52%',
  '58%',
];
const ARTIST: DimensionValue[] = [
  '34%',
  '28%',
  '40%',
  '30%',
  '24%',
  '36%',
  '32%',
  '26%',
];

/** Song rows still on their way, each the height of a real one. */
export function SkeletonRows({count = 6}: {count?: number}) {
  return (
    <Pulse>
      {Array.from({length: count}, (_, i) => (
        <View key={i} style={styles.row}>
          <View style={styles.thumb} />
          <View style={styles.lines}>
            <View style={[styles.bar, styles.title, {width: TITLE[i % 8]}]} />
            <View style={[styles.bar, {width: ARTIST[i % 8]}]} />
          </View>
        </View>
      ))}
    </Pulse>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: S.gutter,
    height: TRACK_ROW_HEIGHT,
    gap: 12,
  },
  thumb: {width: 48, height: 48, borderRadius: 4, backgroundColor: BOX},
  lines: {flex: 1, gap: 9},
  bar: {height: 12, borderRadius: 6, backgroundColor: BOX},
  title: {height: 14},
});
