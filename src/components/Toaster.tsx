/**
 * Renders the current toast just above the player bar.
 *
 * A chip washed in the song's own colour, the way the mini player is, with
 * its cover on the left and, when there is one, an action such as Undo on the
 * right. A toast about no song in particular is the same chip in plain dark.
 */
import React, {useEffect, useRef} from 'react';
import {Animated, Image, StyleSheet, Text, TouchableOpacity} from 'react-native';
import Svg, {Defs, LinearGradient, Rect, Stop} from 'react-native-svg';
import {runToastAction, useToast} from '../toast';
import {surfaceTint, useArtworkColor} from '../artworkColor';
import {C, S} from '../theme';

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
    transform: [{translateY: anim.interpolate({inputRange: [0, 1], outputRange: [10, 0]})}],
  };

  if (item.kind === 'warn') {
    return (
      <Animated.View pointerEvents="none" style={[styles.warnWrap, motion]}>
        <Text style={styles.warnText} numberOfLines={2}>
          {item.message}
        </Text>
      </Animated.View>
    );
  }

  return (
    <Animated.View pointerEvents="box-none" style={[styles.wrap, motion]}>
      {!!tint && (
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
      {!!item.art && <Image source={{uri: item.art}} style={styles.art} />}
      <Text style={styles.text} numberOfLines={2}>
        {item.message}
      </Text>
      {!!item.action && (
        <TouchableOpacity
          onPress={runToastAction}
          hitSlop={10}
          accessibilityRole="button"
          style={styles.action}>
          <Text style={styles.actionText}>{item.action.label}</Text>
        </TouchableOpacity>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: S.gutter,
    right: S.gutter,
    zIndex: 9999,
    minHeight: 50,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#26262b',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 8,
    paddingVertical: 8,
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 12,
    shadowOffset: {width: 0, height: 8},
  },
  art: {width: 34, height: 34, borderRadius: 6, backgroundColor: C.surfaceHi},
  text: {flex: 1, color: '#fff', fontSize: 13.5, fontWeight: '700', paddingLeft: 4},
  action: {paddingHorizontal: 8, paddingVertical: 4},
  actionText: {color: '#fff', fontSize: 13.5, fontWeight: '800', opacity: 0.9},
  /**
   * Warn: a system notice like "press back again to exit", which must not read
   * like a song confirmation. A pill only as wide as its words, on the same
   * translucent surface the mini player and every sheet use.
   */
  warnWrap: {
    position: 'absolute',
    zIndex: 9999,
    alignSelf: 'center',
    backgroundColor: 'rgba(38,38,38,0.94)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 999,
    elevation: 8,
  },
  warnText: {color: C.text, fontSize: 13, fontWeight: '700', textAlign: 'center'},
});
