/**
 * The Home header: today's doodle (src/doodle.ts), edge to edge.
 *
 * Drawn at the screen's full width and the doodle's own shape (360 x 64 dp
 * as designed), so every phone shows the whole picture, scaled, never
 * cropped. The menu mark sits over its left end, where every doodle leaves
 * room for it.
 *
 * Two layers: the still underneath, the animation over it. The still is what
 * shows with Reduce motion on, while Home is out of sight (an animation
 * nobody sees still decodes every frame), and for the moment the animation
 * takes to load, so the header never flashes empty. Before there is any
 * doodle at all (first launch offline), the plain wordmark.
 *
 * A tap replays it from the start, silently: no toast. The app's accent
 * colour is the doodle's.
 */
import React, {useEffect, useState} from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import {useReducedMotion} from 'react-native-reanimated';
import {setAccent} from '../accent';
import {useDoodle} from '../doodle';
import {C} from '../theme';

/** The band's shape before a manifest says otherwise: the designs' own. */
const ASPECT = 360 / 64;

export function Doodle({visible = true}: {visible?: boolean}) {
  const pick = useDoodle();
  const {width} = useWindowDimensions();
  const reduce = useReducedMotion();
  // Bumped by a tap: a new key mounts the animation afresh, from frame one.
  const [play, setPlay] = useState(0);

  useEffect(() => {
    if (pick) {
      setAccent(pick.doodle.accent);
    }
  }, [pick]);

  const height = width / (pick?.aspect ?? ASPECT);
  const label = pick ? `Relaxify. ${pick.caption}` : 'Relaxify';

  return (
    <Pressable
      style={{width, height}}
      disabled={!pick}
      onPress={() => {
        if (pick) {
          setPlay(p => p + 1);
        }
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Plays the doodle again">
      <View style={styles.fallback}>
        <Text style={styles.wordmark} maxFontSizeMultiplier={1}>
          Relaxify
        </Text>
      </View>
      {pick && (
        <Image
          source={{uri: pick.still}}
          style={StyleSheet.absoluteFill}
          resizeMode="contain"
          fadeDuration={0}
        />
      )}
      {pick && visible && !reduce && (
        <Image
          key={play}
          source={{uri: pick.anim}}
          style={StyleSheet.absoluteFill}
          resizeMode="contain"
          fadeDuration={0}
        />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fallback: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wordmark: {
    color: C.text,
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: -0.8,
  },
});
