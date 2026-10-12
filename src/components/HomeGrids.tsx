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
 * is the one way to queue the recents. The song playing now wears a plain
 * grey ring: no colour of its own and no moving bars, so the grid stays a
 * calm speed dial and still shows which one is on.
 *
 * Each tile's title sits on a soft fade rather than a solid bar, so a cover
 * keeps its whole picture and the name stays readable over a light one. Each
 * grid sits in a thin frame so it reads as one block on Home.
 */
import React, {useMemo, useState} from 'react';
import {
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import Svg, {Circle, Defs, LinearGradient, Rect, Stop} from 'react-native-svg';
import Animated, {
  Extrapolation,
  interpolate,
  interpolateColor,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import {C, S, T} from '../theme';
import {cleanText, getBestArtworkUrl, getTrackId} from '../tracks';
import {useIsActiveTrack} from '../player';
import {Sheet} from './Sheet';
import {TrackRow} from './TrackRow';
import type {Track} from '../backend';

const COLUMNS = 3;
const MAX_TILES = 9;
const GAP = 8;
/** The frame: its hairline and the room inside it. */
const FRAME = 1;
const PAD = 8;
/** A resting dot, the cards carousel's. */
const DOT = '#3a3a40';

/** Three per row inside the frame, whatever the screen width. */
function tileSize(width: number) {
  return Math.floor(
    (width - 2 * (S.gutter + FRAME + PAD) - (COLUMNS - 1) * GAP) / COLUMNS,
  );
}

type Page = 'discover' | 'recents';
const TITLES: Record<Page, string> = {discover: 'Discover', recents: 'Recents'};

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
  const size = tileSize(width);
  // How far the pager has scrolled, on the UI thread: the title and the dots
  // follow the finger frame by frame instead of switching when a page lands.
  const x = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler(e => {
    x.value = e.contentOffset.x;
  });
  const pages = [
    discover.length ? 'discover' : null,
    recent.length ? 'recents' : null,
  ].filter((p): p is Page => !!p);
  if (!pages.length) {
    return null;
  }

  const render = (k: Page) =>
    k === 'discover' ? (
      <DiscoverPage key={k} songs={discover} size={size} onPlay={onPlay} />
    ) : (
      <RecentsPage key={k} recent={recent} size={size} onPlay={onPlay} />
    );

  if (pages.length === 1) {
    return (
      <View style={styles.section}>
        <View style={styles.head}>
          <Text style={styles.title}>{TITLES[pages[0]]}</Text>
        </View>
        {render(pages[0])}
      </View>
    );
  }
  // One page per screen width: each page carries its own gutters, so a page
  // at rest lines up with everything above and below it. The title is not in
  // the pages: it stays where it is and cross-fades as the grids slide.
  return (
    <View style={styles.section}>
      <View
        style={styles.head}
        accessibilityLabel="Discover and Recents. Swipe the grid to switch.">
        {pages.map((k, i) => (
          <SlideTitle key={k} x={x} index={i} width={width}>
            {TITLES[k]}
          </SlideTitle>
        ))}
      </View>
      <Animated.ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        overScrollMode="never"
        contentContainerStyle={styles.pager}>
        {pages.map(k => (
          <View key={k} style={{width}}>
            {render(k)}
          </View>
        ))}
      </Animated.ScrollView>
      <View style={styles.dots}>
        {pages.map((k, i) => (
          <SlideDot key={k} x={x} index={i} width={width} />
        ))}
      </View>
    </View>
  );
}

/**
 * One page's title. Fully shown at its own page, gone halfway to the next,
 * drifting a little the way the grid goes, so the swap reads as one motion
 * with the tiles rather than a cut. Stacked: every title sits in the same
 * place, and only the one the pager is on shows.
 */
function SlideTitle({
  x,
  index,
  width,
  children,
}: {
  x: SharedValue<number>;
  index: number;
  width: number;
  children: string;
}) {
  const style = useAnimatedStyle(() => {
    const at = index * width;
    const range = [at - width, at - width / 2, at, at + width / 2, at + width];
    return {
      opacity: interpolate(
        x.value,
        range,
        [0, 0, 1, 0, 0],
        Extrapolation.CLAMP,
      ),
      transform: [
        {
          translateX: interpolate(
            x.value,
            [at - width, at, at + width],
            [24, 0, -24],
            Extrapolation.CLAMP,
          ),
        },
      ],
    };
  });
  return (
    <Animated.Text
      style={[styles.title, index > 0 && styles.stacked, style]}
      importantForAccessibility="no">
      {children}
    </Animated.Text>
  );
}

/** A dot that grows into the white pill as its page slides in. */
function SlideDot({
  x,
  index,
  width,
}: {
  x: SharedValue<number>;
  index: number;
  width: number;
}) {
  const style = useAnimatedStyle(() => {
    const at = index * width;
    const on = interpolate(
      x.value,
      [at - width, at, at + width],
      [0, 1, 0],
      Extrapolation.CLAMP,
    );
    return {
      width: 6 + 12 * on,
      backgroundColor: interpolateColor(on, [0, 1], [DOT, C.text]),
    };
  });
  return <Animated.View style={[styles.dot, style]} />;
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
  return (
    <>
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
      {playing && <View style={styles.playing} pointerEvents="none" />}
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  section: {marginTop: 6},
  // Top-aligned: a Recents page with fewer than nine songs is shorter than
  // Discover, and should not float in the middle of the row.
  pager: {alignItems: 'flex-start'},
  head: {paddingHorizontal: S.gutter, marginBottom: 10},
  title: {...T.rowTitle, color: C.text},
  // Every title after the first sits on top of it, in the same place.
  stacked: {position: 'absolute', left: S.gutter, top: 0},
  // The cards carousel's dots, so the two swiped rows on Home read alike.
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 5,
    marginTop: 10,
  },
  dot: {width: 6, height: 6, borderRadius: 3, backgroundColor: DOT},
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
  // The song playing now: a grey ring, the same on every greeting colour.
  playing: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.55)',
  },
});
