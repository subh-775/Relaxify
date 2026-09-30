/**
 * Import a public Spotify playlist or album.
 *
 * Spotify is NOT a playback source. We read its tracklist and re-find each song
 * across JioSaavn / SoundCloud / YouTube, so what comes out is ordinary
 * playable tracks — and saving it creates an ordinary playlist, editable
 * afterwards exactly like one you made yourself. There is only one kind of
 * playlist in this app.
 */
import React, {useEffect} from 'react';
import {
  FlatList,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {Check, ChevronLeft, Play} from '../icons';
import {C, S, T} from '../theme';
import type {Track} from '../backend';
import {cleanText, getTrackId, normalizeTracks} from '../tracks';
import {
  cancelImport,
  importSourceName,
  startImport,
  useSpotifyImport,
} from '../spotifyImport';
import {TrackRow} from '../components/TrackRow';
import {BOTTOM_INSET} from '../layout';

export function SpotifyImportScreen({
  url,
  onClose,
  onPlay,
}: {
  url: string;
  onClose: () => void;
  onPlay: (track: Track, context: Track[]) => void;
}) {
  const data = useSpotifyImport();

  useEffect(() => {
    if (url) {
      startImport(url);
    }
  }, [url]);

  // The store can briefly hold the previous url's snapshot for one frame after
  // the url changes; treat a mismatch as "still loading this one".
  const active = data.url === url ? data : null;
  const loading = !active || (!active.finished && !active.error);
  const tracks = normalizeTracks(active?.tracks ?? []);
  const missing = active?.missing ?? [];
  const pct =
    active && active.total > 0
      ? Math.round((active.done / active.total) * 100)
      : 0;
  // Newest check first, so the list grows at the top where the eye is.
  const checked = [...(active?.checked ?? [])].reverse();

  return (
    <View style={styles.wrap}>
      <View style={styles.bar}>
        <TouchableOpacity onPress={onClose} hitSlop={12} style={styles.barBtn}>
          <ChevronLeft size={28} color={C.text} />
        </TouchableOpacity>
      </View>

      <View style={styles.header}>
        {/* The cover only appears once we have one — an empty grey square while
            loading reads as a broken image. */}
        {!!active?.image && (
          <Image source={{uri: active.image}} style={styles.cover} />
        )}
        <Text style={styles.name} numberOfLines={2}>
          {loading
            ? cleanText(active?.name) || `Importing from ${importSourceName(url)}…`
            : cleanText(active?.name) || `${importSourceName(url)} playlist`}
        </Text>
        {!loading && !active?.error && (
          <Text style={styles.sub}>
            {active?.matched} of {active?.total} songs found
          </Text>
        )}
      </View>

      {loading && (
        <View style={styles.loadingTop}>
          <View style={styles.barTrack}>
            <View
              style={[
                styles.barFill,
                {width: `${active && active.total > 0 ? pct : 8}%`},
              ]}
            />
          </View>
          <Text style={styles.progress}>
            {active && active.done > 0
              ? `${active.done} of ${active.total} songs`
              : active && active.total > 0
              ? `Looking for ${active.total} songs…`
              : 'Reading the playlist…'}
          </Text>
          <Text style={styles.hint}>
            {active?.stalled
              ? 'This is taking longer than usual. You can keep waiting, or cancel and keep what was found so far.'
              : 'Keep browsing: this carries on in the background, and the playlist is saved to Your Library when it finishes.'}
          </Text>
          <TouchableOpacity
            style={styles.cancel}
            onPress={() => {
              // What was found so far waits on Home's card: save or discard.
              cancelImport().catch(() => {});
              onClose();
            }}
            accessibilityRole="button">
            <Text style={styles.cancelText}>Cancel import</Text>
          </TouchableOpacity>
        </View>
      )}
      {loading && (
        <FlatList
          data={checked}
          keyExtractor={(c, i) => `${c.title}|${c.artist}|${i}`}
          style={styles.checked}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          renderItem={({item}) => (
            <View style={styles.checkRow}>
              {item.artwork_url ? (
                <Image source={{uri: item.artwork_url}} style={styles.checkArt} />
              ) : (
                <View style={[styles.checkArt, styles.checkArtEmpty]} />
              )}
              <View style={styles.checkText}>
                <Text style={styles.checkTitle} numberOfLines={1}>
                  {cleanText(item.title)}
                </Text>
                <Text style={styles.checkSub} numberOfLines={1}>
                  {cleanText(item.artist)}
                </Text>
              </View>
              <Text style={item.found ? styles.found : styles.notFound}>
                {item.found ? 'Found' : 'Not found'}
              </Text>
            </View>
          )}
        />
      )}

      {!loading && !!active?.error && (
        <View style={styles.center}>
          <Text style={styles.error}>{active.error}</Text>
          <Text style={styles.hint}>
            The playlist has to be public for this to work.
          </Text>
        </View>
      )}

      {!loading && !active?.error && (
        <>
          <View style={styles.actions}>
            {/* Saved by itself when the import finished (spotifyImport). */}
            <View style={[styles.saveBtn, styles.saveBtnDone]}>
              <Check size={17} color={C.text} />
              <Text style={styles.saveText}>
                {tracks.length ? 'Saved to Your Library' : 'Nothing to save'}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => tracks.length && onPlay(tracks[0], tracks)}
              disabled={!tracks.length}
              activeOpacity={0.85}
              style={styles.playBtn}>
              <Play size={26} color={C.bg} fill={C.bg} />
            </TouchableOpacity>
          </View>

          <FlatList
            data={tracks}
            keyExtractor={t => getTrackId(t)}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            renderItem={({item}) => (
              <TrackRow track={item} onPress={() => onPlay(item, tracks)} />
            )}
            ListFooterComponent={
              // Be explicit about what didn't come across, rather than quietly
              // shipping a shorter playlist than expected.
              missing.length ? (
                <View style={styles.missing}>
                  <Text style={styles.missingTitle}>
                    Not found ({missing.length})
                  </Text>
                  {missing.map(m => (
                    <Text key={m} style={styles.missingRow} numberOfLines={1}>
                      {m}
                    </Text>
                  ))}
                </View>
              ) : null
            }
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  cancel: {
    alignSelf: 'flex-start',
    marginTop: 12,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.3)',
    paddingHorizontal: 16,
    paddingVertical: 7,
  },
  cancelText: {color: C.text, fontSize: 13.5, fontWeight: '800'},
  checked: {flex: 1, marginTop: 12},
  loadingTop: {alignItems: 'center', paddingHorizontal: 40, paddingTop: 12},
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: S.gutter,
    paddingVertical: 7,
  },
  checkArt: {width: 40, height: 40, borderRadius: 6},
  checkArtEmpty: {backgroundColor: C.surfaceHi},
  checkText: {flex: 1, minWidth: 0},
  checkTitle: {color: C.text, fontSize: 14, fontWeight: '700'},
  checkSub: {color: C.sub, fontSize: 12, marginTop: 1},
  found: {color: '#1ed760', fontSize: 11.5, fontWeight: '800'},
  notFound: {color: C.danger, fontSize: 11.5, fontWeight: '800'},
  wrap: {flex: 1, backgroundColor: C.bg},
  bar: {flexDirection: 'row', paddingTop: 12, paddingHorizontal: 8},
  barBtn: {padding: 4},
  header: {
    alignItems: 'center',
    paddingHorizontal: S.gutter,
    paddingBottom: 18,
  },
  cover: {width: 144, height: 144, borderRadius: 6, backgroundColor: C.surface},
  name: {
    ...T.screenTitle,
    fontSize: 20,
    color: C.text,
    marginTop: 16,
    textAlign: 'center',
  },
  sub: {...T.sub, color: C.sub, marginTop: 5},
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  barTrack: {
    width: '100%',
    maxWidth: 260,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.10)',
    overflow: 'hidden',
  },
  barFill: {height: '100%', borderRadius: 3, backgroundColor: C.accent},
  progress: {
    ...T.body,
    color: C.text,
    marginTop: 12,
    fontVariant: ['tabular-nums'],
  },
  hint: {
    ...T.sub,
    color: C.faint,
    textAlign: 'center',
    marginTop: 10,
    lineHeight: 18,
  },
  error: {color: C.danger, fontSize: 13.5, textAlign: 'center'},
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: S.gutter,
    paddingBottom: 12,
  },
  saveBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 11,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  saveBtnDone: {opacity: 0.6},
  saveText: {...T.body, color: C.text},
  playBtn: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // The bars at the foot of the app float OVER the page now, so a list has to
  // end above them or its last row is permanently behind one. See src/layout.ts.
  list: {paddingBottom: BOTTOM_INSET},
  missing: {paddingHorizontal: S.gutter, paddingTop: 18},
  missingTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: C.sub,
    paddingVertical: 6,
  },
  missingRow: {...T.sub, color: C.faint, paddingVertical: 3},
});
