/**
 * Recents: the last nine songs you played, as a three-by-three grid of covers
 * at the top of Home — the "speed dial" layout YouTube Music uses.
 *
 * A tap plays that song alone and lets autoplay find similar ones, as a
 * search result does: your recents are a history, not a playlist. The sheet's
 * "Play all" is the one way to queue them all. The song playing now wears a ring in the greeting's colour and a little
 * equalizer that dances while it plays and lies flat when paused, so the grid
 * also answers "what is on, and is it playing" at a glance.
 *
 * Each tile's title sits on a soft fade rather than a solid bar, so a cover
 * keeps its whole picture and the name stays readable over a light one.
 *
 * The grid sits in a thin frame so it reads as one block on Home. Once there
 * are more songs than fit, the ninth tile is three dots on a diagonal in the
 * mark's colours, and opens the last 20 (all recentlyPlayed keeps) in a sheet.
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
import type {Track} from '../backend';

const COLUMNS = 3;
const MAX_TILES = 9;
const GAP = 8;
/** The frame: its hairline and the room inside it. */
const FRAME = 1;
const PAD = 8;

export function RecentsGrid({
  recent,
  onPlay,
}: {
  recent: Track[];
  onPlay: (track: Track, context?: Track[]) => void;
}) {
  const {width} = useWindowDimensions();
  const [open, setOpen] = useState(false);
  // More than fit: eight covers and the way to the rest.
  const more = recent.length > MAX_TILES;
  const tiles = useMemo(
    () => recent.slice(0, more ? MAX_TILES - 1 : MAX_TILES),
    [recent, more],
  );
  if (!tiles.length) {
    return null;
  }
  // Three per row inside the frame, whatever the screen width.
  const size = Math.floor(
    (width - 2 * (S.gutter + FRAME + PAD) - (COLUMNS - 1) * GAP) / COLUMNS,
  );
  return (
    <View style={styles.section}>
      <Text style={styles.title}>Recents</Text>
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
    </View>
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
        <Text style={styles.sheetTitle}>{`Last ${recent.length} songs`}</Text>
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
  const playing = useIsActiveTrack(track.title, track.artist);
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
  title: {
    ...T.rowTitle,
    color: C.text,
    paddingHorizontal: S.gutter,
    marginBottom: 10,
  },
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
