/**
 * What Home and Search show with no internet, instead of rows that cannot
 * load: an honest "offline", and the music that still plays, right there.
 * Search narrows it with `query`.
 */
import React, {useMemo} from 'react';
import {FlatList, StyleSheet, Text, View} from 'react-native';
import {C, S, T} from '../theme';
import {WifiOff} from '../icons';
import type {Track} from '../backend';
import {useDownloads} from '../downloads';
import {useListEnd} from './UpdateModal';
import {getTrackId} from '../tracks';
import {TrackRow} from './TrackRow';

export function OfflineScreen({
  onPlayTrack,
  query = '',
}: {
  onPlayTrack: (track: Track, context?: Track[]) => void;
  query?: string;
}) {
  const downloads = useDownloads();
  const listEnd = useListEnd();
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q
      ? downloads.filter(t => `${t.title} ${t.artist}`.toLowerCase().includes(q))
      : downloads;
  }, [downloads, query]);

  if (!downloads.length) {
    return (
      <View style={styles.empty}>
        <WifiOff size={44} color={C.brand} strokeWidth={2} />
        <Text style={styles.big}>Oops, offline</Text>
        <Text style={styles.sub}>
          No internet right now. Songs you download play without it.
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      data={shown}
      keyExtractor={t => t.file_path ?? getTrackId(t)}
      contentContainerStyle={listEnd}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={
        <View style={styles.head}>
          <WifiOff size={22} color={C.brand} strokeWidth={2} />
          <Text style={styles.title}>You're offline</Text>
          <Text style={styles.sub}>
            {query.trim()
              ? `${shown.length} of your downloads`
              : `Your ${downloads.length} downloaded ${
                  downloads.length === 1 ? 'song still plays' : 'songs still play'
                }.`}
          </Text>
        </View>
      }
      renderItem={({item}) => (
        <TrackRow track={item} onPress={() => onPlayTrack(item, shown)} />
      )}
    />
  );
}

const styles = StyleSheet.create({
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: S.gutter * 2,
  },
  big: {
    color: C.brand,
    fontSize: 34,
    fontWeight: '700',
    letterSpacing: -1,
    marginTop: 4,
  },
  sub: {...T.body, color: C.sub},
  head: {paddingHorizontal: S.gutter, paddingTop: 16, paddingBottom: 12, gap: 4},
  title: {color: C.text, fontSize: 26, fontWeight: '700', marginTop: 6},
});
