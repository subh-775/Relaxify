/**
 * Renders the current toast just above the player bar.
 *
 * Every toast is one shape, the "Press back again to exit" capsule: centred,
 * only as wide as its words, no empty box either side. A toast about a song is
 * washed in that song's colour, as the mini player is; one about nothing in
 * particular is plain dark. No cover and no Undo beside the words: a like or
 * an add is undone where it was done, and the room they took left the words
 * off-centre. A toast that asks something (Replace?) keeps its one button,
 * right after the question.
 */
import React, {useEffect, useRef} from 'react';
import {Animated, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import Svg, {Defs, LinearGradient, Rect, Stop} from 'react-native-svg';
import {runToastAction, useToast} from '../toast';
import {surfaceTint, useArtworkColor} from '../artworkColor';
import {C} from '../theme';

export function Toaster({bottom = 96}: {bottom?: number}) {
  const item = useToast();
  const anim = useRef(new Animated.Value(0)).current;
  const tint = useArtworkColor(item?.art ?? undefined);

  useEffect(() => {
    Animated.timing(anim, {
      toValue: item ? 1 : 0,
      duration: item ? 220 : 160,
      useNativeDriver: true,
    }).start();
  }, [item, anim]);

  if (!item) {
    return null;
  }

  const motion = {
    bottom,
    opacity: anim,
    transform: [
      {
        translateY: anim.interpolate({
          inputRange: [0, 1],
          outputRange: [10, 0],
        }),
      },
    ],
  };

  return (
    <Animated.View
      pointerEvents={item.action ? 'box-none' : 'none'}
      style={[styles.wrap, motion]}>
      {!!tint && item.kind !== 'warn' && (
        <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
          <Defs>
            <LinearGradient id="toastFill" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor={surfaceTint(tint, 0.3, 0.55)} />
              <Stop offset="1" stopColor={surfaceTint(tint, 0.18, 0.5)} />
            </LinearGradient>
          </Defs>
          <Rect width="100%" height="100%" fill="url(#toastFill)" />
        </Svg>
      )}
      <View style={styles.line}>
        <Text style={styles.text} numberOfLines={2}>
          {item.message}
        </Text>
        {!!item.action && (
          <TouchableOpacity
            onPress={runToastAction}
            hitSlop={10}
            accessibilityRole="button">
            <Text style={styles.actionText}>{item.action.label}</Text>
          </TouchableOpacity>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    alignSelf: 'center',
    maxWidth: '90%',
    zIndex: 9999,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: 'rgba(38,38,38,0.94)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 22,
    paddingVertical: 12,
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 12,
    shadowOffset: {width: 0, height: 8},
  },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  text: {
    flexShrink: 1,
    color: '#fff',
    fontSize: 13.5,
    fontWeight: '700',
    textAlign: 'center',
  },
  actionText: {color: C.accent, fontSize: 13.5, fontWeight: '700'},
});
