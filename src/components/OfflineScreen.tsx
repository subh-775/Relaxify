/**
 * What Home and Search show with no internet, instead of rows that cannot
 * load: an honest "Oops, offline", and the way to the music that still plays.
 */
import React, {useEffect, useState} from 'react';
import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {C, S, T} from '../theme';
import {WifiOff} from '../icons';
import {getLocalLibrary} from '../backend';
import {downloadsCollection, type Collection} from '../collections';

export function OfflineScreen({
  onOpenCollection,
}: {
  onOpenCollection: (c: Collection) => void;
}) {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    getLocalLibrary()
      .then(l => live && setCount(l.tracks.length))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  return (
    <View style={styles.wrap}>
      <WifiOff size={44} color={C.brand} strokeWidth={2} />
      <Text style={styles.big}>Oops, offline</Text>
      <Text style={styles.sub}>
        {count
          ? `No internet right now. Your ${count} downloaded ${
              count === 1 ? 'song still plays' : 'songs still play'
            }, over and over.`
          : 'No internet right now. Songs you download play without it.'}
      </Text>
      {!!count && (
        <TouchableOpacity
          style={styles.btn}
          activeOpacity={0.85}
          accessibilityRole="button"
          onPress={() => onOpenCollection(downloadsCollection([]))}>
          <Text style={styles.btnText}>Go to your downloads</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: S.gutter * 2,
  },
  big: {
    color: C.brand,
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: -1,
    marginTop: 4,
  },
  sub: {...T.body, color: C.sub, textAlign: 'center', maxWidth: 260},
  btn: {
    marginTop: 12,
    backgroundColor: C.text,
    borderRadius: 999,
    paddingHorizontal: 26,
    paddingVertical: 13,
  },
  btnText: {color: C.bg, fontSize: 15, fontWeight: '800'},
});
