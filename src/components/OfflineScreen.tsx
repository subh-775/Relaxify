/**
 * What Home and Search show with no internet: all the music that still plays,
 * laid out like Home rather than as one long list. Search narrows it to the
 * songs matching `query`.
 */
import React, {useMemo} from 'react';
import {
  FlatList,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {C, S, T} from '../theme';
import {Play, Shuffle, WifiOff} from '../icons';
import type {Track} from '../backend';
import {useDownloads} from '../downloads';
import {useLocalMusic} from '../localMusic';
import {
  albumShelves,
  artistShelves,
  listShelves,
  recentShelf,
  type Shelf,
} from '../offlineShelves';
import {setShuffle} from '../player';
import {usePlaylists} from '../playlists';
import {useRecentlyPlayed} from '../recentlyPlayed';
import {useLikes} from '../store';
import {formatTotalDuration, getBestArtworkUrl, getTrackId} from '../tracks';
import {formatStorage} from './StorageBreakdown';
import {TrackRow} from './TrackRow';
import {useListEnd} from './UpdateModal';

const CARD = 132;

type OnPlay = (track: Track, context?: Track[]) => void;

function Card({
  title,
  subtitle,
  art,
  onPress,
}: {
  title: string;
  subtitle: string;
  art: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${subtitle}`}
      onPress={onPress}>
      {art ? (
        <Image source={{uri: art}} style={styles.art} />
      ) : (
        <View style={styles.art} />
      )}
      <Text style={styles.cardTitle} numberOfLines={1}>
        {title}
      </Text>
      <Text style={styles.cardSub} numberOfLines={1}>
        {subtitle}
      </Text>
    </TouchableOpacity>
  );
}

function ShelfRow({
  title,
  shelves,
  onPlay,
}: {
  title: string;
  shelves: Shelf[];
  onPlay: OnPlay;
}) {
  if (!shelves.length) {
    return null;
  }
  return (
    <>
      <Text style={styles.heading}>{title}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.shelf}>
        {shelves.map(s => (
          <Card
            key={s.key}
            title={s.title}
            subtitle={s.subtitle}
            art={getBestArtworkUrl(s.tracks[0])}
            onPress={() => onPlay(s.tracks[0], s.tracks)}
          />
        ))}
      </ScrollView>
    </>
  );
}

export function OfflineScreen({
  onPlayTrack,
  query = '',
}: {
  onPlayTrack: OnPlay;
  query?: string;
}) {
  const saved = useDownloads();
  const phoneMusic = useLocalMusic();
  // Everything that plays here: what was downloaded, then the person's own.
  const downloads = useMemo(
    () => [...saved, ...phoneMusic],
    [saved, phoneMusic],
  );
  const listEnd = useListEnd();
  const recent = useRecentlyPlayed();
  const likes = useLikes();
  const playlists = usePlaylists();
  const q = query.trim().toLowerCase();

  const shown = useMemo(
    () =>
      q
        ? downloads.filter(t =>
            `${t.title} ${t.artist}`.toLowerCase().includes(q),
          )
        : downloads,
    [downloads, q],
  );
  const recents = useMemo(
    () =>
      recentShelf(recent, downloads).map(t => ({
        key: t.file_path ?? getTrackId(t),
        title: t.title,
        subtitle: t.artist,
        tracks: [t],
      })),
    [recent, downloads],
  );
  const lists = useMemo(
    () =>
      listShelves(
        [
          {key: 'liked', name: 'Liked Songs', tracks: likes},
          ...playlists.map(p => ({
            key: `pl:${p.id}`,
            name: p.name,
            tracks: p.tracks,
          })),
        ],
        downloads,
      ),
    [likes, playlists, downloads],
  );
  const albums = useMemo(() => albumShelves(downloads), [downloads]);
  const artists = useMemo(() => artistShelves(downloads), [downloads]);
  const stats = useMemo(
    () =>
      [
        `${downloads.length} song${downloads.length === 1 ? '' : 's'}`,
        formatTotalDuration(downloads),
        formatStorage(
          downloads.reduce((sum, t) => sum + (t.file_size ?? 0), 0),
        ),
      ]
        .filter(Boolean)
        .join(' · '),
    [downloads],
  );

  if (!downloads.length) {
    return (
      <View style={styles.empty}>
        <WifiOff size={44} color={C.brand} strokeWidth={2} />
        <Text style={styles.big}>Oops, offline</Text>
        <Text style={styles.emptySub}>
          No internet right now. Songs you download play without it.
        </Text>
      </View>
    );
  }

  const shuffleAll = () => {
    onPlayTrack(
      downloads[Math.floor(Math.random() * downloads.length)],
      downloads,
    );
    // Give the queue a beat to build before shuffling its tail.
    setTimeout(() => setShuffle(true).catch(() => {}), 600);
  };

  return (
    <FlatList
      data={shown}
      keyExtractor={t => t.file_path ?? getTrackId(t)}
      contentContainerStyle={listEnd}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      ListHeaderComponent={
        q ? (
          <Text style={styles.heading}>
            {`${shown.length} of your songs`}
          </Text>
        ) : (
          <>
            <View style={styles.head}>
              <View style={styles.badge}>
                <WifiOff size={15} color={C.brand} strokeWidth={2.4} />
                <Text style={styles.badgeText}>You're offline</Text>
              </View>
              <Text style={styles.title}>Your music</Text>
              <Text style={styles.sub}>{stats}</Text>
              <View style={styles.actions}>
                <TouchableOpacity
                  style={styles.play}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  onPress={() => onPlayTrack(downloads[0], downloads)}>
                  <Play size={18} color={C.bg} fill={C.bg} />
                  <Text style={styles.playText}>Play</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.shuffle}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  onPress={shuffleAll}>
                  <Shuffle size={18} color={C.text} />
                  <Text style={styles.shuffleText}>Shuffle</Text>
                </TouchableOpacity>
              </View>
            </View>
            <ShelfRow
              title="Recently played"
              shelves={recents}
              onPlay={onPlayTrack}
            />
            <ShelfRow title="Your lists" shelves={lists} onPlay={onPlayTrack} />
            <ShelfRow title="Albums" shelves={albums} onPlay={onPlayTrack} />
            <ShelfRow title="Artists" shelves={artists} onPlay={onPlayTrack} />
            <Text style={styles.heading}>All songs</Text>
          </>
        )
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
  emptySub: {...T.body, color: C.sub, textAlign: 'center', maxWidth: 260},
  head: {paddingHorizontal: S.gutter, paddingTop: 16, paddingBottom: 4},
  badge: {flexDirection: 'row', alignItems: 'center', gap: 6},
  badgeText: {color: C.brand, fontSize: 13, fontWeight: '700'},
  title: {
    color: C.text,
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: -0.8,
    marginTop: 8,
  },
  sub: {...T.body, color: C.sub, marginTop: 2},
  actions: {flexDirection: 'row', gap: 10, marginTop: 16},
  play: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: C.text,
    borderRadius: 999,
    paddingVertical: 13,
  },
  playText: {color: C.bg, fontSize: 15, fontWeight: '700'},
  shuffle: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderColor: C.sub,
    borderRadius: 999,
    paddingVertical: 13,
  },
  shuffleText: {color: C.text, fontSize: 15, fontWeight: '700'},
  heading: {
    color: C.text,
    fontSize: 20,
    fontWeight: '700',
    paddingHorizontal: S.gutter,
    marginTop: 24,
    marginBottom: 10,
  },
  shelf: {paddingHorizontal: S.gutter, gap: 12},
  card: {width: CARD},
  art: {
    width: CARD,
    height: CARD,
    borderRadius: 8,
    backgroundColor: C.sub,
  },
  cardTitle: {color: C.text, fontSize: 14, fontWeight: '600', marginTop: 7},
  cardSub: {color: C.sub, fontSize: 12.5, marginTop: 1},
});
