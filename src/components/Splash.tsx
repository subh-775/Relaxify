/**
 * Startup screen: the app's own mark, instead of the old "Starting the music
 * engine…" spinner — an app should announce itself with its mark, not a status
 * line. Shown only on a true cold start (no cached Home rows and no restored
 * session).
 *
 * It fades and settles ONCE and then holds still. It used to breathe on a loop,
 * scaling 1 → 1.06 forever, which is the thing that makes a splash read as a
 * loading state: something still moving means something is still happening, so
 * a mark that keeps pulsing makes a fast start look slow. One arrival, then a
 * finished screen.
 */
import React, {useEffect, useRef} from 'react';
import {Animated, Easing, StyleSheet, View} from 'react-native';
import {C} from '../theme';

import {LogoMark} from './Logo';

export function Splash() {
  const enter = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(enter, {
      toValue: 1,
      duration: 420,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [enter]);

  return (
    <View style={styles.wrap}>
      <Animated.View
        style={{
          opacity: enter,
          transform: [
            {scale: enter.interpolate({inputRange: [0, 1], outputRange: [0.88, 1]})},
          ],
        }}>
        <LogoMark size={148} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.bg,
  },
});
