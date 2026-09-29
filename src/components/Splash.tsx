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
 *
 * Big, and dimmed to DIM of full brightness: on black, a full-strength note
 * this size glows; a darker one sits quietly until Home arrives. Opacity over
 * the black page is the same thing as lowering its brightness.
 */
import React, {useEffect, useRef} from 'react';
import {Animated, Easing, StyleSheet, View} from 'react-native';
import {C} from '../theme';

import {LogoMark} from './Logo';

const SIZE = 280;
/** 45% darker than the mark itself. */
const DIM = 0.55;

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
          opacity: enter.interpolate({inputRange: [0, 1], outputRange: [0, DIM]}),
          transform: [
            {scale: enter.interpolate({inputRange: [0, 1], outputRange: [0.88, 1]})},
          ],
        }}>
        <LogoMark size={SIZE} />
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
