/**
 * Liked Songs and Downloaded, as two big tiles at the top of Your Library.
 *
 * They are the two collections everyone opens most and the only two that are
 * always there, so they get a place of their own instead of being the first
 * two rows of a list. Each says how many songs it holds.
 */
import React from 'react';
import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import Svg, {Defs, LinearGradient, Rect, Stop} from 'react-native-svg';
import {ArrowDownToLine, Heart} from '../icons';
import {S} from '../theme';
import type {Collection} from '../collections';

const DARK = '#111014';

function Tile({
  c,
  from,
  to,
  ink,
  label,
  icon,
  onOpen,
}: {
  c: Collection;
  from: string;
  to: string;
  ink: string;
  label: string;
  icon: React.ReactNode;
  onOpen: (c: Collection) => void;
}) {
  const n = c.tracks.length;
  return (
    <TouchableOpacity
      style={styles.tile}
      activeOpacity={0.85}
      onPress={() => onOpen(c)}
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${n} ${n === 1 ? 'song' : 'songs'}`}>
      <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs>
          <LinearGradient id={c.kind} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={from} />
            <Stop offset="1" stopColor={to} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#${c.kind})`} />
      </Svg>
      <View style={styles.icon}>{icon}</View>
      <Text style={[styles.n, {color: ink}]}>{n}</Text>
      <Text style={[styles.label, {color: ink}]} numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export function LibraryHeroes({
  liked,
  downloads,
  onOpen,
}: {
  liked?: Collection;
  downloads?: Collection;
  onOpen: (c: Collection) => void;
}) {
  if (!liked && !downloads) {
    return null;
  }
  return (
    <View style={styles.row}>
      {liked && (
        <Tile
          c={liked}
          from="#7A2CFF"
          to="#FF4FB3"
          ink="#FFFFFF"
          label="Liked songs"
          icon={<Heart size={22} color="#fff" fill="#fff" />}
          onOpen={onOpen}
        />
      )}
      {downloads && (
        <Tile
          c={downloads}
          from="#1FD1B5"
          to="#3CB4FF"
          ink={DARK}
          label="Downloaded"
          icon={<ArrowDownToLine size={22} color={DARK} strokeWidth={2.6} />}
          onOpen={onOpen}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: S.gutter,
    paddingBottom: 14,
  },
  tile: {
    flex: 1,
    height: 104,
    borderRadius: 14,
    overflow: 'hidden',
    padding: 12,
    justifyContent: 'flex-end',
  },
  icon: {position: 'absolute', top: 12, right: 12},
  n: {fontSize: 26, lineHeight: 30, fontWeight: '800', letterSpacing: -1},
  label: {fontSize: 13.5, fontWeight: '800'},
});
