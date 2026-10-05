/**
 * An artist's profile: photo, monthly listeners, top songs, and albums.
 *
 * The backend assembles this from several services, so parts can be missing —
 * every section here renders only when it actually has content, rather than
 * showing an empty heading.
 */
import React, {useEffect, useState} from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedReaction,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import Svg, {Defs, LinearGradient, Rect, Stop} from 'react-native-svg';
import {ChevronLeft, Pause, Play} from '../icons';
import {C, S, T} from '../theme';
import {getArtist, type ArtistProfile, type Track} from '../backend';
import {normalizeTracks} from '../tracks';
import {TrackRow} from '../components/TrackRow';
import {useFollowedArtists} from '../artists';
import {State, togglePlay, useActiveTrack, usePlaybackState} from '../player';
import {BOTTOM_INSET} from '../layout';
import {useListEnd} from '../components/UpdateModal';
import {rememberArtistPhoto} from '../artistPhotos';
import {useArtworkColor} from '../artworkColor';

/** Profiles the session has already opened — going back to an artist you just
 *  visited must not spin a loader again. */
const profileCache = new Map<string, ArtistProfile>();

function compact(n?: number | null): string {
  if (!n || n <= 0) {
    return '';
  }
  if (n >= 1_000_000) {
    return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  }
  if (n >= 1_000) {
    return `${Math.round(n / 1000)}K`;
  }
  return String(n);
}

export function ArtistScreen({
  name,
  onClose,
  onPlay,
  onMenu,
  onOpenAlbum,
  onToggleFollow,
}: {
  name: string;
  onClose: () => void;
  onPlay: (track: Track, context: Track[]) => void;
  onMenu: (track: Track) => void;
  onOpenAlbum: (albumName: string, artistName: string) => void;
  onToggleFollow: (name: string, image?: string) => void;
}) {
  const cachedProfile = profileCache.get(name.toLowerCase()) ?? null;
  const [profile, setProfile] = useState<ArtistProfile | null>(cachedProfile);
  const [busy, setBusy] = useState(!cachedProfile);

  // Subscribed to the store, so tapping Follow flips the button IMMEDIATELY —
  // a prop computed once by the parent went stale until something else
  // re-rendered.
  const followed = useFollowedArtists();
  // Room for the update strip too, while it is up.
  const listEnd = useListEnd();
  const following = followed.some(
    a => a.name.toLowerCase() === (profile?.name || name).toLowerCase(),
  );

  useEffect(() => {
    if (profileCache.has(name.toLowerCase())) {
      return;
    }
    let alive = true;
    setBusy(true);
    getArtist(name)
      .then(p => {
        profileCache.set(name.toLowerCase(), p);
        // The Recap and "Your artists" show this face from now on.
        rememberArtistPhoto(name, p.image);
        if (alive) {
          setProfile(p);
        }
      })
      .catch(() => alive && setProfile(null))
      .finally(() => alive && setBusy(false));
    return () => {
      alive = false;
    };
  }, [name]);

  const songs = normalizeTracks(profile?.top_songs ?? []);
  const albums = profile?.albums ?? [];
  const listeners = compact(profile?.listeners ?? profile?.followers);

  // The play button mirrors reality: pause icon while one of this artist's top
  // songs is what's playing, and tapping it pauses/resumes instead of
  // restarting from the top.
  const activeEngine = useActiveTrack();
  const {state: playState} = usePlaybackState() as {state?: State};
  const playingHere = (() => {
    if (!activeEngine) {
      return false;
    }
    const at = String(activeEngine.title ?? '').toLowerCase();
    const aa = String(activeEngine.artist ?? '').toLowerCase();
    return songs.some(
      t =>
        (t.title || '').toLowerCase() === at &&
        (t.artist || '').toLowerCase() === aa,
    );
  })();
  const isPlaying =
    playState === State.Playing ||
    playState === State.Buffering ||
    playState === State.Loading;

  const [allSongs, setAllSongs] = useState(false);
  const {width} = useWindowDimensions();
  const hero = Math.round(Math.min(430, width * 1.2));
  // The photo's own colour, muted into a dark surface (as the mini player is).
  const tint = useArtworkColor(profile?.image) ?? C.surfaceHi;

  // Scroll effects run on the UI thread: the photo drifts at half speed, and
  // the slim header fades in as the name scrolls under it. Android has no
  // overscroll bounce, so the poster does not stretch on a pull.
  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler(e => {
    scrollY.value = e.contentOffset.y;
  });
  const photoStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: interpolate(
          scrollY.value,
          [0, hero],
          [0, hero / 2],
          Extrapolation.CLAMP,
        ),
      },
    ],
  }));
  const slimAt = hero - 110;
  const slimStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      scrollY.value,
      [slimAt - 40, slimAt],
      [0, 1],
      Extrapolation.CLAMP,
    ),
    transform: [
      {
        translateY: interpolate(
          scrollY.value,
          [slimAt - 40, slimAt],
          [-8, 0],
          Extrapolation.CLAMP,
        ),
      },
    ],
  }));
  // Touchable only while visible; flips once per crossing, not per frame.
  const [slim, setSlim] = useState(false);
  useAnimatedReaction(
    () => scrollY.value > slimAt - 20,
    (now, before) => {
      if (now !== before) {
        runOnJS(setSlim)(now);
      }
    },
    [slimAt],
  );

  const shown = songs.slice(0, allSongs ? 10 : 5);
  const title = profile?.name || name;
  const onPlayPress = () =>
    playingHere ? togglePlay().catch(() => {}) : onPlay(songs[0], songs);
  const playIcon = (size: number) =>
    playingHere && isPlaying ? (
      <Pause size={size} color={C.bg} fill={C.bg} />
    ) : (
      <Play size={size} color={C.bg} fill={C.bg} style={styles.playNudge} />
    );

  return (
    <View style={styles.wrap}>
      {busy ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={C.accent} />
        </View>
      ) : (
        <Animated.ScrollView
          onScroll={onScroll}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.body, listEnd]}>
          {/* The poster: the photo edge to edge, fading through its own
              colour into the page, with the name set over its foot. */}
          <View style={{height: hero}}>
            {profile?.image ? (
              <Animated.Image
                source={{uri: profile.image}}
                style={[styles.photo, {height: hero}, photoStyle]}
              />
            ) : (
              <View style={[styles.photo, styles.noPhoto, {height: hero}]}>
                <Text style={styles.initial}>
                  {title.trim().charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
            <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
              <Defs>
                <LinearGradient id="poster" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor="#000" stopOpacity={0.35} />
                  <Stop offset="0.22" stopColor="#000" stopOpacity={0} />
                  <Stop offset="0.42" stopColor={tint} stopOpacity={0} />
                  <Stop offset="0.72" stopColor={tint} stopOpacity={0.7} />
                  <Stop offset="1" stopColor={C.bg} stopOpacity={1} />
                </LinearGradient>
              </Defs>
              <Rect width="100%" height="100%" fill="url(#poster)" />
            </Svg>
            <View style={styles.nameBox} pointerEvents="none">
              <Text
                style={styles.name}
                numberOfLines={2}
                adjustsFontSizeToFit
                minimumFontScale={0.55}>
                {posterLines(title)}
              </Text>
              {!!listeners && (
                <Text style={styles.listeners}>{listeners} listeners</Text>
              )}
            </View>
          </View>

          {/* Follow and Play sit on the seam between photo and page. */}
          <View style={styles.seam}>
            <TouchableOpacity
              onPress={() => onToggleFollow(title, profile?.image)}
              activeOpacity={0.7}
              style={[styles.follow, following && styles.followOn]}>
              <Text style={[styles.followText, following && styles.followTextOn]}>
                {following ? 'Following' : 'Follow'}
              </Text>
            </TouchableOpacity>
            <View style={styles.fill} />
            {songs.length > 0 && (
              <TouchableOpacity
                style={styles.playBtn}
                activeOpacity={0.85}
                onPress={onPlayPress}>
                {playIcon(28)}
              </TouchableOpacity>
            )}
          </View>

          {songs.length > 0 && (
            <>
              <Text style={styles.section}>Popular</Text>
              {/* Numbered: JioSaavn lists them by popularity. */}
              {shown.map((t, i) => (
                <TrackRow
                  key={`${t.title}-${i}`}
                  track={t}
                  rank={i + 1}
                  showDuration={false}
                  onPress={() => onPlay(t, songs)}
                  onMenu={() => onMenu(t)}
                />
              ))}
              {songs.length > 5 && (
                <TouchableOpacity
                  style={styles.more}
                  activeOpacity={0.7}
                  onPress={() => setAllSongs(v => !v)}>
                  <Text style={styles.moreText}>
                    {allSongs
                      ? 'Show fewer'
                      : `See all ${Math.min(10, songs.length)}`}
                  </Text>
                </TouchableOpacity>
              )}
            </>
          )}

          {albums.length > 0 && (
            <>
              <Text style={styles.section}>Albums</Text>
              <FlatList
                horizontal
                data={albums}
                keyExtractor={a => a.name}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.albums}
                renderItem={({item}) => (
                  <TouchableOpacity
                    style={styles.album}
                    activeOpacity={0.75}
                    onPress={() => onOpenAlbum(item.name, title)}>
                    {item.image ? (
                      <Image
                        source={{uri: item.image}}
                        style={styles.albumArt}
                      />
                    ) : (
                      <View style={[styles.albumArt, styles.artEmpty]} />
                    )}
                    <Text style={styles.albumName} numberOfLines={2}>
                      {item.name}
                    </Text>
                    {!!item.year && (
                      <Text style={styles.albumYear}>{item.year}</Text>
                    )}
                  </TouchableOpacity>
                )}
              />
            </>
          )}

          {!!profile?.bio && (
            <>
              <Text style={styles.section}>About</Text>
              <Text style={styles.bio}>{profile.bio}</Text>
            </>
          )}

          {!songs.length && !albums.length && !profile?.bio && (
            <Text style={styles.empty}>
              Not much is known about this artist yet.
            </Text>
          )}
        </Animated.ScrollView>
      )}

      {/* Once the name has scrolled away: the name and Play, on the
          photo's colour, so Play is never more than a tap away. */}
      <Animated.View
        style={[styles.slim, {backgroundColor: tint}, slimStyle]}
        pointerEvents={slim ? 'auto' : 'none'}>
        <Text style={styles.slimName} numberOfLines={1}>
          {title}
        </Text>
        {songs.length > 0 && (
          <TouchableOpacity
            style={[styles.playBtn, styles.playSmall]}
            activeOpacity={0.85}
            onPress={onPlayPress}>
            {playIcon(20)}
          </TouchableOpacity>
        )}
      </Animated.View>

      <TouchableOpacity onPress={onClose} hitSlop={12} style={styles.back}>
        <ChevronLeft size={26} color={C.text} />
      </TouchableOpacity>
    </View>
  );
}

/** "Aditya Rikhari" -> "Aditya" over "Rikhari": a poster sets a name one word
 *  to a line. Initials ("A. R. Rahman") and one-word names stay on one line. */
export function posterLines(name: string): string {
  const words = name.trim().split(/\s+/);
  return words.length > 1 && words[0].length > 2
    ? `${words[0]}\n${words.slice(1).join(' ')}`
    : name.trim();
}

const styles = StyleSheet.create({
  wrap: {flex: 1, backgroundColor: C.bg},
  fill: {flex: 1},
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: BOTTOM_INSET,
  },
  // The bars at the foot of the app float OVER the page now, so a list has to
  // end above them or its last row is permanently behind one. See src/layout.ts.
  body: {paddingBottom: BOTTOM_INSET},
  back: {
    position: 'absolute',
    top: 12,
    left: 10,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photo: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: C.surface,
  },
  noPhoto: {
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initial: {
    color: 'rgba(0,0,0,0.25)',
    fontSize: 160,
    fontWeight: '800',
  },
  nameBox: {
    position: 'absolute',
    left: S.gutter,
    right: S.gutter,
    bottom: 54,
  },
  name: {
    color: C.text,
    fontSize: 52,
    lineHeight: 50,
    fontWeight: '800',
    letterSpacing: -2.2,
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: {width: 0, height: 2},
    textShadowRadius: 18,
  },
  listeners: {
    ...T.sub,
    color: 'rgba(255,255,255,0.78)',
    fontWeight: '600',
    marginTop: 10,
  },
  seam: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: -32,
    paddingHorizontal: S.gutter,
  },
  follow: {
    paddingHorizontal: 20,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.45)',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  followOn: {backgroundColor: C.accent, borderColor: C.accent},
  followText: {...T.sub, color: C.text, fontWeight: '700'},
  followTextOn: {color: C.bg},
  playBtn: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
  },
  playSmall: {width: 40, height: 40, borderRadius: 20, elevation: 0},
  slim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 62,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingLeft: 58,
    paddingRight: 14,
  },
  slimName: {...T.rowTitle, color: C.text, flex: 1},
  more: {
    alignSelf: 'flex-start',
    marginHorizontal: S.gutter,
    marginTop: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#3a3a3a',
  },
  moreText: {...T.sub, color: C.text, fontWeight: '700'},
  artEmpty: {backgroundColor: C.surfaceHi},
  playNudge: {marginLeft: 3},
  section: {
    ...T.rowTitle,
    color: C.text,
    fontSize: 17,
    paddingHorizontal: S.gutter,
    paddingTop: 22,
    paddingBottom: 6,
  },
  albums: {paddingHorizontal: S.gutter, gap: 14},
  album: {width: 128},
  albumArt: {
    width: 128,
    height: 128,
    borderRadius: 6,
    backgroundColor: C.surface,
  },
  albumName: {...T.sub, color: C.text, marginTop: 7, fontWeight: '600'},
  albumYear: {...T.sub, color: C.faint, marginTop: 2, fontSize: 11.5},
  bio: {
    color: C.sub,
    fontSize: 13.5,
    lineHeight: 21,
    paddingHorizontal: S.gutter,
  },
  empty: {
    color: C.faint,
    textAlign: 'center',
    paddingVertical: 40,
    fontSize: 13,
  },
});
