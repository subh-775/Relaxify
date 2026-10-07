/**
 * One screen for every collection: album, playlist, Liked Songs, Downloads.
 *
 * There used to be two of these (CollectionScreen and TrackListScreen) and they
 * had already drifted — one had shuffle, the other didn't. Since every list of
 * songs is now the same object, it renders through one path.
 *
 * Downloads additionally supports select-and-delete: hold a row to enter
 * selection, then remove the files from the phone's storage.
 */
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Animated,
  Image,
  Modal,
  NativeModules,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  ArrowDownToLine,
  CheckSquare,
  CheckSquare2,
  ChevronLeft,
  CircleCheck,
  Heart,
  ImagePlus,
  MoreVertical,
  Pause,
  Pencil,
  Play,
  Plus,
  Search as SearchIcon,
  Share2,
  Shuffle,
  Square,
  SquareX,
  Trash2,
  X,
  ArrowUpDown,
} from '../icons';
import {C, S, T} from '../theme';
import {deleteDownload, type Track} from '../backend';
import {formatTotalDuration, getBestArtworkUrl, getTrackId} from '../tracks';
import {
  isSaved,
  toggleSaved,
  type Collection,
} from '../collections';
import {CollectionArt} from '../components/CollectionArt';
import {TrackRow, listWindowing} from '../components/TrackRow';
import {toast} from '../toast';
import {
  enqueueDownload,
  forgetDownloads,
  overlayDownloadArtwork,
  useDownloadJobs,
} from '../downloads';
import {DownloadRow} from '../components/DownloadRow';
import {
  State,
  setShuffle,
  shuffleInAfterCurrent,
  shuffleUpcoming,
  togglePlay,
  useActiveTrack,
  usePlaybackOrigin,
  usePlaybackState,
  useShuffle,
} from '../player';
import {useLikes} from '../store';
import {
  addSharedPlaylist,
  deletePlaylist,
  playlistFromLink,
  renamePlaylist,
  setPlaylistImage,
  usePlaylists,
} from '../playlists';
import {ShareSheet} from '../components/ShareSheet';
import {getLocalLibrary} from '../backend';
import {ConfirmModal} from '../components/ConfirmModal';
import {Sheet} from '../components/Sheet';
import {BOTTOM_INSET} from '../layout';
import {useListEnd} from '../components/UpdateModal';
import {EmptyState} from '../components/EmptyState';
import {MoreByArtist} from '../components/MoreByArtist';

/** The small word over the title: what kind of list this is. */
function kindLabel(kind: Collection['kind']): string {
  switch (kind) {
    case 'album':
      return 'Album';
    case 'downloads':
      return 'On this phone';
    case 'liked':
      return 'Your likes';
    default:
      return 'Playlist';
  }
}

export function CollectionScreen({
  collection,
  loading = false,
  onClose,
  onPlay,
  onMenu,
  onChanged,
  onOpenAlbum,
}: {
  collection: Collection;
  /** A fuller tracklist is on its way — show a spinner, not "empty". */
  loading?: boolean;
  onClose: () => void;
  onPlay: (track: Track, context: Track[]) => void;
  onMenu?: (
    track: Track,
    from?: {playlistId?: string; playlistName?: string},
  ) => void;
  /** Downloads were deleted — the owner should rescan disk. */
  onChanged?: () => void;
  /** Open another album by the same artist (the "More by" row). */
  onOpenAlbum?: (album: string, artist: string) => void;
}) {
  const [selected, setSelected] = useState<Set<string> | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(() => isSaved(collection));
  // Shared with the player sheet — see useShuffle in player.ts.
  const shuffled = useShuffle();
  // Own-playlist management, mirrored from the library's long-press sheet so a
  // playlist is editable from inside as well as from its row.
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameText, setRenameText] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [sharing, setSharing] = useState(false);

  /**
   * LIVE tracks, not the snapshot the screen was opened with.
   *
   * The collection object App holds was built at open time — unlike a song
   * mid-list, unliking from inside Liked Songs, removing from a playlist, or
   * finishing a download changed the STORE but not this prop, so the row only
   * vanished after backing out and reopening. Each mutable kind re-reads its
   * source of truth here.
   */
  const likes = useLikes();
  // Room for the update strip too, while it is up.
  const listEnd = useListEnd();
  const playlists = usePlaylists();
  const [localTracks, setLocalTracks] = useState<Track[] | null>(null);
  const jobs = useDownloadJobs();

  // Re-scan disk when a download finishes (and once on open) so a completed
  // song appears in the Downloads list the moment its bar completes.
  const doneCount = jobs.filter(j => j.status === 'done').length;
  useEffect(() => {
    if (collection.kind !== 'downloads') {
      return;
    }
    let alive = true;
    getLocalLibrary()
      .then(({tracks: t}) => alive && setLocalTracks(overlayDownloadArtwork(t)))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [collection.kind, doneCount]);

  const tracks = useMemo(() => {
    switch (collection.kind) {
      case 'liked':
        return likes;
      case 'userPlaylist': {
        const pl = playlists.find(p => `pl:${p.id}` === collection.id);
        return pl?.tracks ?? collection.tracks;
      }
      case 'downloads':
        return localTracks ?? collection.tracks;
      default:
        return collection.tracks;
    }
  }, [collection, likes, playlists, localTracks]);
  const runtime = useMemo(() => formatTotalDuration(tracks), [tracks]);

  // Sort and find, for this visit only. "Order" is the list's own: the
  // record's running order, or the playlist's.
  const [sortBy, setSortBy] = useState<'order' | 'title' | 'artist'>('order');
  const [find, setFind] = useState<string | null>(null);
  const nextSort = useCallback(
    () =>
      setSortBy(s => (s === 'order' ? 'title' : s === 'title' ? 'artist' : 'order')),
    [],
  );
  const sortLabel =
    sortBy === 'title'
      ? 'Title'
      : sortBy === 'artist'
      ? 'Artist'
      : collection.kind === 'album'
      ? 'Track order'
      : 'Custom order';
  const shown = useMemo(() => {
    const q = (find ?? '').trim().toLowerCase();
    let list = q
      ? tracks.filter(t =>
          `${t.title || ''} ${t.artist || ''}`.toLowerCase().includes(q),
        )
      : tracks;
    if (sortBy !== 'order') {
      const key = (t: Track) =>
        (sortBy === 'title' ? t.title : t.artist || '').toLowerCase();
      list = [...list].sort((a, b) => key(a).localeCompare(key(b)));
    }
    return list;
  }, [tracks, find, sortBy]);

  // A user playlist stays editable from inside, not only from its library row:
  // reflect the LIVE name and cover so a rename or new picture shows without
  // backing out, and expose the manage menu (rename / cover / delete).
  const isOwnPlaylist = collection.kind === 'userPlaylist';
  const playlistId = collection.id.replace(/^pl:/, '');
  const livePlaylist = isOwnPlaylist
    ? playlists.find(p => p.id === playlistId)
    : undefined;
  const displayName = livePlaylist?.name ?? collection.name;
  // A friend's playlist opened from its link: playable here, kept only by
  // "Add to library", which saves a copy that is entirely yours. The same
  // link again finds that copy and says so, rather than adding it twice.
  const shared = collection.kind === 'shared' ? collection.shared : undefined;
  const added = shared ? playlistFromLink(playlists, shared.code) : undefined;
  const addShared = useCallback(() => {
    if (shared) {
      addSharedPlaylist(shared.code, shared.copy);
      toast(`Added ${shared.copy.name || 'it'} to your library`);
    }
  }, [shared]);
  const sharedBy = shared?.copy.by || livePlaylist?.from?.by;
  const shownCollection = useMemo(
    () =>
      livePlaylist
        ? {...collection, name: livePlaylist.name, image: livePlaylist.image}
        : collection,
    [collection, livePlaylist],
  );

  // Whether THIS collection is what's sounding right now — that's what decides
  // if the big green button means pause/resume or "start from the top".
  const activeEngine = useActiveTrack();
  const {state: playState} = usePlaybackState() as {state?: State};
  const origin = usePlaybackOrigin();
  const playingHere = useMemo(() => {
    if (!activeEngine) {
      return false;
    }
    const at = String(activeEngine.title ?? '').toLowerCase();
    const aa = String(activeEngine.artist ?? '').toLowerCase();
    return tracks.some(
      t =>
        (t.title || '').toLowerCase() === at &&
        (t.artist || '').toLowerCase() === aa,
    );
  }, [activeEngine, tracks]);
  const isPlaying =
    playState === State.Playing ||
    playState === State.Buffering ||
    playState === State.Loading;

  // The header art shrinks as the list scrolls up and comes back full-size on
  // the way down — the Spotify header feel.
  const scrollY = useRef(new Animated.Value(0)).current;
  const artScale = scrollY.interpolate({
    inputRange: [0, 220],
    outputRange: [1, 0.55],
    extrapolate: 'clamp',
  });
  const artOpacity = scrollY.interpolate({
    inputRange: [0, 220],
    outputRange: [1, 0.35],
    extrapolate: 'clamp',
  });

  // Warm the image cache for the first screenful of covers, so scrolling a
  // freshly-opened playlist doesn't pop empty squares in one by one.
  useEffect(() => {
    tracks.slice(0, 12).forEach(t => {
      const art = getBestArtworkUrl(t);
      if (art) {
        Image.prefetch(art).catch(() => {});
      }
    });
  }, [tracks]);
  const selecting = selected !== null;
  const canSelect = collection.kind === 'downloads';
  // Only a playlist of the user's can offer "remove from this playlist".
  const playlistFrom =
    collection.kind === 'userPlaylist'
      ? {
          playlistId: collection.id.replace(/^pl:/, ''),
          playlistName: collection.name,
        }
      : undefined;

  const toggleOne = useCallback((t: Track) => {
    setSelected(prev => {
      const next = new Set(prev ?? []);
      const id = getTrackId(t);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const allSelected = selecting && selected.size === tracks.length;

  const toggleAll = useCallback(() => {
    setSelected(allSelected ? new Set() : new Set(tracks.map(getTrackId)));
  }, [allSelected, tracks]);

  const deleteSelected = useCallback(async () => {
    if (!selected?.size) {
      return;
    }
    setBusy(true);
    const targets = tracks.filter(t => selected.has(getTrackId(t)));
    // Sequential, not parallel: each delete may also remove a now-empty album
    // folder, and two of those racing on the same folder is how you get a
    // spurious failure on a delete that actually worked.
    let removed = 0;
    const forget: Track[] = [];
    for (const t of targets) {
      if (t.file_path && (await deleteDownload(t.file_path))) {
        removed += 1;
        forget.push(t);
      }
    }
    // Tell the registry and every screen listening, before the toast —
    // otherwise the rows just deleted keep their downloaded tick until
    // something else happens to rescan.
    if (forget.length) {
      forgetDownloads(forget);
    }
    setBusy(false);
    setSelected(null);
    toast(
      removed === targets.length
        ? `Deleted ${removed} song${removed === 1 ? '' : 's'}`
        : `Deleted ${removed} of ${targets.length} — some files were already gone`,
    );
    onChanged?.();
  }, [selected, tracks, onChanged]);

  // What you see is what plays: a sorted or filtered list queues in that
  // order.
  const play = useCallback((t: Track) => onPlay(t, shown), [onPlay, shown]);

  /** Queue every track for download. Sequential so the backend isn't handed
   *  fifty simultaneous fetches. */
  const downloadAll = useCallback(async () => {
    if (!tracks.length) {
      return;
    }
    toast(`Downloading ${tracks.length} songs…`);
    for (const t of tracks) {
      try {
        await enqueueDownload(t);
      } catch {
        /* skip the ones with no downloadable source */
      }
    }
  }, [tracks]);

  const changeCover = useCallback(async () => {
    setMenuOpen(false);
    const native = NativeModules.Backend as {pickImage?: () => Promise<string>};
    if (typeof native.pickImage !== 'function') {
      toast('Changing the cover needs the newest APK.');
      return;
    }
    try {
      const uri = await native.pickImage();
      if (uri) {
        setPlaylistImage(playlistId, uri);
        toast('Cover updated');
      }
    } catch {
      toast('Could not use that image');
    }
  }, [playlistId]);

  const submitRename = useCallback(() => {
    const clean = renameText.trim();
    if (clean) {
      renamePlaylist(playlistId, clean);
      toast('Playlist renamed');
    }
    setRenaming(false);
    setRenameText('');
  }, [renameText, playlistId]);

  const doDelete = useCallback(() => {
    setConfirmDelete(false);
    deletePlaylist(playlistId);
    toast(`Deleted ${displayName}`);
    onClose();
  }, [playlistId, displayName, onClose]);

  /**
   * Shuffle never cuts off the song playing now. This collection already
   * playing: what comes next is reordered. Something else playing: this
   * collection, shuffled, comes next. Nothing loaded: playback starts from a
   * random track. Either way the icon lights to say the order is shuffled.
   */
  const shuffle = useCallback(async () => {
    if (!tracks.length) {
      return;
    }
    const next = !shuffled;
    if (!next) {
      // Toggling OFF: put the upcoming tracks back in their original order.
      await setShuffle(false).catch(() => {});
      toast('Shuffle off');
      return;
    }
    // The origin too: a "Wrong song?" pick or a cleaned-up title misses the
    // title match, and Shuffle then restarted the list on a random song.
    if (playingHere || origin === collection.id) {
      await setShuffle(true).catch(() => {});
      toast('Shuffled what comes next');
    } else if (collection.kind === 'downloads') {
      // Downloads loops, so it starts on its own, from the top of a random
      // order: slotted in after another song, that song would loop with it.
      const mixed = shuffleUpcoming(tracks);
      onPlay(mixed[0], mixed);
      setTimeout(() => setShuffle(true).catch(() => {}), 600);
    } else if (
      await shuffleInAfterCurrent(tracks, collection.id).catch(() => false)
    ) {
      toast(`${displayName} comes next, shuffled`);
    } else {
      onPlay(tracks[Math.floor(Math.random() * tracks.length)], tracks);
      // Give the queue a beat to build before shuffling its tail.
      setTimeout(() => setShuffle(true).catch(() => {}), 600);
    }
  }, [
    onPlay,
    tracks,
    playingHere,
    shuffled,
    origin,
    collection.id,
    collection.kind,
    displayName,
  ]);

  /** The green button: pause/resume when this collection is playing, start it
   *  otherwise — never a dead control. */
  const onBigPlay = useCallback(() => {
    if (!tracks.length) {
      return;
    }
    if (playingHere) {
      togglePlay().catch(() => {});
    } else {
      // The first song as you see it, sorted or found.
      play(shown[0] ?? tracks[0]);
    }
  }, [tracks, shown, playingHere, play]);

  return (
    <View style={styles.wrap}>
      <View style={styles.bar}>
        <TouchableOpacity
          onPress={selecting ? () => setSelected(null) : onClose}
          hitSlop={12}
          style={styles.barBtn}>
          <ChevronLeft size={28} color={C.text} />
        </TouchableOpacity>

        {selecting ? (
          <>
            <Text style={styles.barTitle}>{selected.size} selected</Text>
            {/* An icon, not a word — the header beside it already says
                "n selected", so this only has to say what tapping does. The
                accessibility label carries the meaning that the text used to,
                because an unlabelled glyph is invisible to a screen reader in a
                way the words never were. */}
            <TouchableOpacity
              onPress={toggleAll}
              hitSlop={10}
              style={styles.selectAll}
              accessibilityRole="button"
              accessibilityLabel={
                allSelected ? 'Clear the selection' : 'Select all songs'
              }>
              {allSelected ? (
                <SquareX size={22} color={C.accent} />
              ) : (
                <CheckSquare2 size={22} color={C.accent} />
              )}
            </TouchableOpacity>
            <TouchableOpacity
              onPress={deleteSelected}
              disabled={busy || !selected.size}
              hitSlop={10}
              style={styles.barBtn}>
              <Trash2
                size={22}
                color={selected.size && !busy ? C.danger : C.faint}
              />
            </TouchableOpacity>
          </>
        ) : find !== null ? (
          // Find takes the title's place, so the list filters right under
          // the field you are typing in.
          <View style={styles.findRow}>
            <SearchIcon size={17} color={C.sub} />
            <TextInput
              value={find}
              onChangeText={setFind}
              placeholder="Find in this list"
              placeholderTextColor={C.faint}
              style={styles.findInput}
              autoFocus
              autoCorrect={false}
              returnKeyType="search"
            />
            <TouchableOpacity
              hitSlop={10}
              onPress={() => setFind(null)}
              accessibilityRole="button"
              accessibilityLabel="Close find">
              <X size={18} color={C.sub} />
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <Text style={styles.barTitle} numberOfLines={1}>
              {displayName}
            </Text>
            {tracks.length > 0 && (
              <TouchableOpacity
                onPress={() => setFind('')}
                hitSlop={12}
                style={styles.barBtn}
                accessibilityRole="button"
                accessibilityLabel="Find in this list">
                <SearchIcon size={21} color={C.text} />
              </TouchableOpacity>
            )}
            {isOwnPlaylist && livePlaylist && (
              <TouchableOpacity
                onPress={() => setSharing(true)}
                hitSlop={12}
                style={styles.barBtn}
                accessibilityRole="button"
                accessibilityLabel="Share with friends">
                <Share2 size={21} color={C.text} />
              </TouchableOpacity>
            )}
            {isOwnPlaylist && (
              <TouchableOpacity
                onPress={() => setMenuOpen(true)}
                hitSlop={12}
                style={styles.barBtn}>
                <MoreVertical size={22} color={C.text} />
              </TouchableOpacity>
            )}
          </>
        )}
      </View>

      <Animated.FlatList
        data={shown}
        keyExtractor={t => getTrackId(t)}
        {...listWindowing}
        contentContainerStyle={[styles.list, listEnd]}
        showsVerticalScrollIndicator={false}
        onScroll={Animated.event(
          [{nativeEvent: {contentOffset: {y: scrollY}}}],
          {useNativeDriver: true},
        )}
        scrollEventThrottle={16}
        ListHeaderComponent={
          <View style={styles.header}>
            {/* Cover beside the title, so the first songs show without a
                scroll. The cover still eases back as the list moves up. */}
            <View style={styles.top}>
              <Animated.View
                style={{transform: [{scale: artScale}], opacity: artOpacity}}>
                <CollectionArt collection={shownCollection} size={128} />
              </Animated.View>
              <View style={styles.meta}>
                <Text style={styles.kind}>{kindLabel(collection.kind)}</Text>
                <Text style={styles.name} numberOfLines={3}>
                  {displayName}
                </Text>
                {collection.kind === 'album' && !!collection.artist && (
                  <Text style={styles.by} numberOfLines={1}>
                    {collection.artist}
                  </Text>
                )}
                {!!sharedBy && (
                  <Text style={styles.by} numberOfLines={1}>
                    {shared ? `Shared by ${sharedBy}` : `From ${sharedBy}`}
                  </Text>
                )}
                <Text style={styles.sub}>
                  {`${tracks.length} ${tracks.length === 1 ? 'song' : 'songs'}${
                    runtime ? `, ${runtime}` : ''
                  }`}
                </Text>
              </View>
            </View>

            {collection.kind === 'downloads' && jobs.length > 0 && (
              <View style={styles.jobs}>
                {jobs.map(j => (
                  <DownloadRow key={j.taskId} job={j} />
                ))}
              </View>
            )}

            {!selecting && (
              <>
                {/* Two wide buttons with words. A record keeps its running
                    order, so an album gets Play alone, full width. */}
                <View style={styles.bigRow}>
                  <TouchableOpacity
                    style={[styles.bigBtn, styles.bigPlay]}
                    activeOpacity={0.85}
                    onPress={onBigPlay}
                    disabled={!tracks.length}
                    accessibilityRole="button">
                    {playingHere && isPlaying ? (
                      <Pause size={20} color={C.bg} fill={C.bg} />
                    ) : (
                      <Play size={20} color={C.bg} fill={C.bg} />
                    )}
                    <Text style={styles.bigPlayText}>
                      {playingHere && isPlaying ? 'Pause' : 'Play'}
                    </Text>
                  </TouchableOpacity>
                  {collection.kind !== 'album' && (
                    <TouchableOpacity
                      style={[styles.bigBtn, styles.bigShuffle]}
                      activeOpacity={0.8}
                      onPress={shuffle}
                      disabled={!tracks.length}
                      accessibilityRole="button"
                      accessibilityState={{selected: shuffled}}>
                      <Shuffle
                        size={19}
                        color={shuffled ? C.accent : C.text}
                      />
                      <Text
                        style={[
                          styles.bigShuffleText,
                          shuffled && styles.bigShuffleOn,
                        ]}>
                        Shuffle
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* Tools: keep it (save, download) on the left; sort on the
                    right. Find lives in the header. */}
                <View style={styles.tools}>
                  {(collection.kind === 'album' ||
                    collection.kind === 'sourcePlaylist') && (
                    <TouchableOpacity
                      activeOpacity={0.7}
                      hitSlop={10}
                      accessibilityRole="button"
                      accessibilityLabel={saved ? 'Remove from library' : 'Save to library'}
                      onPress={() => {
                        const now = toggleSaved(collection);
                        setSaved(now);
                        toast(
                          now
                            ? `Saved ${collection.name}`
                            : `Removed ${collection.name}`,
                        );
                      }}>
                      <Heart
                        size={23}
                        color={saved ? C.accent : C.text}
                        fill={saved ? C.accent : 'transparent'}
                      />
                    </TouchableOpacity>
                  )}
                  {(collection.kind === 'album' ||
                    collection.kind === 'userPlaylist' ||
                    collection.kind === 'sourcePlaylist' ||
                    collection.kind === 'shared') && (
                    <TouchableOpacity
                      activeOpacity={0.7}
                      hitSlop={10}
                      onPress={downloadAll}
                      disabled={!tracks.length}
                      accessibilityRole="button"
                      accessibilityLabel="Download all">
                      <ArrowDownToLine
                        size={23}
                        color={tracks.length ? C.text : C.faint}
                      />
                    </TouchableOpacity>
                  )}
                  {shared &&
                    (added ? (
                      <View style={styles.sortPill}>
                        <CircleCheck size={16} color={C.accent} strokeWidth={2.4} />
                        <Text style={styles.sortText}>In your library</Text>
                      </View>
                    ) : (
                      <TouchableOpacity
                        style={[styles.sortPill, styles.addPill]}
                        activeOpacity={0.8}
                        onPress={addShared}
                        accessibilityRole="button">
                        <Plus size={16} color={C.bg} strokeWidth={2.6} />
                        <Text style={[styles.sortText, styles.addText]}>
                          Add to library
                        </Text>
                      </TouchableOpacity>
                    ))}
                  <View style={styles.fill} />
                  <TouchableOpacity
                    style={styles.sortPill}
                    activeOpacity={0.75}
                    onPress={nextSort}
                    disabled={tracks.length < 2}
                    accessibilityRole="button"
                    accessibilityLabel={`Sort: ${sortLabel}`}>
                    <ArrowUpDown size={15} color={C.text} />
                    <Text style={styles.sortText}>{sortLabel}</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        }
        ListFooterComponent={
          collection.kind === 'album' &&
          !!collection.artist &&
          !!onOpenAlbum &&
          !find ? (
            <MoreByArtist
              artist={collection.artist}
              current={collection.name}
              onOpen={onOpenAlbum}
            />
          ) : null
        }
        ListEmptyComponent={
          find && tracks.length ? (
            <Text style={styles.empty}>{`No songs match "${find.trim()}".`}</Text>
          ) : loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="large" color={C.accent} />
              <Text style={styles.empty}>Loading songs…</Text>
            </View>
          ) : (
            <EmptyState
              title={
                collection.kind === 'downloads'
                  ? 'No downloads yet'
                  : collection.kind === 'liked'
                  ? 'No liked songs yet'
                  : 'This list is empty'
              }
              line={
                collection.kind === 'downloads'
                  ? 'Download a song from its menu and it plays here without a connection.'
                  : collection.kind === 'liked'
                  ? 'Tap the heart on any song and it lands here.'
                  : 'Add songs from any song\'s menu.'
              }
            />
          )
        }
        renderItem={({item}) => {
          const id = getTrackId(item);
          const checked = selecting && selected.has(id);
          return (
            <View style={styles.rowWrap}>
              {selecting && (
                <TouchableOpacity
                  onPress={() => toggleOne(item)}
                  hitSlop={10}
                  style={styles.check}>
                  {checked ? (
                    <CheckSquare size={22} color={C.accent} />
                  ) : (
                    <Square size={22} color={C.faint} />
                  )}
                </TouchableOpacity>
              )}
              <View style={styles.rowFill}>
                <TrackRow
                  track={item}
                  onPress={() => (selecting ? toggleOne(item) : play(item))}
                  onLongPress={
                    canSelect && !selecting
                      ? () => setSelected(new Set([id]))
                      : onMenu
                      ? () => onMenu(item, playlistFrom)
                      : undefined
                  }
                  onMenu={
                    onMenu && !selecting
                      ? () => onMenu(item, playlistFrom)
                      : undefined
                  }
                  showActions={!selecting}
                  showDuration={false}
                />
              </View>
            </View>
          );
        }}
      />

      {/* Manage this playlist — same options as the library's long-press sheet,
          reachable from inside the playlist too. */}
      <Sheet
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        style={styles.sheet}>
        <View>
          <Text style={styles.sheetTitle} numberOfLines={1}>
            {displayName}
          </Text>
          <TouchableOpacity
            style={styles.sheetRow}
            activeOpacity={0.7}
            onPress={() => {
              setRenameText(displayName);
              setMenuOpen(false);
              setRenaming(true);
            }}>
            <Pencil size={20} color={C.sub} />
            <Text style={styles.sheetLabel}>Rename</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.sheetRow}
            activeOpacity={0.7}
            onPress={changeCover}>
            <ImagePlus size={20} color={C.sub} />
            <Text style={styles.sheetLabel}>Change cover</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.sheetRow}
            activeOpacity={0.7}
            onPress={() => {
              setMenuOpen(false);
              setConfirmDelete(true);
            }}>
            <Trash2 size={20} color={C.danger} />
            <Text style={[styles.sheetLabel, styles.sheetDanger]}>
              Delete playlist
            </Text>
          </TouchableOpacity>
        </View>
      </Sheet>

      <ShareSheet
        playlist={sharing && livePlaylist ? livePlaylist : null}
        onClose={() => setSharing(false)}
      />

      {/* Rename dialog. Stays a <Modal>: a TextInput dialog wants a real window
          for soft-keyboard focus and insets. See LibraryScreen for the full
          reasoning. */}
      <Modal
        visible={renaming}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setRenaming(false)}>
        <View style={styles.dialogScrim}>
          <View style={styles.dialog}>
            <Text style={styles.dialogTitle}>Rename playlist</Text>
            <TextInput
              value={renameText}
              onChangeText={setRenameText}
              placeholder="New name"
              placeholderTextColor={C.faint}
              style={styles.input}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={submitRename}
            />
            <View style={styles.dialogRow}>
              <TouchableOpacity
                onPress={() => setRenaming(false)}
                style={styles.dialogBtn}>
                <Text style={styles.dialogCancel}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={submitRename}
                disabled={!renameText.trim()}
                style={styles.dialogBtn}>
                <Text
                  style={[
                    styles.dialogOk,
                    !renameText.trim() && styles.dialogDisabled,
                  ]}>
                  Save
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <ConfirmModal
        visible={confirmDelete}
        title={`Delete "${displayName}"?`}
        message="The songs themselves are not touched."
        confirmLabel="Delete"
        danger
        onConfirm={doDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {flex: 1, backgroundColor: C.bg},
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 12,
    paddingHorizontal: 8,
    paddingBottom: 4,
    gap: 4,
  },
  barBtn: {padding: 4},
  barTitle: {...T.rowTitle, color: C.text, flex: 1, fontSize: 17},
  selectAll: {paddingHorizontal: 8, paddingVertical: 6},
  // The bars at the foot of the app float OVER the page now, so a list has to
  // end above them or its last row is permanently behind one. See src/layout.ts.
  list: {paddingBottom: BOTTOM_INSET},
  header: {paddingTop: 10, paddingBottom: 6},
  top: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 16,
    paddingHorizontal: S.gutter,
  },
  meta: {flex: 1, minWidth: 0, gap: 3},
  kind: {color: C.sub, fontSize: 12, fontWeight: '700'},
  by: {color: C.text, fontSize: 14, fontWeight: '700'},
  bigRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: S.gutter,
    marginTop: 18,
  },
  bigBtn: {
    flex: 1,
    height: 44,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  bigPlay: {backgroundColor: C.text},
  bigPlayText: {color: C.bg, fontSize: 15, fontWeight: '800'},
  bigShuffle: {borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.28)'},
  bigShuffleText: {color: C.text, fontSize: 15, fontWeight: '800'},
  bigShuffleOn: {color: C.accent},
  tools: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 22,
    paddingHorizontal: S.gutter,
    marginTop: 16,
  },
  fill: {flex: 1},
  sortPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: C.surfaceHi,
    marginRight: -8,
  },
  sortText: {color: C.text, fontSize: 12.5, fontWeight: '700'},
  addPill: {backgroundColor: C.text},
  addText: {color: C.bg},
  findRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginLeft: 4,
    marginRight: 6,
    paddingHorizontal: 12,
    height: 38,
    borderRadius: 999,
    backgroundColor: C.surfaceHi,
  },
  findInput: {flex: 1, color: C.text, fontSize: 14, padding: 0},
  name: {...T.screenTitle, color: C.text, fontSize: 22, lineHeight: 27},
  sub: {...T.sub, color: C.sub, marginTop: 2},
  jobs: {alignSelf: 'stretch', paddingTop: 14},
  rowWrap: {flexDirection: 'row', alignItems: 'center'},
  rowFill: {flex: 1, minWidth: 0},
  check: {paddingLeft: S.gutter, paddingVertical: 12},
  empty: {
    color: C.faint,
    textAlign: 'center',
    paddingHorizontal: 40,
    paddingVertical: 34,
    fontSize: 13,
    lineHeight: 19,
  },
  loadingBox: {alignItems: 'center', paddingTop: 26},
  // Background, rounded top, padding, scrim and handle all live in <Sheet>.
  sheet: {},
  sheetTitle: {
    ...T.rowTitle,
    color: C.text,
    paddingHorizontal: S.gutter,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: S.gutter,
    paddingVertical: 14,
  },
  sheetLabel: {fontSize: 15, color: C.text},
  sheetDanger: {color: C.danger},
  dialogScrim: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  dialog: {
    width: '100%',
    borderRadius: 14,
    backgroundColor: C.surfaceHi,
    padding: 20,
  },
  dialogTitle: {...T.rowTitle, color: C.text, marginBottom: 14},
  input: {
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    color: C.text,
    fontSize: 16,
    paddingVertical: 8,
  },
  dialogRow: {flexDirection: 'row', justifyContent: 'flex-end', marginTop: 18},
  dialogBtn: {paddingHorizontal: 14, paddingVertical: 8},
  dialogCancel: {color: C.sub, fontSize: 14, fontWeight: '700'},
  dialogOk: {color: C.accent, fontSize: 14, fontWeight: '700'},
  dialogDisabled: {color: C.faint},
});
