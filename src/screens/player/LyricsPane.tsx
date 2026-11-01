/**
 * The Lyrics tab of the full player, and the fetch behind it.
 */
import React, {useEffect, useMemo, useRef, useState} from 'react';
import {ActivityIndicator, ScrollView, StyleSheet, Text, View} from 'react-native';
import {logEvent} from '../../analytics';
import {getLyrics, type Lyrics} from '../../backend';
import {seekTo, useProgress} from '../../player';
import {C} from '../../theme';

/**
 * How often the parked (closed) player polls progress.
 *
 * The player is no longer torn down when it closes — it is a view now, parked
 * off-screen — so its two progress subscriptions would otherwise poll the
 * engine forever, on every screen, for a sheet nobody can see. RNTP's
 * useProgress is a recursive setTimeout keyed on its interval, so handing it an
 * hour is how you stop it without unmounting it.
 */
export const PARKED_POLL = 3600000;

const LINE_H = 44;

/** Session-lifetime lyrics cache. Keyed on title|artist; capped so a long
 *  session can't hold hundreds of lyric sheets. Hits only: a miss is often a
 *  slow network or a source that was down, and remembering it hid the lyrics
 *  for the rest of the session. */
const lyricsCache = new Map<string, Lyrics>();

function trimCache(map: Map<string, unknown>, max = 40): void {
  while (map.size > max) {
    const oldest = map.keys().next().value;
    if (oldest === undefined) {
      break;
    }
    map.delete(oldest);
  }
}

export type LyricsState = {
  lyrics: Lyrics | null;
  busy: boolean;
  err: string;
  /** false once we KNOW there are none — what greys out the Lyrics tab. */
  available: boolean;
};

/**
 * Fetch the lyrics for a song, once.
 *
 * This lives above LyricsPane rather than inside it because the tab bar has to
 * know the answer BEFORE you press Lyrics: SoundCloud and YouTube uploads
 * frequently have none, and a tab that opens onto "No lyrics found" is worse
 * than a tab that says so up front. One owner, one request.
 */
export function useLyrics(
  title: string,
  artist: string,
  durationMs: number | undefined,
  enabled: boolean,
): LyricsState {
  const cacheKey = `${title}|${artist}`.toLowerCase();
  const cached = lyricsCache.get(cacheKey);
  const [lyrics, setLyrics] = useState<Lyrics | null>(cached ?? null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!enabled || !title) {
      return;
    }
    // Cached: paints instantly — switching Song → Queue → Lyrics must not
    // re-fetch what was on screen two taps ago.
    const hit = lyricsCache.get(cacheKey);
    if (hit) {
      setLyrics(hit);
      setBusy(false);
      setErr('');
      return;
    }
    let alive = true;
    setBusy(true);
    setErr('');
    setLyrics(null);
    getLyrics(title, artist, durationMs)
      .then(l => {
        const result = l.synced?.length ? 'synced' : l.plain ? 'plain' : 'none';
        // Which songs miss, and from where — the only way to see coverage.
        logEvent('lyrics_result', {
          title,
          artist,
          result,
          lyrics_source: l.source ?? '',
        });
        if (result !== 'none') {
          lyricsCache.set(cacheKey, l);
          trimCache(lyricsCache);
        }
        if (alive) {
          setLyrics(l);
        }
      })
      .catch(e => alive && setErr(e instanceof Error ? e.message : String(e)))
      .finally(() => alive && setBusy(false));
    return () => {
      alive = false;
    };
  }, [cacheKey, title, artist, durationMs, enabled]);

  return {
    lyrics,
    busy,
    err,
    // While it's still loading, assume yes — the tab shouldn't flicker grey on
    // every track change.
    available: busy || !!(lyrics?.synced?.length || lyrics?.plain),
  };
}

/**
 * Synced lyrics scroll themselves and can be tapped to jump; plain text is
 * shown when that's all the sources have.
 */
export const LyricsPane = React.memo(function LyricsPane({
  state,
  visible = true,
}: {
  state: LyricsState;
  /** Mounted-but-hidden panes must not scroll a view nobody can see. */
  visible?: boolean;
}) {
  // Its own subscription, at half the seekbar's rate — highlighting a line does
  // not need 4Hz, and this way a lyric tick re-renders only the lyric list.
  // Parked when the pane isn't on screen, since the player no longer unmounts.
  const {position} = useProgress(visible ? 500 : PARKED_POLL);
  const {lyrics, busy, err} = state;
  const scroller = useRef<ScrollView>(null);

  const synced = useMemo(() => lyrics?.synced ?? [], [lyrics]);

  const activeLine = useMemo(() => {
    let idx = -1;
    for (let i = 0; i < synced.length; i++) {
      if (synced[i].time <= position) {
        idx = i;
      } else {
        break;
      }
    }
    return idx;
  }, [synced, position]);

  // MEASURED line positions, not index * LINE_H. Long lines wrap to two or
  // three rows, so the fixed-height guess drifted further with every verse —
  // which is how the sung line ended up above the fold. Each line reports its
  // real y; the scroll centres the active one in the visible pane.
  const lineTops = useRef<number[]>([]);
  const [paneH, setPaneH] = useState(0);

  // New sheet, new geometry — stale measurements would centre the wrong lines.
  useEffect(() => {
    lineTops.current = [];
  }, [lyrics]);

  useEffect(() => {
    if (!visible || activeLine < 0 || !scroller.current) {
      return;
    }
    const y = lineTops.current[activeLine] ?? activeLine * LINE_H;
    scroller.current.scrollTo({
      y: Math.max(0, y - Math.max(90, paneH * 0.4)),
      animated: true,
    });
  }, [activeLine, visible, paneH]);

  if (busy) {
    return (
      <View style={styles.lyricCenter}>
        <ActivityIndicator size="large" color={C.accent} />
      </View>
    );
  }
  if (err || (!synced.length && !lyrics?.plain)) {
    return (
      <View style={styles.lyricCenter}>
        <Text style={styles.lyricEmpty}>No lyrics found for this track.</Text>
      </View>
    );
  }

  return (
    <ScrollView
      ref={scroller}
      style={styles.lyricScroll}
      contentContainerStyle={styles.lyricBody}
      onLayout={e => setPaneH(e.nativeEvent.layout.height)}
      showsVerticalScrollIndicator={false}>
      {synced.length > 0
        ? synced.map((line, i) => (
            <Text
              key={`${line.time}-${i}`}
              onPress={() => seekTo(line.time)}
              onLayout={e => {
                lineTops.current[i] = e.nativeEvent.layout.y;
              }}
              style={[
                styles.lyricLine,
                i === activeLine && styles.lyricLineOn,
              ]}>
              {line.text || '♪'}
            </Text>
          ))
        : [
            <Text key="untimed" style={styles.lyricUntimed}>
              Lyrics not timed
            </Text>,
            ...(lyrics?.plain || '').split('\n').map((line, i) => (
              <Text key={i} style={styles.lyricPlain}>
                {line || ' '}
              </Text>
            )),
          ]}
    </ScrollView>
  );
});

const styles = StyleSheet.create({
  lyricScroll: {flex: 1},
  lyricBody: {paddingHorizontal: 26, paddingVertical: 20},
  lyricCenter: {flex: 1, alignItems: 'center', justifyContent: 'center'},
  lyricEmpty: {color: C.faint, fontSize: 13},
  lyricLine: {
    fontSize: 21,
    lineHeight: LINE_H,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.38)',
  },
  lyricLineOn: {color: C.text},
  lyricPlain: {fontSize: 16, lineHeight: 26, color: 'rgba(255,255,255,0.8)'},
  lyricUntimed: {
    alignSelf: 'flex-start',
    marginBottom: 14,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.1)',
    color: C.faint,
    fontSize: 12,
    fontWeight: '700',
  },
});
