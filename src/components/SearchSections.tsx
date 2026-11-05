/**
 * What a search answers with besides song rows: the one Top result, the
 * albums and playlists it names, and the placeholder while it looks.
 *
 * Search listed songs and artists only, so "after hours" never offered The
 * Weeknd's album and "aashiqui 2" never the soundtrack: a record could only
 * be reached through one of its songs' menus.
 */
import React from 'react';
import {
  FlatList,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {C, S, T, fs} from '../theme';
import {Play} from '../icons';
import {type AlbumCard, type HomeItem, type Track} from '../backend';
import {cleanText, getBestArtworkUrl, upgradeArtwork} from '../tracks';
import {releaseTitle} from '../collections';
import {SkeletonBar, SkeletonRows} from './Skeleton';
import {albumKind, type TopResult} from '../searchTop';

export {
  albumKind,
  pickTopResult,
  rankAlbums,
  type TopResult,
} from '../searchTop';

export function TopResultCard({
  top,
  onOpenArtist,
  onOpenAlbum,
  onPlay,
  onMenu,
}: {
  top: TopResult;
  onOpenArtist: (name: string) => void;
  onOpenAlbum: (a: AlbumCard) => void;
  onPlay: (t: Track) => void;
  onMenu: (t: Track) => void;
}) {
  let image = '';
  let title = '';
  let sub = '';
  let round = false;
  let open: () => void;
  if (top.kind === 'artist') {
    image = top.artist.image || '';
    title = top.artist.name;
    sub = 'Artist';
    round = true;
    open = () => onOpenArtist(top.artist.name);
  } else if (top.kind === 'album') {
    image = top.album.image || '';
    title = releaseTitle(top.album.name);
    sub = [albumKind(top.album), top.album.artist].filter(Boolean).join(' · ');
    open = () => onOpenAlbum(top.album);
  } else {
    image = getBestArtworkUrl(top.track);
    title = cleanText(top.track.title);
    sub = ['Song', cleanText(top.track.artist)].filter(Boolean).join(' · ');
    open = () => onPlay(top.track);
  }
  return (
    <View style={styles.topWrap}>
      <Text style={styles.heading}>Top result</Text>
      <TouchableOpacity
        style={styles.top}
        activeOpacity={0.8}
        onPress={open}
        onLongPress={top.kind === 'song' ? () => onMenu(top.track) : undefined}
        delayLongPress={350}
        accessibilityRole="button"
        accessibilityLabel={`${title}, ${sub}`}>
        {image ? (
          <Image
            source={{uri: upgradeArtwork(image)}}
            style={[styles.topArt, round && styles.round]}
          />
        ) : (
          <View style={[styles.topArt, styles.artEmpty, round && styles.round]}>
            <Text style={styles.initial}>
              {title.trim().charAt(0).toUpperCase()}
            </Text>
          </View>
        )}
        <Text style={styles.topTitle} numberOfLines={2}>
          {title}
        </Text>
        <Text style={styles.topSub} numberOfLines={1}>
          {sub}
        </Text>
        {top.kind === 'song' && (
          <View style={styles.topPlay} pointerEvents="none">
            <Play size={20} color={C.bg} fill={C.bg} />
          </View>
        )}
      </TouchableOpacity>
    </View>
  );
}

/** A heading, then a sideways row of covers. */
function Shelf<I>({
  title,
  items,
  keyOf,
  render,
}: {
  title: string;
  items: I[];
  keyOf: (i: I, n: number) => string;
  render: (i: I) => React.ReactElement;
}) {
  return (
    <View>
      <Text style={styles.heading}>{title}</Text>
      <FlatList
        horizontal
        data={items}
        keyExtractor={keyOf}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.shelf}
        keyboardShouldPersistTaps="handled"
        renderItem={({item}) => render(item)}
      />
    </View>
  );
}

function Cover({
  image,
  title,
  sub,
  onPress,
}: {
  image?: string;
  title: string;
  sub: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.7}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${sub}`}>
      {image ? (
        <Image source={{uri: upgradeArtwork(image)}} style={styles.cardArt} />
      ) : (
        <View style={[styles.cardArt, styles.artEmpty]} />
      )}
      <Text style={styles.cardTitle} numberOfLines={2}>
        {title}
      </Text>
      <Text style={styles.cardSub} numberOfLines={1}>
        {sub}
      </Text>
    </TouchableOpacity>
  );
}

export function AlbumShelf({
  albums,
  onOpen,
}: {
  albums: AlbumCard[];
  onOpen: (a: AlbumCard) => void;
}) {
  return (
    <Shelf
      title="Albums"
      items={albums}
      keyOf={(a, n) => `${a.album_id}#${n}`}
      render={a => (
        <Cover
          image={a.image}
          title={releaseTitle(a.name)}
          sub={[albumKind(a), a.artist].filter(Boolean).join(' · ')}
          onPress={() => onOpen(a)}
        />
      )}
    />
  );
}

export function PlaylistShelf({
  playlists,
  onOpen,
}: {
  playlists: HomeItem[];
  onOpen: (p: HomeItem) => void;
}) {
  return (
    <Shelf
      title="Playlists"
      items={playlists}
      keyOf={(p, n) => `${p.perma_url}#${n}`}
      render={p => (
        <Cover
          image={p.image}
          title={p.name || p.title || ''}
          sub={p.subtitle || 'Playlist'}
          onPress={() => onOpen(p)}
        />
      )}
    />
  );
}

/** While a search runs: the Top result's card and song rows, still empty. */
export function SearchSkeleton() {
  return (
    <View style={styles.skeleton}>
      <SkeletonBar width={110} height={16} style={styles.skHeading} />
      <View style={[styles.top, styles.skTop]}>
        <SkeletonBar width={92} height={92} style={styles.skArt} />
        <SkeletonBar width="60%" height={20} style={styles.skTitle} />
        <SkeletonBar width="35%" height={12} />
      </View>
      <SkeletonBar width={70} height={16} style={styles.skHeading} />
      <SkeletonRows count={5} />
    </View>
  );
}

const CARD = 132;

const styles = StyleSheet.create({
  heading: {
    color: C.text,
    fontSize: fs(18),
    lineHeight: fs(24),
    fontWeight: '700',
    letterSpacing: -0.3,
    paddingHorizontal: S.gutter,
    paddingTop: 12,
    paddingBottom: 10,
  },
  topWrap: {paddingBottom: 6},
  // Spotify's Top result: one raised card, a big cover, the name large.
  top: {
    marginHorizontal: S.gutter,
    padding: 16,
    borderRadius: 10,
    backgroundColor: C.surface,
  },
  topArt: {
    width: 92,
    height: 92,
    borderRadius: 6,
    backgroundColor: C.surfaceHi,
  },
  round: {borderRadius: 46},
  topTitle: {
    color: C.text,
    fontSize: fs(24),
    lineHeight: fs(30),
    fontWeight: '800',
    letterSpacing: -0.6,
    marginTop: 14,
    paddingRight: 56,
  },
  topSub: {...T.listSub, color: C.sub, marginTop: 4, paddingRight: 56},
  topPlay: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 2,
  },
  artEmpty: {
    backgroundColor: C.surfaceHi,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initial: {color: C.faint, fontSize: 30, fontWeight: '700'},
  shelf: {paddingHorizontal: S.gutter, gap: S.gap, paddingBottom: 6},
  card: {width: CARD},
  cardArt: {
    width: CARD,
    height: CARD,
    borderRadius: 6,
    backgroundColor: C.surface,
  },
  cardTitle: {...T.cardTitle, color: C.text, marginTop: 8},
  cardSub: {...T.cardSub, color: C.sub, marginTop: 2},
  skeleton: {paddingTop: 2},
  skHeading: {marginHorizontal: S.gutter, marginTop: 16, marginBottom: 14},
  skTop: {backgroundColor: 'transparent', paddingHorizontal: 0},
  skArt: {borderRadius: 6, marginBottom: 16},
  skTitle: {marginBottom: 10},
});
