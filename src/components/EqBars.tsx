/**
 * Three little equalizer bars: dancing while music plays, lying flat when it
 * stops, so a "now playing" mark also says whether anything is playing.
 *
 * Each bar is its own looping scale on the native driver, at a different pace,
 * so the three never move in step.
 */
import React, {useEffect, useRef} from 'react';
import {Animated, Easing, StyleSheet, View} from 'react-native';

const PACES = [900, 620, 1100];

export function EqBars({
  colors,
  active,
  height = 14,
}: {
  colors: string[];
  active: boolean;
  height?: number;
}) {
  const bars = useRef(PACES.map(() => new Animated.Value(0.3))).current;
  useEffect(() => {
    if (!active) {
      bars.forEach(b => {
        b.stopAnimation();
        Animated.timing(b, {
          toValue: 0.3,
          duration: 200,
          useNativeDriver: true,
        }).start();
      });
      return;
    }
    const loops = bars.map((b, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(b, {
            toValue: 1,
            duration: PACES[i] / 2,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(b, {
            toValue: 0.25,
            duration: PACES[i] / 2,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
      ),
    );
    loops.forEach(l => l.start());
    return () => loops.forEach(l => l.stop());
  }, [active, bars]);

  return (
    <View style={[styles.row, {height}]} pointerEvents="none">
      {bars.map((b, i) => (
        <Animated.View
          key={i}
          style={[
            styles.bar,
            {
              height,
              backgroundColor: colors[i % colors.length],
              // Grown from the bottom: scale about the centre, then shift.
              transform: [
                {translateY: Animated.multiply(Animated.subtract(1, b), height / 2)},
                {scaleY: b},
              ],
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {flexDirection: 'row', alignItems: 'flex-end', gap: 2},
  bar: {width: 3, borderRadius: 2},
});
