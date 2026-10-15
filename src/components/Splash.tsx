/**
 * Startup screen: the Relaxify icon arriving. Coloured layers (peach, berry,
 * coral, the logo's own gradient) spin in from nothing, the icon lands on top,
 * wobbles upright and stays.
 *
 * It is a GIF (src/assets/startup.gif, played by Fresco's animated-gif
 * module) that plays once and holds its last frame, so a slow start shows a
 * finished icon, never a loop that reads as "still loading". The phone's own
 * launch screen is plain black (styles.xml) so the icon is seen arriving
 * once, not shown, removed and built again.
 *
 * `onPlayed` fires when the animation has run, so the app never lifts the
 * splash halfway through it. A GIF that fails to load counts as played.
 */
import React, {useCallback, useEffect, useRef} from 'react';
import {Image, StyleSheet, View, useWindowDimensions} from 'react-native';
import {C} from '../theme';

const STARTUP = require('../assets/startup.gif');
/** The animation's length (1.3 s) and a beat on the finished icon. */
const PLAY_MS = 1400;

export function Splash({onPlayed}: {onPlayed?: () => void}) {
  const {width} = useWindowDimensions();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const played = useRef(onPlayed);
  played.current = onPlayed;

  const done = useCallback(() => played.current?.(), []);
  const onLoad = useCallback(() => {
    timer.current = setTimeout(done, PLAY_MS);
  }, [done]);
  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current);
      }
    },
    [],
  );

  return (
    <View style={styles.wrap}>
      <Image
        source={STARTUP}
        style={{width, height: width}}
        fadeDuration={0}
        onLoad={onLoad}
        onError={done}
        accessibilityLabel="Relaxify"
      />
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
