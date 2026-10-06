/**
 * The empty search box, teaching what it can do: a hint that rolls between a
 * few examples (an artist you actually play, pasting a Spotify link, a mood)
 * with the same rise as the Home header's words. It only exists while the box
 * is empty, so typing stops it at once.
 *
 * Two sibling Texts per hint, each with its own weight: a nested span that
 * names no weight falls back to Regular on Android (see Greeting).
 */
import React, {useEffect, useRef, useState} from 'react';
import {Animated, Easing, StyleSheet, Text} from 'react-native';

const EVERY_MS = 3200;

export function SearchHints({artist}: {artist?: string}) {
  const hints: [string, string][] = [
    ['Try ', artist || 'Arijit Singh'],
    ['Paste a ', 'Spotify or YouTube playlist'],
    ['Search by mood, like ', 'chill'],
  ];
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
        setI(n => (n + 1) % 3);
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
  const [lead, key] = hints[i];
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
      <Text style={styles.lead} numberOfLines={1}>
        {lead}
      </Text>
      <Text style={styles.key} numberOfLines={1}>
        {key}
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
  lead: {color: '#6b6b6b', fontSize: 15, fontWeight: '600'},
  key: {color: '#111014', fontSize: 15, fontWeight: '800', flexShrink: 1},
});
