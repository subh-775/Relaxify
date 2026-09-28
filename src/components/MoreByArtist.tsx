/**
 * "More by <artist>": the artist's other albums at the foot of an album page,
 * so finishing a record leads somewhere instead of to a dead end.
 *
 * One /artist lookup, after the page is up; nothing shows until it answers,
 * and nothing at all if it fails or the artist has no other albums.
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
import {getArtist} from '../backend';

type Album = {name: string; image?: string; year?: string | number};

const SIZE = 118;

export function MoreByArtist({
  artist,
  current,
  onOpen,
}: {
  artist: string;
  /** This album's name, left out of the row. */
  current: string;
  onOpen: (album: string, artist: string) => void;
}) {
  const [albums, setAlbums] = useState<Album[]>([]);
  useEffect(() => {
    let alive = true;
    getArtist(artist)
      .then(p => {
        if (alive) {
          const here = current.trim().toLowerCase();
          setAlbums(
            p.albums
              .filter(a => a.name && a.name.trim().toLowerCase() !== here)
              .slice(0, 10),
          );
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [artist, current]);

  if (!albums.length) {
    return null;
  }
  return (
    <View style={styles.wrap}>
      <Text style={styles.title} numberOfLines={1}>
        More by {artist}
      </Text>
      <FlatList
        horizontal
        data={albums}
        keyExtractor={a => a.name}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        renderItem={({item}) => (
          <TouchableOpacity
            style={styles.card}
            activeOpacity={0.75}
            onPress={() => onOpen(item.name, artist)}>
            {item.image ? (
              <Image source={{uri: item.image}} style={styles.art} />
            ) : (
              <View style={[styles.art, styles.artEmpty]} />
            )}
            <Text style={styles.name} numberOfLines={2}>
              {item.name}
            </Text>
            {!!item.year && <Text style={styles.year}>{item.year}</Text>}
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {paddingTop: 22, gap: 12},
  title: {...T.rowTitle, color: C.text, paddingHorizontal: S.gutter},
  row: {paddingHorizontal: S.gutter, gap: 12},
  card: {width: SIZE},
  art: {width: SIZE, height: SIZE, borderRadius: 6, backgroundColor: C.surface},
  artEmpty: {backgroundColor: C.surfaceHi},
  name: {color: C.text, fontSize: 13, fontWeight: '700', marginTop: 7},
  year: {color: C.sub, fontSize: 12, marginTop: 2},
});
