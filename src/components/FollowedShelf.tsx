/**
 * Home's "From artists you follow", below New releases: what following is
 * for. The newest releases of the artists you follow (a coral NEW on this
 * year's), each with the artist's face as a badge, then their own playlists.
 * Nothing followed, or nothing found: no section at all.
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
import {getFollowedReleases, type FollowedItem, type HomeItem} from '../backend';
import {upgradeArtwork} from '../tracks';
import {useOffline} from '../offline';

const COVER = 128;

export function FollowedShelf({onPick}: {onPick: (i: HomeItem) => void}) {
  const followed = useFollowedArtists();
  const offline = useOffline();
  const names = followed.map(a => a.name).join('|');
  const [data, setData] = useState<{
    releases: FollowedItem[];
    playlists: FollowedItem[];
  } | null>(null);

  useEffect(() => {
    if (!names || offline) {
      return;
    }
    let live = true;
    getFollowedReleases(names.split('|'))
      .then(d => live && setData(d))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [names, offline]);

  if (!names || !data || (!data.releases.length && !data.playlists.length)) {
    return null;
  }
  const face = (artist: string) =>
    followed.find(a => a.name.toLowerCase() === artist.toLowerCase())?.image;

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>From artists you follow</Text>
      <Text style={styles.sub}>Their newest first</Text>
      <FlatList
        horizontal
        data={data.releases}
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
      {data.playlists.map(p => (
        <TouchableOpacity
          key={p.perma_url}
          style={styles.li}
          activeOpacity={0.75}
          onPress={() => onPick(p)}>
          {p.image ? (
            <Image source={{uri: upgradeArtwork(p.image)}} style={styles.liArt} />
          ) : (
            <View style={[styles.liArt, styles.empty]} />
          )}
          <View style={styles.liText}>
            <Text style={styles.liTitle} numberOfLines={1}>
              {p.title}
            </Text>
            <Text style={styles.relSub} numberOfLines={1}>
              {p.subtitle}
            </Text>
          </View>
        </TouchableOpacity>
      ))}
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
  li: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: S.gutter,
    marginTop: 10,
  },
  liArt: {width: 42, height: 42, borderRadius: 6},
  liText: {flex: 1, minWidth: 0},
  liTitle: {...T.body, color: C.text},
});
