/**
 * "Not the right song?": pick another copy of the song playing now.
 *
 * Opened from the player's ⋮ menu or by tapping its source label. Three
 * places to look, in the order they are cheapest and most likely:
 *   - This copy, ticked, so it is clear what is playing;
 *   - Other copies: the song on its other sources, already found;
 *   - More results: a fresh search for its title and artist, and a box to
 *     type a search of your own when none of those is right.
 *
 * Listen first, then choose. Tapping a copy TRIES it: it plays from the same
 * second and nothing is remembered. "Use this one" keeps it, for that song
 * everywhere (songChoice), with Undo; tapping "This copy" again, or closing
 * the sheet, goes back to the original. A pick used to be kept on the first
 * tap, before anyone had heard it. A downloaded song's file stays what it is:
 * keeping a copy offers to replace the download instead.
 */
import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Image,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated, {
  useAnimatedScrollHandler,
  useSharedValue,
} from 'react-native-reanimated';
import {Search} from '../icons';
import {C, S, T} from '../theme';
import {
  deleteDownload,
  formatDuration,
  search,
  type Track,
} from '../backend';
import {cleanText, getBestArtworkUrl, normalizeTracks} from '../tracks';
import {otherCopies, sameCopy, setChoice} from '../songChoice';
import {swapCurrentCopy} from '../player';
import {enqueueDownload, forgetDownloads} from '../downloads';
import {logEvent} from '../analytics';
import {toast} from '../toast';
import {SOURCE_META} from './Badges';
import {Tick} from './AddToPlaylistSheet';
import {Sheet} from './Sheet';

/** Open the sheet from anywhere (the player's label, the ⋮ menu). App owns
 *  its state and registers itself here, as AddToPlaylistSheet does. */
let opener: ((t: Track) => void) | null = null;

export function openWrongSong(t: Track): void {
  opener?.(t);
}

export function useWrongSongHost(open: (t: Track) => void): void {
  useEffect(() => {
    opener = open;
    return () => {
      if (opener === open) {
        opener = null;
      }
    };
  }, [open]);
}

/** How many search results are worth a glance. */
const MORE = 8;
/** Typing pauses this long before a search goes out. */
const TYPE_PAUSE_MS = 450;

const sourceOf = (t: Track) => t.playable_source || t.primary_source || '';

function CopyRow({
  t,
  on,
  onPick,
  onUse,
}: {
  t: Track;
  on: boolean;
  onPick: (t: Track) => void;
  /** Set on the copy being tried: the button that keeps it. */
  onUse?: () => void;
}) {
  const art = getBestArtworkUrl(t);
  const meta = SOURCE_META[t.file_path ? 'local' : sourceOf(t)];
  const len = formatDuration(t.duration_ms);
  return (
    <TouchableOpacity
      style={styles.row}
      activeOpacity={0.7}
      onPress={() => onPick(t)}
      accessibilityRole="radio"
      accessibilityState={{checked: on}}>
      {art ? (
        <Image source={{uri: art}} style={styles.art} />
      ) : (
        <View style={[styles.art, styles.artEmpty]} />
      )}
      <View style={styles.rowText}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {cleanText(t.title)}
        </Text>
        <Text style={styles.rowSub} numberOfLines={1}>
          {cleanText(t.artist)}
        </Text>
        <View style={styles.metaRow}>
          {!!meta && (
            <Text style={[styles.src, {color: meta.tint}]}>{meta.label}</Text>
          )}
          {!!len && <Text style={styles.rowSub}>{len}</Text>}
          {!!onUse && <Text style={styles.trying}>Playing now</Text>}
        </View>
      </View>
      {onUse ? (
        <TouchableOpacity
          style={styles.use}
          activeOpacity={0.8}
          onPress={onUse}
          accessibilityRole="button">
          <Text style={styles.useText}>Use this one</Text>
        </TouchableOpacity>
      ) : (
        <Tick on={on} />
      )}
    </TouchableOpacity>
  );
}

function WrongSongSheetView({
  track,
  onClose,
}: {
  track: Track | null;
  onClose: () => void;
}) {
  /** Held through the close animation, as the other sheets do. */
  const [shown, setShown] = useState<Track | null>(track);
  const [results, setResults] = useState<Track[] | null>(null);
  const [query, setQuery] = useState('');
  /** The copy playing on trial, not yet kept; null = the original plays. */
  const [trying, setTrying] = useState<Track | null>(null);
  const ticket = useRef(0);

  const find = useCallback((t: Track, q: string) => {
    const mine = ++ticket.current;
    setResults(null);
    search(q, 15)
      .then(found => {
        if (mine !== ticket.current) {
          return;
        }
        const skip = [t, ...otherCopies(t)];
        setResults(
          normalizeTracks(found)
            .filter(r => !skip.some(s => sameCopy(r, s)))
            .slice(0, MORE),
        );
      })
      .catch(() => mine === ticket.current && setResults([]));
  }, []);

  useEffect(() => {
    if (!track) {
      return;
    }
    setShown(track);
    setQuery('');
    setTrying(null);
    find(track, `${cleanText(track.title)} ${cleanText(track.artist)}`);
  }, [track, find]);

  // Your own search, once typing pauses. Empty goes back to the song's own.
  useEffect(() => {
    if (!track) {
      return;
    }
    const q = query.trim();
    const t = setTimeout(
      () =>
        find(track, q || `${cleanText(track.title)} ${cleanText(track.artist)}`),
      q ? TYPE_PAUSE_MS : 0,
    );
    return () => clearTimeout(t);
  }, [query, track, find]);

  /** A row tapped: try that copy, or go back to the original. */
  const pick = useCallback(
    (p: Track) => {
      const t = shown;
      if (!t) {
        return;
      }
      if (sameCopy(p, t)) {
        // Back to the song as it was.
        if (trying) {
          setTrying(null);
          swapCurrentCopy(t).catch(() => {});
        }
        return;
      }
      if (trying && sameCopy(p, trying)) {
        return; // already playing it
      }
      setTrying(p);
      logEvent('wrong_song_try', {from: sourceOf(t) || 'local', to: sourceOf(p)});
      swapCurrentCopy(p).catch(() => {
        setTrying(null);
        swapCurrentCopy(t).catch(() => {});
        toast('That copy would not play. Try another.');
      });
    },
    [shown, trying],
  );

  /** "Use this one": keep the copy on trial, for this song everywhere. */
  const keep = useCallback(() => {
    const t = shown;
    const p = trying;
    if (!t || !p) {
      return;
    }
    setTrying(null);
    onClose();
    const via = otherCopies(t).some(c => sameCopy(c, p))
      ? 'copies'
      : query.trim()
      ? 'search'
      : 'results';
    const before = setChoice(t, p);
    logEvent('wrong_song', {from: sourceOf(t) || 'local', to: sourceOf(p), via});
    if (t.file_path) {
      // The file on the phone is still the wrong song.
      toast('Kept. Replace the downloaded file too?', 'info', {
        art: getBestArtworkUrl(p),
        action: {
          label: 'Replace',
          onPress: () => {
            enqueueDownload(p)
              .then(async () => {
                await deleteDownload(String(t.file_path));
                forgetDownloads([t]);
                toast('Downloading the right one; the old file is gone');
              })
              .catch(() => toast('Could not start that download'));
          },
        },
      });
    } else {
      toast('Kept. This one plays everywhere now.', 'info', {
        art: getBestArtworkUrl(p),
        action: {
          label: 'Undo',
          onPress: () => {
            setChoice(t, before);
            swapCurrentCopy(t).catch(() => {});
          },
        },
      });
    }
  }, [shown, trying, query, onClose]);

  /** Closed without keeping anything: the original comes back. */
  const close = useCallback(() => {
    if (trying && shown) {
      setTrying(null);
      swapCurrentCopy(shown).catch(() => {});
    }
    onClose();
  }, [trying, shown, onClose]);

  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler(e => {
    scrollY.value = e.contentOffset.y;
  });

  if (!shown) {
    return null;
  }
  const t = shown;
  const copies = otherCopies(t);

  return (
    <Sheet open={!!track} onClose={close} scrollY={scrollY} style={styles.sheet}>
      <Text style={styles.title}>Not the right song?</Text>
      <Text style={styles.subtitle} numberOfLines={1}>
        {trying
          ? 'Listen, then keep it or go back to this copy.'
          : `${cleanText(t.title)} · ${cleanText(t.artist)}. Tap one to listen.`}
      </Text>
      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        style={styles.list}
        keyboardShouldPersistTaps="handled">
        <Text style={styles.section}>This copy</Text>
        <CopyRow t={t} on={!trying} onPick={pick} />

        {copies.length > 0 && (
          <>
            <Text style={styles.section}>Other copies</Text>
            {copies.map(c => (
              <CopyRow
                key={sourceOf(c)}
                t={c}
                on={false}
                onPick={pick}
                onUse={trying && sameCopy(c, trying) ? keep : undefined}
              />
            ))}
          </>
        )}

        <Text style={styles.section}>
          {query.trim() ? 'Your search' : 'More results'}
        </Text>
        {results === null ? (
          <ActivityIndicator style={styles.wait} color={C.sub} />
        ) : results.length ? (
          results.map((r, i) => (
            <CopyRow
              key={`${sourceOf(r)}${i}`}
              t={r}
              on={false}
              onPick={pick}
              onUse={trying && sameCopy(r, trying) ? keep : undefined}
            />
          ))
        ) : (
          <Text style={styles.empty}>Nothing else found. Try your own search.</Text>
        )}

        <View style={styles.findRow}>
          <Search size={16} color={C.faint} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search for the right one"
            placeholderTextColor={C.faint}
            style={styles.find}
            returnKeyType="search"
            autoCorrect={false}
          />
        </View>
      </Animated.ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  sheet: {maxHeight: '82%'},
  title: {
    ...T.rowTitle,
    color: C.text,
    fontSize: 19,
    fontWeight: '800',
    paddingHorizontal: S.gutter,
    paddingTop: 12,
  },
  subtitle: {
    ...T.sub,
    color: C.sub,
    paddingHorizontal: S.gutter,
    paddingTop: 2,
    paddingBottom: 6,
  },
  list: {flexGrow: 0},
  section: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.9,
    textTransform: 'uppercase',
    color: C.faint,
    paddingHorizontal: S.gutter,
    paddingTop: 12,
    paddingBottom: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    paddingHorizontal: S.gutter,
    paddingVertical: 8,
  },
  art: {width: 46, height: 46, borderRadius: 7, backgroundColor: C.surface},
  artEmpty: {backgroundColor: C.surfaceHi},
  rowText: {flex: 1, minWidth: 0},
  rowTitle: {...T.body, color: C.text},
  rowSub: {...T.sub, color: C.sub},
  metaRow: {flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2},
  src: {fontSize: 11.5, fontWeight: '800'},
  trying: {fontSize: 11.5, fontWeight: '800', color: C.brand},
  use: {
    backgroundColor: C.brand,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  useText: {color: '#111014', fontSize: 12.5, fontWeight: '800'},
  wait: {paddingVertical: 18},
  empty: {
    color: C.faint,
    fontSize: 13,
    paddingHorizontal: S.gutter,
    paddingVertical: 12,
  },
  findRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: S.gutter,
    marginTop: 10,
    marginBottom: 14,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: C.surface,
  },
  find: {flex: 1, color: C.text, fontSize: 14.5, paddingVertical: 8},
});

/** Memoised: App re-renders often, and each render of a sheet re-publishes
 *  its whole tree into SheetHost. Every prop App passes is stable. */
export const WrongSongSheet = React.memo(WrongSongSheetView);
