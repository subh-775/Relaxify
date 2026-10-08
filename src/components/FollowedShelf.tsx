/**
 * Home's "From artists you love", below New releases: what following is
 * for. The newest releases of the artists you follow (a coral NEW on this
 * year's), each with the artist's face as a badge. Nothing followed, or
 * nothing found: no section at all.
 */
import React, {useEffect, useState} from 'react';
import {
  FlatList,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {C, S, T} from '../theme';
import {useFollowedArtists} from '../artists';
import {
  getFollowedReleases,
  waitForBackend,
  type FollowedItem,
  type HomeItem,
} from '../backend';
import {asArray, createStore, useStoreValue} from '../storage';
import {upgradeArtwork} from '../tracks';
import {useOffline} from '../offline';

const COVER = 128;

/** The last shelf, so it is there at once on the next launch. Keyed by the
 *  names it was made for: follow someone new and it is fetched again. */
const last = createStore<{names: string; items: FollowedItem[]}>(
  'mp.followedShelf.v1',
  {names: '', items: []},
  raw => {
    const r = raw as {names?: unknown; items?: unknown} | null;
    return {names: String(r?.names ?? ''), items: asArray<FollowedItem>(r?.items)};
  },
);

export function FollowedShelf({onPick}: {onPick: (i: HomeItem) => void}) {
  const followed = useFollowedArtists();
  const offline = useOffline();
  const names = followed.map(a => a.name).join('|');
  const saved = useStoreValue(last);
  const [fresh, setFresh] = useState<FollowedItem[] | null>(null);
  const data = fresh ?? (saved.names === names ? saved.items : null);

  // Home mounts while the engine is still starting, with last launch's rows:
  // asked then, this failed and stayed empty until a follow changed. So it
  // waits for the engine, and tries again a few times.
  useEffect(() => {
    if (!names || offline) {
      return;
    }
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const attempt = (n: number) => {
      waitForBackend()
        .then(ok => (ok ? getFollowedReleases(names.split('|')) : Promise.reject()))
        .then(items => {
          if (live) {
            setFresh(items);
            last.set({names, items});
          }
        })
        .catch(() => {
          if (live && n < 3) {
            timer = setTimeout(() => attempt(n + 1), 10_000 * (n + 1));
          }
        });
    };
    setFresh(null);
    attempt(0);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [names, offline]);

  if (!names || !data?.length) {
    return null;
  }
  const face = (artist: string) =>
    followed.find(a => a.name.toLowerCase() === artist.toLowerCase())?.image;

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>From artists you love</Text>
      <Text style={styles.sub}>Their newest first</Text>
      <FlatList
        horizontal
        data={data}
        keyExtractor={r => r.perma_url || `${r.artist}|${r.title}`}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.shelf}
        renderItem={({item}) => (
          <TouchableOpacity
            style={styles.rel}
            activeOpacity={0.75}
            onPress={() => onPick(item)}>
            <View>
              {item.image ? (
                <Image
                  source={{uri: upgradeArtwork(item.image)}}
                  style={styles.cover}
                />
              ) : (
                <View style={[styles.cover, styles.empty]} />
              )}
              {item.new && <Text style={styles.newTag}>NEW</Text>}
              {!!face(item.artist) && (
                <Image source={{uri: face(item.artist)}} style={styles.ava} />
              )}
            </View>
            <Text style={styles.relTitle} numberOfLines={1}>
              {item.title}
            </Text>
            <Text style={styles.relSub} numberOfLines={1}>
              {item.subtitle}
            </Text>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {marginTop: 22},
  title: {...T.rowTitle, color: C.text, paddingHorizontal: S.gutter},
  sub: {...T.sub, color: C.sub, paddingHorizontal: S.gutter, marginTop: 2},
  shelf: {paddingHorizontal: S.gutter, gap: S.gap, paddingTop: 10},
  rel: {width: COVER},
  cover: {width: COVER, height: COVER, borderRadius: 8},
  empty: {backgroundColor: C.surfaceHi},
  newTag: {
    position: 'absolute',
    top: 6,
    left: 6,
    backgroundColor: C.brand,
    color: '#fff',
    fontSize: 9.5,
    fontWeight: '800',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: 'hidden',
  },
  ava: {
    position: 'absolute',
    left: 6,
    bottom: -10,
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: C.bg,
  },
  relTitle: {...T.body, color: C.text, marginTop: 14},
  relSub: {...T.sub, color: C.sub, marginTop: 2},

});
