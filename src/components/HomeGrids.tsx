/**
 * The two grids at the top of Home, one swiped row with dots under it:
 * Discover first, then Recents. Each is a three-by-three grid of covers, the
 * "speed dial" layout YouTube Music uses.
 *
 * Discover (src/discover.ts) is nine songs picked for this listener, new on
 * every open: mostly ones they have not heard, similar to their own, with two
 * or three of their most-played among them. It leads because it is the part
 * of Home worth stopping for. Before there is any history to start from it
 * shows the trending songs instead.
 *
 * Recents: the last nine songs you played. Once there are more songs than
 * fit, the ninth tile is three dots on a diagonal in the mark's colours, and
 * opens the last 20 (all recentlyPlayed keeps) in a sheet.
 *
 * A tap on either plays that song alone and lets autoplay find similar ones,
 * as a search result does: neither grid is a playlist. The sheet's "Play all"
 * is the one way to queue the recents. The song playing now wears a ring in
 * the greeting's colour and a little equalizer that dances while it plays and
 * lies flat when paused, so the grid also answers "what is on, and is it
 * playing" at a glance.
 *
 * Each tile's title sits on a soft fade rather than a solid bar, so a cover
 * keeps its whole picture and the name stays readable over a light one. Each
 * grid sits in a thin frame so it reads as one block on Home.
 */
import React, {useMemo, useState} from 'react';
import {
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import Svg, {Circle, Defs, LinearGradient, Rect, Stop} from 'react-native-svg';
import Animated, {
  useAnimatedScrollHandler,
  useSharedValue,
} from 'react-native-reanimated';
import {C, S, T} from '../theme';
import {cleanText, getBestArtworkUrl, getTrackId} from '../tracks';
import {useIsActiveTrack, useIsPlaying} from '../player';
import {useAccent} from '../accent';
import {EqBars} from './EqBars';
import {Sheet} from './Sheet';
import {TrackRow} from './TrackRow';
import {Sparkles} from '../icons';
import type {Track} from '../backend';

const COLUMNS = 3;
const MAX_TILES = 9;
const GAP = 8;
/** The frame: its hairline and the room inside it. */
const FRAME = 1;
const PAD = 8;

/** Three per row inside the frame, whatever the screen width. */
function tileSize(width: number) {
  return Math.floor(
    (width - 2 * (S.gutter + FRAME + PAD) - (COLUMNS - 1) * GAP) / COLUMNS,
  );
}

export function HomeGrids({
  discover,
  recent,
  onPlay,
}: {
  discover: Track[];
  recent: Track[];
  onPlay: (track: Track, context?: Track[]) => void;
}) {
  const {width} = useWindowDimensions();
  const [page, setPage] = useState(0);
  const size = tileSize(width);
  const pages = [
    discover.length ? 'discover' : null,
    recent.length ? 'recents' : null,
  ].filter((p): p is string => !!p);
  if (!pages.length) {
    return null;
  }

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const p = Math.round(e.nativeEvent.contentOffset.x / width);
    if (p !== page) {
      setPage(p);
    }
  };
  const render = (k: string) =>
    k === 'discover' ? (
      <DiscoverPage key={k} songs={discover} size={size} onPlay={onPlay} />
    ) : (
      <RecentsPage key={k} recent={recent} size={size} onPlay={onPlay} />
    );

  if (pages.length === 1) {
    return <View style={styles.section}>{render(pages[0])}</View>;
  }
  // One page per screen width: each page carries its own gutters, so a page
  // at rest lines up with everything above and below it.
  return (
    <View style={styles.section}>
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={32}
        overScrollMode="never"
        contentContainerStyle={styles.pager}>
        {pages.map(k => (
          <View key={k} style={{width}}>
            {render(k)}
          </View>
        ))}
      </ScrollView>
      <View
        style={styles.dots}
        accessibilityLabel={`${page === 0 ? 'Discover' : 'Recents'}, ${
          page + 1
        } of ${pages.length}`}>
        {pages.map((k, i) => (
          <View
            key={k}
            style={[
              styles.dot,
              i === Math.min(page, pages.length - 1) && styles.dotOn,
            ]}
          />
        ))}
      </View>
    </View>
  );
}

/** Nine picked for you: no "more" tile, the grid is the whole of it. */
function DiscoverPage({
  songs,
  size,
  onPlay,
}: {
  songs: Track[];
  size: number;
  onPlay: (track: Track, context?: Track[]) => void;
}) {
  const [lead] = useAccent();
  return (
    <>
      <View style={styles.head}>
        <Text style={styles.title}>Discover</Text>
        <Sparkles size={17} color={lead} strokeWidth={2.2} />
      </View>
      <View style={styles.frame}>
        {songs.slice(0, MAX_TILES).map(t => (
          <Tile
            key={getTrackId(t)}
            track={t}
            size={size}
            onPress={() => onPlay(t)}
          />
        ))}
      </View>
    </>
  );
}

function RecentsPage({
  recent,
  size,
  onPlay,
}: {
  recent: Track[];
  size: number;
  onPlay: (track: Track, context?: Track[]) => void;
}) {
  const [open, setOpen] = useState(false);
  // More than fit: eight covers and the way to the rest.
  const more = recent.length > MAX_TILES;
  const tiles = useMemo(
    () => recent.slice(0, more ? MAX_TILES - 1 : MAX_TILES),
    [recent, more],
  );
  return (
    <>
      <View style={styles.head}>
        <Text style={styles.title}>Recents</Text>
      </View>
      <View style={styles.frame}>
        {tiles.map(t => (
          <Tile
            key={getTrackId(t)}
            track={t}
            size={size}
            onPress={() => onPlay(t)}
          />
        ))}
        {more && <MoreTile size={size} onPress={() => setOpen(true)} />}
      </View>
      {more && (
        <LastSongs
          open={open}
          recent={recent}
          onClose={() => setOpen(false)}
          onPlay={(t: Track, all?: Track[]) => {
            setOpen(false);
            onPlay(t, all);
          }}
        />
      )}
    </>
  );
}

/** Three dots on a diagonal, coral to berry: the rest of your recents. */
function MoreTile({size, onPress}: {size: number; onPress: () => void}) {
  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onPress}
      style={[styles.tile, styles.more, {width: size, height: size}]}
      accessibilityRole="button"
      accessibilityLabel="Show the last 20 songs">
      <Svg width={size * 0.44} height={size * 0.44} viewBox="0 0 40 40">
        <Circle cx={9} cy={9} r={5.5} fill="#FFB38A" />
        <Circle cx={20} cy={20} r={5.5} fill="#FF5A6E" />
        <Circle cx={31} cy={31} r={5.5} fill="#C2185B" />
      </Svg>
    </TouchableOpacity>
  );
}

function LastSongs({
  open,
  recent,
  onClose,
  onPlay,
}: {
  open: boolean;
  recent: Track[];
  onClose: () => void;
  onPlay: (t: Track, all?: Track[]) => void;
}) {
  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler(e => {
    scrollY.value = e.contentOffset.y;
  });
  return (
    <Sheet open={open} onClose={onClose} scrollY={scrollY}>
      <View style={styles.sheetHead}>
        <Text style={styles.sheetTitle}>{`Your last ${recent.length}s`}</Text>
        <TouchableOpacity
          style={styles.playAll}
          activeOpacity={0.8}
          onPress={() => onPlay(recent[0], recent)}
          accessibilityRole="button">
          <Text style={styles.playAllText}>Play all</Text>
        </TouchableOpacity>
      </View>
      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}>
        {recent.map(t => (
          <TrackRow
            key={getTrackId(t)}
            track={t}
            onPress={() => onPlay(t)}
            showActions={false}
          />
        ))}
      </Animated.ScrollView>
    </Sheet>
  );
}

const Tile = React.memo(function Tile({
  track,
  size,
  onPress,
}: {
  track: Track;
  size: number;
  onPress: () => void;
}) {
  const playing = useIsActiveTrack(track);
  const art = getBestArtworkUrl(track);
  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onPress}
      style={[styles.tile, {width: size, height: size}]}
      accessibilityRole="button"
      accessibilityLabel={`Play ${cleanText(track.title)}`}>
      {art ? (
        <Image source={{uri: art}} style={styles.fill} />
      ) : (
        <View style={[styles.fill, styles.fallback]} />
      )}
      <Svg style={styles.fade} pointerEvents="none">
        <Defs>
          <LinearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#000" stopOpacity={0} />
            <Stop offset="1" stopColor="#000" stopOpacity={0.78} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#fade)" />
      </Svg>
      <Text style={styles.name} numberOfLines={1}>
        {cleanText(track.title)}
      </Text>
      {playing && <NowPlaying />}
    </TouchableOpacity>
  );
});

/** The ring and the bars. Its own component, so only the playing tile
 *  follows the play state. */
function NowPlaying() {
  const [lead, second] = useAccent();
  const on = useIsPlaying();
  return (
    <>
      <View
        style={[styles.playing, {borderColor: lead}]}
        pointerEvents="none"
      />
      <View style={styles.eq} pointerEvents="none">
        <EqBars colors={[lead, second, lead]} active={on} height={13} />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  section: {marginTop: 6},
  // Top-aligned: a Recents page with fewer than nine songs is shorter than
  // Discover, and should not float in the middle of the row.
  pager: {alignItems: 'flex-start'},
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: S.gutter,
    marginBottom: 10,
  },
  title: {...T.rowTitle, color: C.text},
  // The cards carousel's dots, so the two swiped rows on Home read alike.
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 5,
    marginTop: 10,
  },
  dot: {width: 6, height: 6, borderRadius: 3, backgroundColor: '#3a3a40'},
  dotOn: {width: 18, backgroundColor: C.text},
  frame: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GAP,
    marginHorizontal: S.gutter,
    padding: PAD,
    borderWidth: FRAME,
    borderColor: 'rgba(255,255,255,0.14)',
    borderRadius: 16,
  },
  more: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.surfaceHi,
  },
  sheetHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: S.gutter,
    paddingTop: 6,
    paddingBottom: 8,
  },
  sheetTitle: {...T.rowTitle, color: C.text},
  playAll: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: C.text,
  },
  playAllText: {color: C.bg, fontSize: 13, fontWeight: '800'},
  tile: {
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: C.surface,
  },
  fill: {...StyleSheet.absoluteFillObject},
  fallback: {backgroundColor: C.surfaceHi},
  // The lower half: where the name sits.
  fade: {position: 'absolute', left: 0, right: 0, bottom: 0, height: '55%'},
  name: {
    position: 'absolute',
    left: 8,
    right: 8,
    bottom: 7,
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  playing: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 8,
    borderWidth: 3,
  },
  eq: {
    position: 'absolute',
    top: 7,
    right: 7,
    paddingHorizontal: 4,
    paddingVertical: 3,
    borderRadius: 5,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
});
