/**
 * The shape every Home card shares (Recap, Jam, Spotify import, Continue): one
 * fixed height, the same padding, a small line over a big one, and a pill at
 * the foot, on a bright field with its own artwork turning in the corner.
 *
 * Fixed rather than fitted to its words, so a stack of cards reads as one set
 * and swapping one for another never shifts what is below it.
 */
import React, {useEffect, useRef} from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {S} from '../theme';
import type {Pal} from '../brandArt';

export const CARD_H = 156;
export const CARD_ART = 190;

export function FeatureCard({
  pal,
  kicker,
  title,
  action,
  onPress,
  art,
  spin = true,
  label,
  width,
  corner,
  children,
}: {
  pal: Pal;
  kicker: string;
  title: string;
  /** The pill's words. */
  action: string;
  onPress: () => void;
  /** Drawn in the top-right corner, CARD_ART square. */
  art?: React.ReactNode;
  /** Turn the artwork slowly. */
  spin?: boolean;
  label?: string;
  /** Set inside the carousel: the card's own width, no page margin. */
  width?: number;
  /** Replaces the pill row (the Spotify card's inline link box). */
  children?: React.ReactNode;
  /** A small control pinned top-right, over the artwork (the import's ✕). */
  corner?: React.ReactNode;
}) {
  const turn = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!spin) {
      return;
    }
    const loop = Animated.loop(
      Animated.timing(turn, {
        toValue: 1,
        duration: 30000,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [turn, spin]);

  const ink = {color: pal.ink};
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      style={[
        styles.card,
        {backgroundColor: pal.bg},
        width != null && [styles.inRow, {width}],
      ]}
      accessibilityRole="button"
      accessibilityLabel={label ?? `${kicker}. ${title}. ${action}`}>
      {!!art && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.art,
            spin && {
              transform: [
                {
                  rotate: turn.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0deg', '360deg'],
                  }),
                },
              ],
            },
          ]}>
          {art}
        </Animated.View>
      )}
      {!!corner && <View style={styles.corner}>{corner}</View>}
      <View style={styles.words}>
        <Text style={[styles.kicker, ink]} numberOfLines={1}>
          {kicker}
        </Text>
        <Text style={[styles.big, ink]} numberOfLines={2}>
          {title}
        </Text>
      </View>
      {children ?? (
        <View style={[styles.go, {backgroundColor: pal.ink}]}>
          <Text style={[styles.goText, {color: pal.bg}]}>{action}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    height: CARD_H,
    marginHorizontal: S.gutter,
    marginBottom: 12,
    borderRadius: 16,
    padding: 16,
    overflow: 'hidden',
    justifyContent: 'space-between',
  },
  inRow: {marginHorizontal: 0},
  art: {
    position: 'absolute',
    right: -34,
    top: -38,
    width: CARD_ART,
    height: CARD_ART,
  },
  words: {gap: 2},
  corner: {position: 'absolute', top: 12, right: 12, zIndex: 2},
  kicker: {fontSize: 13, fontWeight: '800'},
  big: {
    fontSize: 30,
    lineHeight: 33,
    fontWeight: '800',
    letterSpacing: -1.2,
    maxWidth: '70%',
  },
  go: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  goText: {fontSize: 13.5, fontWeight: '800'},
});
