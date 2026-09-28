/**
 * The phone's storage as one bar: what Relaxify's downloads, cache and saved
 * data take, what every other app takes, and what is free, with the numbers
 * under it. Relaxify's parts come first, in colour; the rest of the phone is
 * the quiet blue and grey behind them.
 *
 * A part too small to see (a few MB on a 128 GB phone) still gets a sliver,
 * so each coloured dot in the legend has something to point at.
 */
import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {C, S} from '../theme';
import type {StorageInfo} from '../backend';

const MIN_SLIVER = 1.2; // percent

export function formatStorage(bytes: number): string {
  if (!(bytes > 0)) {
    return '0 MB';
  }
  const gb = bytes / 1024 ** 3;
  if (gb >= 1) {
    return `${gb.toFixed(1)} GB`;
  }
  const mb = bytes / 1024 ** 2;
  return mb >= 10 ? `${Math.round(mb)} MB` : `${mb.toFixed(1)} MB`;
}

export function StorageBreakdown({
  info,
  savedBytes,
}: {
  info: StorageInfo;
  /** The app's own saved data (likes, playlists, stats), measured in JS. */
  savedBytes: number;
}) {
  const total = info.total_bytes;
  const ours = info.downloads_bytes + info.cache_bytes + savedBytes;
  const other = Math.max(0, total - info.free_bytes - ours);
  const parts = [
    {label: 'Relaxify downloads', bytes: info.downloads_bytes, color: C.accent},
    {label: 'Relaxify cache', bytes: info.cache_bytes, color: '#9096a2'},
    {label: 'Library and history', bytes: savedBytes, color: '#7B8CFF'},
    {label: 'Other apps', bytes: other, color: '#3d7bd9'},
  ];
  const pct = (b: number) =>
    total > 0 ? Math.max(b > 0 ? MIN_SLIVER : 0, (b / total) * 100) : 0;
  return (
    <View style={styles.wrap} accessibilityLabel={`Relaxify uses ${formatStorage(ours)}. ${formatStorage(info.free_bytes)} free.`}>
      <View style={styles.meter}>
        {parts.map(p =>
          p.bytes > 0 ? (
            <View
              key={p.label}
              style={[
                styles.part,
                {width: `${pct(p.bytes)}%`, backgroundColor: p.color},
              ]}
            />
          ) : null,
        )}
      </View>
      {[...parts, {label: 'Free', bytes: info.free_bytes, color: C.surfaceHi}].map(
        p => (
          <View key={p.label} style={styles.item}>
            <View style={[styles.dot, {backgroundColor: p.color}]} />
            <Text style={styles.label}>{p.label}</Text>
            <Text style={styles.value}>{formatStorage(p.bytes)}</Text>
          </View>
        ),
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {paddingHorizontal: S.gutter, paddingTop: 6, paddingBottom: 14, gap: 10},
  meter: {
    flexDirection: 'row',
    height: 10,
    borderRadius: 5,
    overflow: 'hidden',
    backgroundColor: C.surfaceHi,
    gap: 2,
    marginBottom: 4,
  },
  part: {height: '100%'},
  item: {flexDirection: 'row', alignItems: 'center', gap: 10},
  dot: {
    width: 11,
    height: 11,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  label: {flex: 1, color: C.text, fontSize: 14},
  value: {color: C.sub, fontSize: 13.5, fontVariant: ['tabular-nums']},
});
