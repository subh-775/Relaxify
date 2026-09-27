/**
 * The drawer's "What's new": three lines on what changed lately, at the foot
 * of the menu above the version number.
 *
 * GitHub's release bodies say nothing but "Full Changelog", so the lines ship
 * inside the app. Update HIGHLIGHTS with each release that changes something
 * people would notice; keep it to three short lines, newest first.
 *
 * A "New" badge shows after each update until the drawer has been opened and
 * closed once. When a newer version is waiting, the same card offers it with
 * an Install button instead, and fills up as it downloads.
 */
import React, {useEffect, useRef} from 'react';
import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {C} from '../theme';
import {appVersion} from '../backend';
import {createStore, useStoreValue} from '../storage';
import {startUpdateInstall, useUpdate} from '../update';
import {formatSize} from '../updateNotes';

export const HIGHLIGHTS = [
  'Open your Recap straight from Home',
  "Search and Your Library in Relaxify's own colours",
  'A new word each time you come back to Home',
];

const YELLOW = '#FFE14D';
const DARK = '#111014';

/** The version whose "New" badge has been seen. */
const seenFor = createStore<string>('mp.whatsNewSeen.v1', '', raw =>
  typeof raw === 'string' ? raw : '',
);

export function WhatsNew({visible}: {visible: boolean}) {
  const seen = useStoreValue(seenFor);
  const {phase, info, pct} = useUpdate();
  const fresh = !!appVersion && seen !== appVersion;

  // Seen once the drawer has been open and closed again with the badge on it.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (visible) {
      wasOpen.current = true;
    } else if (wasOpen.current && fresh) {
      seenFor.set(appVersion);
    }
  }, [visible, fresh]);

  if (info?.available) {
    const downloading = phase === 'downloading';
    const size = formatSize(info.sizeBytes);
    return (
      <View style={[styles.card, styles.ready]}>
        {downloading && (
          <View
            style={[styles.fill, {width: `${Math.max(3, Math.min(100, pct))}%`}]}
          />
        )}
        <View style={styles.head}>
          <Text style={styles.title}>
            {downloading
              ? `Downloading v${info.version}`
              : `v${info.version} is ready`}
          </Text>
          {downloading ? (
            <Text style={styles.pct}>{pct}%</Text>
          ) : (
            <TouchableOpacity
              style={styles.install}
              onPress={startUpdateInstall}
              accessibilityRole="button">
              <Text style={styles.installText}>Install</Text>
            </TouchableOpacity>
          )}
        </View>
        {!downloading && !!size && <Text style={styles.line}>{size}</Text>}
      </View>
    );
  }

  return (
    <View style={styles.card} accessibilityRole="summary">
      <View style={styles.head}>
        <Text style={styles.title}>What's new</Text>
        {fresh && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>New</Text>
          </View>
        )}
      </View>
      {HIGHLIGHTS.slice(0, 3).map(l => (
        <View key={l} style={styles.item}>
          <View style={styles.dot} />
          <Text style={styles.line}>{l}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 13,
    paddingVertical: 11,
    gap: 6,
    overflow: 'hidden',
  },
  ready: {borderColor: 'rgba(255,225,77,0.45)'},
  fill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(255,225,77,0.14)',
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  title: {color: C.text, fontSize: 13.5, fontWeight: '800', flexShrink: 1},
  badge: {
    backgroundColor: YELLOW,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  badgeText: {color: DARK, fontSize: 11, fontWeight: '800'},
  item: {flexDirection: 'row', gap: 8, alignItems: 'flex-start'},
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: YELLOW,
    marginTop: 7,
  },
  line: {flex: 1, color: C.sub, fontSize: 12.5, lineHeight: 18},
  pct: {color: YELLOW, fontSize: 13, fontWeight: '800'},
  install: {
    backgroundColor: YELLOW,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  installText: {color: DARK, fontSize: 12.5, fontWeight: '800'},
});
