/**
 * "Saved in" — the sheet behind the + in both players and the ⋮ on a row.
 *
 * It used to add one song to one playlist and close. It toggles now, and stays
 * open: the reason you came here is usually "which of my playlists is this in",
 * and answering that by tapping a row, watching the sheet close, and reopening
 * it to check the next one is not an answer. Three playlists in one visit is
 * one visit.
 *
 * Liked Songs is one of the rows and it is the SAME toggle as the + button that
 * opened the sheet — one concept, one place to undo it. Letting "liked" and
 * "in Liked Songs" become two different things is the way this feature breaks.
 *
 * Creating a playlist from here adds the song to it immediately, because that's
 * the only reason you'd be creating one at this moment.
 */
import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {Check, Heart, Search} from '../icons';
import {PlusSlim} from '../glyphs';
import {C, S, T} from '../theme';
import type {Track} from '../backend';
import {cleanText, getBestArtworkUrl} from '../tracks';
import {
  addTrackToPlaylist,
  createPlaylist,
  playlistsContaining,
  removeTrackFromPlaylist,
  usePlaylists,
  type Playlist,
} from '../playlists';
import {rowId, sortPinned, usePins} from '../pins';
import {PinGlyph} from './PinGlyph';
import {useLike} from '../store';
import {CollectionArt, LIKED_TINT} from './CollectionArt';
import {playlistToCollection} from '../collections';
import {toast} from '../toast';
import Animated, {
  useAnimatedScrollHandler,
  useSharedValue,
} from 'react-native-reanimated';
import {Sheet} from './Sheet';

/**
 * Open the sheet from anywhere — a list row's + in particular. App owns the
 * sheet's state and registers itself here, the same way toast.ts works, so
 * the rows do not need a callback threaded through every screen.
 */
let opener: ((t: Track) => void) | null = null;

export function openAddToPlaylist(t: Track): void {
  opener?.(t);
}

export function useAddToPlaylistHost(open: (t: Track) => void): void {
  useEffect(() => {
    opener = open;
    return () => {
      if (opener === open) {
        opener = null;
      }
    };
  }, [open]);
}

/** Above this many, finding one by eye is a scroll rather than a glance. */
const FILTER_FROM = 3;

/** The mark's red: a filled tick means the song is in that list. */
const TICKED = C.brand;

/** A round tick: an empty ring, or filled red with a check. Also the
 *  "this copy" mark in WrongSongSheet. */
export function Tick({on}: {on: boolean}) {
  return (
    <View style={[styles.tick, on && styles.tickOn]}>
      {on && <Check size={14} color="#fff" strokeWidth={3.6} />}
    </View>
  );
}

/** A row of the sheet's one list. */
type Row = {kind: 'new'} | {kind: 'liked'} | {kind: 'playlist'; p: Playlist};

function AddToPlaylistSheetView({
  track,
  onClose,
}: {
  track: Track | null;
  onClose: () => void;
}) {
  const playlists = usePlaylists();
  const pins = usePins();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [query, setQuery] = useState('');
  /**
   * The track held through the close animation.
   *
   * `track` goes null the instant this is dismissed and <Sheet> keeps the panel
   * on screen while it slides away, so reading the prop directly flashed an
   * empty title for the length of the exit.
   */
  const [shown, setShown] = useState<Track | null>(track);
  const {liked, toggle: toggleLiked} = useLike(track);
  /**
   * Where the song already was when the sheet opened: those rows come first.
   * Taken once per open, so a row you tick stays where it is instead of
   * jumping to the top under your finger.
   */
  const [savedAtOpen, setSavedAtOpen] = useState<{
    liked: boolean;
    ids: Set<string>;
  }>({liked: false, ids: new Set()});

  useEffect(() => {
    if (track) {
      setShown(track);
      setSavedAtOpen({liked, ids: playlistsContaining(playlists, track)});
      return;
    }
    // Closed. A half-typed name or a stale filter must NOT still be sitting
    // there the next time this opens — the sheet is no longer torn down between
    // opens, so what used to be reset by unmounting has to be reset here.
    setCreating(false);
    setName('');
    setQuery('');
    // Only a new song (or a close) re-takes the snapshot; ticking rows must
    // not reorder them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track]);

  const memberOf = useMemo(
    () => playlistsContaining(playlists, track),
    [playlists, track],
  );

  /**
   * One scrolling list: New playlist, then wherever the song already is
   * (Liked Songs or a playlist), then everything else. Pinned playlists
   * lead within each group, and a filter keeps the order.
   */
  const rows = useMemo((): Row[] => {
    const q = query.trim().toLowerCase();
    const sorted = sortPinned(playlists, pins, p => rowId('playlist', p))
      .filter(p => !q || p.name.toLowerCase().includes(q))
      .map(p => ({kind: 'playlist' as const, p}));
    const likedRow: Row[] =
      !q || 'liked songs'.includes(q) ? [{kind: 'liked'}] : [];
    const isSaved = (r: Row) =>
      r.kind === 'playlist'
        ? savedAtOpen.ids.has(r.p.id)
        : r.kind === 'liked' && savedAtOpen.liked;
    const all = [...likedRow, ...sorted];
    return [
      {kind: 'new'},
      ...all.filter(isSaved),
      ...all.filter(r => !isSaved(r)),
    ];
  }, [playlists, pins, query, savedAtOpen]);

  const toggleIn = useCallback(
    (id: string, playlistName: string) => {
      if (!track) {
        return;
      }
      if (memberOf.has(id)) {
        // No toast on the way OUT, here or on the Liked row below. The tick
        // clears and the row leaves the list — a bar repeating what the screen
        // just showed is noise, and removing three songs meant three of them
        // queued up in a row.
        removeTrackFromPlaylist(id, track);
      } else {
        addTrackToPlaylist(id, track);
        toast(`Added to ${playlistName}`, 'info', {
          art: getBestArtworkUrl(track),
        });
      }
    },
    [track, memberOf],
  );

  const createAndAdd = useCallback(() => {
    const pl = createPlaylist(name);
    setCreating(false);
    setName('');
    if (pl && track) {
      addTrackToPlaylist(pl.id, track);
      toast(`Added to ${pl.name}`, 'info', {art: getBestArtworkUrl(track)});
    }
  }, [name, track]);

  const onLikedRow = useCallback(() => {
    toggleLiked();
    if (!liked && track) {
      toast('Added to Liked Songs', 'info', {art: getBestArtworkUrl(track)});
    }
  }, [liked, toggleLiked, track]);

  // 0 means the list is at its top, which is when a downward pull stops
  // belonging to the list and starts belonging to the sheet.
  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler(e => {
    scrollY.value = e.contentOffset.y;
  });

  return (
    <Sheet
      open={!!track}
      onClose={onClose}
      scrollY={scrollY}
      style={styles.sheet}>
      <Text style={styles.title}>Saved in</Text>
      <Text style={styles.subtitle} numberOfLines={1}>
        {[cleanText(shown?.title), cleanText(shown?.artist)]
          .filter(Boolean)
          .join(' · ')}
      </Text>

      {playlists.length > FILTER_FROM && !creating && (
        <View style={styles.findRow}>
          <Search size={16} color={C.faint} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Find playlist"
            placeholderTextColor={C.faint}
            style={styles.find}
            returnKeyType="search"
          />
        </View>
      )}

      {/* Animated, so the offset reaches the sheet's gesture on the UI thread.
          A JS onScroll would be a frame or two stale exactly when it matters —
          at the top of a fling, deciding who owns the finger. */}
      <Animated.FlatList
        data={rows}
        onScroll={onScroll}
        scrollEventThrottle={16}
        keyExtractor={r => (r.kind === 'playlist' ? r.p.id : r.kind)}
        style={styles.list}
        keyboardShouldPersistTaps="handled"
        ListFooterComponent={
          creating || rows.some(r => r.kind === 'playlist') ? null : (
            <Text style={styles.empty}>
              {query.trim()
                ? 'No playlist by that name.'
                : 'You have not made a playlist yet.'}
            </Text>
          )
        }
        renderItem={({item: row}) => {
          if (row.kind === 'new') {
            return creating ? (
              <View style={styles.newRow}>
                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder="Playlist name"
                  placeholderTextColor={C.faint}
                  style={styles.input}
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={createAndAdd}
                />
                <TouchableOpacity
                  onPress={createAndAdd}
                  disabled={!name.trim()}
                  style={styles.newBtn}>
                  <Check size={22} color={name.trim() ? C.accent : C.faint} />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.row}
                activeOpacity={0.7}
                onPress={() => setCreating(true)}>
                <View style={styles.plusTile}>
                  <PlusSlim size={20} color={C.text} />
                </View>
                <Text style={styles.rowTitle}>New playlist</Text>
              </TouchableOpacity>
            );
          }
          if (row.kind === 'liked') {
            return (
              <TouchableOpacity
                style={styles.row}
                activeOpacity={0.7}
                onPress={onLikedRow}
                accessibilityRole="checkbox"
                accessibilityState={{checked: liked}}>
                <View style={styles.likedTile}>
                  <Heart size={20} color="#fff" fill="#fff" />
                </View>
                <View style={styles.rowText}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    Liked Songs
                  </Text>
                </View>
                <Tick on={liked} />
              </TouchableOpacity>
            );
          }
          const item = row.p;
          const inPlaylist = memberOf.has(item.id);
          const pinned = pins.includes(rowId('playlist', item));
          return (
            <TouchableOpacity
              style={styles.row}
              activeOpacity={0.7}
              onPress={() => toggleIn(item.id, item.name)}
              accessibilityRole="checkbox"
              accessibilityState={{checked: inPlaylist}}>
              <CollectionArt
                collection={playlistToCollection(item)}
                size={46}
              />
              <View style={styles.rowText}>
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {item.name}
                </Text>
                <View style={styles.subRow}>
                  {pinned && <PinGlyph size={14} color={C.sub} />}
                  <Text style={styles.rowSub}>
                    {item.tracks.length} song
                    {item.tracks.length === 1 ? '' : 's'}
                  </Text>
                </View>
              </View>
              <Tick on={inPlaylist} />
            </TouchableOpacity>
          );
        }}
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  // Scrim, handle, rounded top and the slide all live in <Sheet> now.
  sheet: {maxHeight: '75%'},
  title: {
    ...T.rowTitle,
    color: C.text,
    fontSize: 19,
    fontWeight: '700',
    paddingHorizontal: S.gutter,
    paddingTop: 12,
  },
  subtitle: {
    ...T.sub,
    color: C.sub,
    paddingHorizontal: S.gutter,
    paddingTop: 2,
    paddingBottom: 12,
  },
  list: {flexGrow: 0},
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    paddingHorizontal: S.gutter,
    paddingVertical: 8,
  },
  // Liked Songs' own cover, as the library draws it.
  likedTile: {
    width: 46,
    height: 46,
    borderRadius: 7,
    backgroundColor: LIKED_TINT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plusTile: {
    width: 46,
    height: 46,
    borderRadius: 7,
    // A plain square edge, as Spotify draws it.
    borderWidth: 1.5,
    borderColor: '#5a5a62',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tick: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#3a3a40',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tickOn: {backgroundColor: TICKED, borderColor: TICKED},
  rowText: {flex: 1, minWidth: 0},
  rowTitle: {...T.body, color: C.text, flex: 1},
  subRow: {flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2},
  rowSub: {...T.sub, color: C.sub},
  findRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: S.gutter,
    marginBottom: 6,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: C.surface,
  },
  find: {flex: 1, color: C.text, fontSize: 14.5, paddingVertical: 8},
  newRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: S.gutter,
    paddingVertical: 10,
  },
  input: {
    flex: 1,
    color: C.text,
    fontSize: 15,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    paddingVertical: 7,
  },
  newBtn: {padding: 6},
  empty: {
    color: C.faint,
    fontSize: 13,
    paddingHorizontal: S.gutter,
    paddingVertical: 20,
  },
});

/** Memoised: App re-renders often, and each render of a sheet re-publishes
 *  its whole tree into SheetHost. Every prop App passes is stable. */
export const AddToPlaylistSheet = React.memo(AddToPlaylistSheetView);
