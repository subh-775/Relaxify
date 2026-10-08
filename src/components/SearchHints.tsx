/**
 * The empty search box, teaching what it can do: a plain grey placeholder
 * that rolls between pasting a playlist link and searching by mood, with the
 * same rise as the Home header's words. It only exists while the box is
 * empty, so typing stops it at once.
 */
import React, {useEffect, useRef, useState} from 'react';
import {Animated, Easing, StyleSheet, Text} from 'react-native';

const EVERY_MS = 3200;

const HINTS = ['Paste a Spotify or YT playlist', 'Search by mood, like chill'];

export function SearchHints() {
  const [i, setI] = useState(0);
  // -1 below, 0 in place, 1 gone above.
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const t = setInterval(() => {
      Animated.timing(v, {
        toValue: 1,
        duration: 220,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }).start(() => {
        setI(n => (n + 1) % HINTS.length);
        v.setValue(-1);
        Animated.timing(v, {
          toValue: 0,
          duration: 320,
          easing: Easing.out(Easing.back(1.6)),
          useNativeDriver: true,
        }).start();
      });
    }, EVERY_MS);
    return () => {
      clearInterval(t);
      v.stopAnimation();
    };
  }, [v]);
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.wrap,
        {
          opacity: v.interpolate({
            inputRange: [-1, 0, 1],
            outputRange: [0, 1, 0],
          }),
          transform: [
            {
              translateY: v.interpolate({
                inputRange: [-1, 0, 1],
                outputRange: [12, 0, -12],
              }),
            },
          ],
        },
      ]}>
      <Text style={styles.hint} numberOfLines={1}>
        {HINTS[i]}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
  },
  hint: {color: '#6b6b6b', fontSize: 15, fontWeight: '600', flexShrink: 1},
});
