import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  AppState,
  BackHandler,
  Keyboard,
  Linking,
  PermissionsAndroid,
  Platform,
  SafeAreaView,
  Share,
  StatusBar,
  StyleSheet,
  View,
} from 'react-native';
import {ErrorBoundary} from './src/ErrorBoundary';
import {HomeScreen} from './src/screens/HomeScreen';
import {RecapScreen} from './src/screens/RecapScreen';
import {JamScreen} from './src/screens/JamScreen';
import {DOCS_URL, inviteMessage} from './src/links';
import {startDeviceMemory} from './src/deviceMemory';
import {startDevice} from './src/device';
import {
  WelcomeScreen,
  settleWelcome,
  useWelcomed,
} from './src/screens/WelcomeScreen';
import {rememberCollection} from './src/lastCollection';
import {SearchScreen} from './src/screens/SearchScreen';
import {LibraryScreen} from './src/screens/LibraryScreen';
import {
  SettingsScreen,
  prefetchSettingsRemote,
} from './src/screens/SettingsScreen';
import {EqualizerScreen} from './src/screens/EqualizerScreen';
import {CollectionScreen} from './src/screens/CollectionScreen';
import Svg, {Defs, LinearGradient, Rect, Stop} from 'react-native-svg';
import {SpotifyImportScreen} from './src/screens/SpotifyImportScreen';
import {ImportLinkScreen} from './src/screens/ImportLinkScreen';
import {ArtistScreen} from './src/screens/ArtistScreen';
import {PlayerScreen} from './src/screens/PlayerScreen';
import {PlayerBar} from './src/components/PlayerBar';
import {BottomNav, type Tab} from './src/components/BottomNav';
import {SheetHost} from './src/components/Sheet';
import {Toaster} from './src/components/Toaster';
import {
  AddToPlaylistSheet,
  useAddToPlaylistHost,
} from './src/components/AddToPlaylistSheet';
import {CreditsSheet, type CreditsFor} from './src/components/CreditsSheet';
import {openShared, startSharing} from './src/sharedPlaylists';
import {
  WrongSongSheet,
  useWrongSongHost,
} from './src/components/WrongSongSheet';
import {watchStalls} from './src/stallWatch';
import {JamBar} from './src/components/JamBar';
import {UpdateModal} from './src/components/UpdateModal';
import {
  checkUpdateOnLaunch,
  useUpdateAvailable,
  watchForegroundUpdates,
} from './src/update';
import {watchCacheLimit} from './src/cacheLimit';
import {repairCovers} from './src/coverRepair';
import {recheckSavedCopies} from './src/copyRepair';
import {
  TrackActionSheet,
  useTrackMenuHost,
  type SheetContext,
} from './src/components/TrackActionSheet';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import {Splash} from './src/components/Splash';
import {Sidebar, type SidebarDest} from './src/components/Sidebar';
import {LanguagesScreen} from './src/screens/LanguagesScreen';
import {resetDrawer, settleDrawer} from './src/drawer';
import {
  panelDrawn,
  reopenIfClosing,
  settlePlayer,
  sheetP,
} from './src/playerSheet';
import Animated, {useAnimatedStyle} from 'react-native-reanimated';
import {C} from './src/theme';
import {
  appVersion,
  getAlbum,
  getAlbumOf,
  getCollection,
  type HomeItem,
  type Track,
} from './src/backend';
import {collectionKey, playlistToCollection} from './src/collections';
import {refreshDownloads, watchDownloads} from './src/downloads';
import {
  playTrack,
  restoreSession,
  setupPlayer,
  sourceTrackFor,
  startCrossfadeWatcher,
} from './src/player';
import {hydrate, readSettings} from './src/store';
import {flushAll} from './src/storage';
import {
  cleanText,
  getTrackId,
  normalizeTracks,
  splitArtists,
} from './src/tracks';
import {type Collection} from './src/collections';
import {applyAudioEffects} from './src/audioEffects';
import {toggleFollow} from './src/artists';
import {toast} from './src/toast';
import {importedPlaylistFor, noteCollectionOpened} from './src/spotifyImport';
import {diag} from './src/diag';
import {logEvent} from './src/analytics';

/**
 * Where "Help" goes.
 *
 * The documentation, not the source repository — the repo answers "how is this
 * built", which is not the question anyone taps Help to ask. Settings used to
 * point its About row at the repo for want of anywhere better.
 */

function Shell() {
  const [tab, setTab] = useState<Tab>('home');
  // A small navigation stack of overlays. These are plain absolutely-positioned
  // views rather than <Modal>s ON PURPOSE: a Modal renders in its own window
  // above everything, which is what hid the mini player and the bottom nav the
  // moment you opened a playlist. As overlays they sit inside the app's own
  // layout, so playback controls stay put while you browse.
  const [collection, setCollection] = useState<Collection | null>(null);
  const [collectionLoading, setCollectionLoading] = useState(false);
  const [importUrl, setImportUrl] = useState<string | null>(null);
  /** The page that asks for a playlist link (Home's import card). */
  const [importAsk, setImportAsk] = useState(false);
  const [artist, setArtist] = useState<string | null>(null);
  /** The JioSaavn song the artist was opened from, when it was a song's
   *  credit: it names the artist exactly (ArtistScreen's songUrl). */
  const [artistSong, setArtistSong] = useState('');
  const [artistSongTitle, setArtistSongTitle] = useState('');
  // Whichever overlay was opened LAST renders on top. Fixed JSX order put the
  // album under the artist page — it opened invisibly, which read as "albums
  // don't work". zIndex from a counter mirrors the order things were opened.
  const [collectionZ, setCollectionZ] = useState(0);
  const [artistZ, setArtistZ] = useState(0);

  const [sheetTrack, setSheetTrack] = useState<Track | null>(null);
  const [sheetFrom, setSheetFrom] = useState<SheetContext>(null);
  const [addTo, setAddTo] = useState<Track | null>(null);
  // Lets a list row's + open this sheet without a prop through every screen.
  useAddToPlaylistHost(setAddTo);
  // "Wrong song?", opened from the player's label or its ⋮ menu.
  const [wrongFor, setWrongFor] = useState<Track | null>(null);
  useWrongSongHost(setWrongFor);
  const [creditsFor, setCreditsFor] = useState<CreditsFor | null>(null);

  const [settingsOpen, setSettingsOpen] = useState(false);
  /** Which part of Settings to land on. Set when the update dot is what sent
   *  you there, so you arrive at the update instead of the top of the list. */
  const [settingsFocus, setSettingsFocus] = useState<'update' | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  /** Equalizer, same reasoning as Shortcuts. Settings keeps its own row and
   *  both point at the one component. */
  const [eqOpen, setEqOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const [playerOpen, setPlayerOpen] = useState(false);
  // null = not yet determined, false = this APK has no native audio engine.
  const [engine, setEngine] = useState<boolean | null>(null);
  const [libraryNonce, setLibraryNonce] = useState(0);
  /** The drawer's Recap. null = closed. */
  const [activity, setActivity] = useState<'stats' | null>(null);
  /** The drawer's Jam screen. */
  const [jamOpen, setJamOpen] = useState(false);
  const updateWaiting = useUpdateAvailable();
  const exitArmedAt = useRef(0);

  /**
   * One gate for the whole cold start.
   *
   * The splash used to live INSIDE HomeScreen, so it only ever covered Home's
   * own content — the shell, the mini player and its progress bar all arrived
   * afterwards, which is why the app visibly assembled itself in stages. Now
   * the real UI mounts underneath the splash and the splash only lifts once
   * BOTH the engine (session restored, so the mini player is already there)
   * and Home's first rows are ready. Nothing pops in after that. It also
   * waits for the startup animation to finish, so a fast start never cuts it
   * off halfway.
   */
  const [booted, setBooted] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const welcomed = useWelcomed();
  const engineDone = useRef(false);
  const homeDone = useRef(false);
  const splashPlayed = useRef(false);
  const lifting = useRef(false);
  const liftSplash = useCallback(() => {
    if (
      engineDone.current &&
      homeDone.current &&
      splashPlayed.current &&
      !lifting.current
    ) {
      lifting.current = true;
      // Everything is in place; now let the JS thread finish what that set
      // off (rows rendering, covers decoding, the restored queue's events)
      // before Home is handed over. A swipe in the first seconds used to
      // land in the middle of it and stick.
      const t0 = Date.now();
      whenQuiet(SPLASH_QUIET_CAP_MS).then(() => {
        logEvent('splash_wait', {ms: Date.now() - t0});
        setBooted(true);
      });
    }
  }, []);
  const onHomeReady = useCallback(() => {
    homeDone.current = true;
    liftSplash();
  }, [liftSplash]);
  const onSplashPlayed = useCallback(() => {
    splashPlayed.current = true;
    liftSplash();
  }, [liftSplash]);

  useEffect(() => {
    // First line of every session. Also the proof that the logcat bridge is
    // alive — if `adb logcat -s MPJS` shows nothing at all, the problem is the
    // logging, not the thing being investigated.
    diag('boot', `Relaxify ${appVersion || '?'} starting`);
    askForNotifications();
    hydrate().then(async () => {
      // Each headphone and speaker keeps its own equalizer: the one connected
      // now is put in place first, then applied, all under the splash.
      await startDeviceMemory();
      applyAudioEffects();
      settleWelcome();
      setHydrated(true);
    });
    // Boot the engine, then restore the last session so the mini player is
    // there on reopen (same song, paused, at the timestamp you left).
    setupPlayer().then(async ok => {
      diag(
        'boot',
        ok ? 'audio engine ready' : 'NO native audio engine in this APK',
      );
      setEngine(ok);
      if (ok) {
        const restored = await restoreSession();
        if (restored) {
          // Force the shell to show the player bar even though nothing was
          // tapped this launch.
          setEngine(true);
          // The bar slides in over 240ms when its track first appears. Let it
          // finish under the splash, so the first thing seen is a finished
          // mini player rather than one still arriving.
          await new Promise(r => setTimeout(r, 280));
        }
      }
      engineDone.current = true;
      liftSplash();
    });
    // Never let a hung backend strand anyone on the splash. Whatever is ready
    // at this point is what they get. Ten seconds, not six: the splash now
    // also waits for Home's fresh rows and the whole restored queue, so the
    // app is still when it appears, and a slow engine start needs the room.
    const bootCap = setTimeout(() => {
      engineDone.current = true;
      homeDone.current = true;
      setBooted(true);
    }, 10000);
    // Reads the setting each tick rather than closing over it, so changing
    // crossfade takes effect without restarting the watcher.
    startCrossfadeWatcher(() => readSettings().crossfadeDuration);
    // Again on every return to the foreground, because a process kept alive
    // by the playback service may not launch again for days.
    watchForegroundUpdates();
    // Data saver on mobile data, and the weekly Recap notification.
    startDevice();
    // What is on the phone: known before anything plays or lists it.
    const stopDownloads = watchDownloads();
    // Logs any freeze of the JS thread (stallWatch.ts).
    const stopStalls = watchStalls();
    // Store writes are debounced (see storage.ts). Leaving the foreground is
    // the last moment we are reliably given before Android may reclaim the
    // process, so anything still pending goes out now.
    const bg = AppState.addEventListener('change', next => {
      if (next !== 'active') {
        flushAll();
      }
    });
    return () => {
      clearTimeout(bootCap);
      bg.remove();
      stopDownloads();
      stopStalls();
    };
  }, [liftSplash]);

  // Chores that can wait: counted from when the app is on screen, not from
  // launch, so none of them lands in the first seconds of use.
  useEffect(() => {
    if (!booted) {
      return;
    }
    // Silent update check; the popup only appears if a newer release is out.
    const u = setTimeout(checkUpdateOnLaunch, 3500);
    // Clear the cache once it passes the size set in Settings.
    const stopCacheLimit = watchCacheLimit();
    // Shared playlists: friends' ones you follow refresh, yours push changes.
    const stopSharingSync = startSharing();
    // Old songs still showing a wrong iTunes cover get their real one.
    const covers = setTimeout(() => repairCovers().catch(() => {}), 20000);
    // Saved songs that were someone else's recording get the real one.
    const copies = setTimeout(
      () => recheckSavedCopies().catch(() => {}),
      45000,
    );
    return () => {
      clearTimeout(u);
      clearTimeout(covers);
      clearTimeout(copies);
      stopCacheLimit();
      stopSharingSync();
    };
  }, [booted]);

  const play = useCallback(
    async (track: Track, context?: Track[], originId?: string) => {
      try {
        await playTrack(track, context, originId);
        setEngine(true);
      } catch (e) {
        // A toast, not a bar in the layout: the old notice sat above the mini
        // player and covered it, hiding the song that was actually playing.
        diag('play', `"${track?.title}" failed: ${String(e)}`);
        toast(e instanceof Error ? e.message : String(e));
      }
    },
    [],
  );

  /** A single credited artist opens directly; several ask which one first.
   *  Either way the full player closes first — the artist page renders in the
   *  body, and a Modal player would sit on top of it, which is why "clicked
   *  the artist, nothing happened until I pressed back". */
  /**
   * Album, playlist and artist pages STACK, as ONE history.
   *
   * There were two stacks, one of albums and playlists and one of artists,
   * each told apart from the other only by which was opened last. Open them
   * in turns (a playlist, an artist on it, an artist from "Fans also like",
   * an album of theirs) and Back closed the album, then put the PLAYLIST
   * over both artists, whose pages were gone at the next Back: "it exited
   * the entire thing and put me back in the library". Now every page opened
   * is one step in `navOrder`, Back undoes the newest step whichever kind it
   * is, and the newest page of either kind is the one drawn on top.
   */
  const navOrder = useRef<Array<'c' | 'a'>>([]);
  /** Draw whichever kind was opened last on top. */
  const restack = useCallback(() => {
    setCollectionZ(navOrder.current.lastIndexOf('c') + 1);
    setArtistZ(navOrder.current.lastIndexOf('a') + 1);
  }, []);
  const dropStep = useCallback((kind: 'c' | 'a') => {
    const at = navOrder.current.lastIndexOf(kind);
    if (at >= 0) {
      navOrder.current.splice(at, 1);
    }
  }, []);

  const collectionRef = useRef<Collection | null>(null);
  collectionRef.current = collection;
  const collectionStack = useRef<Collection[]>([]);
  const showCollection = useCallback(
    (c: Collection) => {
      const prev = collectionRef.current;
      // The same page again, or "Finding the album…" becoming the album:
      // replaced in place, not a step to go back to.
      const replacing =
        !!prev && (prev.id === c.id || prev.id.startsWith(FINDING_ALBUM));
      if (prev && !replacing) {
        collectionStack.current.push(prev);
      }
      if (replacing) {
        dropStep('c');
      }
      navOrder.current.push('c');
      // The playlist just imported, opened from anywhere: Home's card
      // stops announcing it.
      noteCollectionOpened(c.id);
      // Over the player too, which otherwise covered it: "Go to album" from
      // the lyrics opened the album behind the player.
      setPlayerOpen(false);
      collectionRef.current = c;
      setCollection(c);
      restack();
    },
    [restack, dropStep],
  );
  /** Back to the screen this one was opened from, or none. */
  const closeCollection = useCallback(() => {
    const prev = collectionStack.current.pop() ?? null;
    collectionRef.current = prev;
    setCollection(prev);
    dropStep('c');
    restack();
  }, [restack, dropStep]);
  /** Every album and playlist screen at once (a tab change). */
  const closeAllCollections = useCallback(() => {
    collectionStack.current = [];
    collectionRef.current = null;
    navOrder.current = navOrder.current.filter(k => k !== 'c');
    setCollection(null);
    restack();
  }, [restack]);
  const openCollection = showCollection;

  /** The artists opened one over another, under the one on screen. */
  const artistStack = useRef<
    Array<{name: string; song: string; title: string}>
  >([]);
  const artistNow = useRef({name: '', song: '', title: ''});
  /** Put an artist on screen, without touching the history. */
  const setArtistPage = useCallback(
    (name: string, songUrl: string, songTitle: string) => {
      setPlayerOpen(false);
      setArtistSong(songUrl);
      // A song not from JioSaavn (YouTube) names its artist by its JioSaavn copy.
      setArtistSongTitle(songUrl ? '' : songTitle);
      setArtist(name);
      artistNow.current = {name, song: songUrl, title: songTitle};
    },
    [],
  );
  /** An artist, over whatever is open: from a song, a credit, or another
   *  artist's "Fans also like". Back returns to what it was opened from. */
  const openArtist = useCallback(
    (name: string, songUrl = '', songTitle = '') => {
      const now = artistNow.current;
      const same = !!now.name && now.name.toLowerCase() === name.toLowerCase();
      if (now.name && !same) {
        artistStack.current.push(now);
      }
      if (same) {
        dropStep('a');
      }
      navOrder.current.push('a');
      setArtistPage(name, songUrl, songTitle);
      restack();
    },
    [setArtistPage, restack, dropStep],
  );
  const openArtistFromArtist = useCallback(
    (name: string) => openArtist(name),
    [openArtist],
  );
  /** Back to the artist this one was opened from, or none. */
  const closeArtist = useCallback(() => {
    const prev = artistStack.current.pop();
    if (prev) {
      setArtistPage(prev.name, prev.song, prev.title);
    } else {
      artistNow.current = {name: '', song: '', title: ''};
      setArtist(null);
    }
    dropStep('a');
    restack();
  }, [setArtistPage, restack, dropStep]);
  /** One step back through every album, playlist and artist page opened:
   *  the newest, whichever kind it is. False when none is open. */
  const navBack = useCallback((): boolean => {
    const last = navOrder.current[navOrder.current.length - 1];
    if (last === 'a') {
      closeArtist();
      return true;
    }
    if (last === 'c') {
      closeCollection();
      return true;
    }
    return false;
  }, [closeArtist, closeCollection]);

  const openArtistCredit = useCallback(
    (t: {title?: string | null; artist?: string | null}) => {
      const credit = String(t.artist ?? '');
      const names = splitArtists(credit);
      if (names.length > 1) {
        // The credits are a sheet OVER whatever is open — the player stays
        // put until an actual artist is chosen. The player hands over its
        // engine track; the song behind it carries the JioSaavn link the
        // composer and label are looked up by.
        const song: Partial<Track> = sourceTrackFor(t) ?? (t as Partial<Track>);
        setCreditsFor({
          title: cleanText(String(t.title ?? '')),
          credit: cleanText(credit),
          names,
          jiosaavnUrl: song.sources?.jiosaavn?.url,
        });
      } else if (names.length === 1) {
        const song: Partial<Track> = sourceTrackFor(t) ?? (t as Partial<Track>);
        openArtist(
          names[0],
          song.sources?.jiosaavn?.url ?? '',
          cleanText(String(t.title ?? '')),
        );
      }
    },
    [openArtist],
  );

  /** Open an album AS ITS FULL SELF: fetch the real tracklist by name+artist.
   *  Seed tracks (what we already hold) show instantly; the fetch replaces
   *  them when it lands, so the screen is never empty and never stale. */
  const openAlbumByName = useCallback(
    async (
      albumName: string,
      artistName: string,
      seed: Track[] = [],
      albumId = '',
    ) => {
      showCollection({
        id: `album:${albumName}`,
        kind: 'album',
        name: albumName,
        artist: artistName,
        image: seed[0]?.artwork_url,
        tracks: seed,
      });
      setCollectionLoading(true);
      // Everything below acts only on THIS page, if it is still the one on
      // screen. Album A answering after the listener had moved on to album B
      // switched B's placeholders off, and B looked like a one-song album.
      const here = () => collectionRef.current?.id === `album:${albumName}`;
      try {
        // The song's own page names its album exactly; by name alone a film
        // soundtrack finds nothing and the page stays at the one seed song.
        const data = await getAlbum(
          albumName,
          artistName,
          seed[0]?.sources?.jiosaavn?.url ?? '',
          albumId,
        );
        if (!data.tracks.length && !seed.length && here()) {
          // Nothing to show: close it rather than leave an empty page open.
          closeCollection();
          toast('That one has no playable songs right now.');
        }
        if (data.tracks.length) {
          setCollection(prev =>
            prev && prev.id === `album:${albumName}`
              ? {
                  ...prev,
                  name: data.name || albumName,
                  // The album's own cover: without it the header was a
                  // mosaic of its songs', a single's art among them.
                  image: data.image || prev.image,
                  year: data.year || prev.year,
                  tracks: normalizeTracks(data.tracks),
                }
              : prev,
          );
        }
      } catch {
        // The seed tracks stay — a partial album beats an error screen.
      } finally {
        if (here()) {
          setCollectionLoading(false);
        }
      }
    },
    [showCollection, closeCollection],
  );
  /** Home and the artist page open an album by its id, with no songs yet.
   *  One stable function, so passing it does not undo HomeScreen's memo: an
   *  inline arrow here re-rendered all of Home on every tab switch. */
  const openAlbumById = useCallback(
    (albumName: string, artistName: string, id = '') =>
      openAlbumByName(albumName, artistName, [], id),
    [openAlbumByName],
  );

  const openAlbumOf = useCallback(
    (track: Track) => {
      if (track.album) {
        openAlbumByName(track.album, track.artist, [track]);
        return;
      }
      // A song that does not name its album (a YouTube one): the engine
      // finds the release it is on, by the same song on iTunes or JioSaavn.
      // Measured 58 of 59 right, niche to famous; a cover finds none.
      // The page opens at once, holding the song, so the seconds of looking
      // show as looking instead of as nothing having happened.
      const finding = `${FINDING_ALBUM}${getTrackId(track)}`;
      showCollection({
        id: finding,
        kind: 'album',
        // No name yet: the page shows a placeholder bar until it is found.
        name: '',
        artist: track.artist,
        image: track.artwork_url,
        tracks: [track],
      });
      setCollectionLoading(true);
      const stillWaiting = () => collectionRef.current?.id === finding;
      const notFound = (message: string) => {
        // Only to someone still waiting: left already, it is news about a
        // page they closed.
        if (stillWaiting()) {
          setCollectionLoading(false);
          closeCollection();
          toast(message);
        }
      };
      getAlbumOf(track)
        .then(found => {
          if (!found) {
            notFound("Couldn't find the album this song is on.");
          } else if (stillWaiting()) {
            // The song itself as the album's first seed: it is on this
            // release, so the page is never empty while the rest load, and
            // a release whose other songs are not found still holds it.
            openAlbumByName(found.name, found.artist, [track], found.album_id);
          }
          // Closed while looking: it is not opened behind the user's back.
        })
        .catch(() =>
          notFound("Couldn't find the album. Check your connection."),
        );
    },
    [openAlbumByName, showCollection, closeCollection],
  );

  /** A Home card is a track, album or playlist. Tracks play; the rest open —
   *  as a Collection, the same as anything in the library. */
  const pickHomeItem = useCallback(
    async (item: HomeItem) => {
      if (item.type === 'track' && item.track) {
        play(item.track);
        return;
      }
      if (!item.perma_url) {
        return;
      }
      const id = item.perma_url;
      const album = item.type === 'album';
      const name = item.name || item.title || '';
      const by = item.artist || item.subtitle || '';
      // The page opens AT ONCE, with placeholder rows, and fills in. It
      // used to open only once everything had loaded: seconds of a card that
      // seemed not to have been tapped, tapped again, or another tapped, and
      // the pages piled up when the answers came.
      showCollection({
        id,
        kind: album ? 'album' : 'sourcePlaylist',
        name: item.title || item.name || '',
        image: item.image,
        tracks: [],
        source: id,
      });
      setCollectionLoading(true);
      const here = () => collectionRef.current?.id === id;
      try {
        // An album opens by its JioSaavn id: its link is an album page, which
        // the playlist lookup cannot read, and by name a soundtrack or a
        // "(From ...)" title often matched nothing — "no playable songs" on a
        // card that plainly has them. The link and then the name are what is
        // left when the id finds nothing, or a card cached before there was
        // one has none.
        const byId = album && !!item.album_id;
        let data = byId
          ? await getAlbum(name, by, '', item.album_id)
          : await getCollection(item.perma_url);
        if (!data.tracks.length && byId) {
          data = await getCollection(item.perma_url);
        }
        if (!data.tracks.length && album) {
          data = await getAlbum(name, by);
        }
        if (!here()) {
          return; // closed while it loaded
        }
        if (!data.tracks.length) {
          closeCollection();
          toast('That one has no playable songs right now.');
          return;
        }
        // A single is filed as an album with one song on it. It plays, with
        // similar songs after it, rather than staying a page of one.
        if (album && data.tracks.length === 1) {
          const [only] = normalizeTracks(data.tracks);
          if (only) {
            closeCollection();
            play(only);
            return;
          }
        }
        setCollection(prev =>
          prev && prev.id === id
            ? {
                ...prev,
                name: data.name || prev.name,
                tracks: normalizeTracks(data.tracks),
              }
            : prev,
        );
      } catch {
        if (here()) {
          closeCollection();
          toast("Couldn't open that — try again in a moment.");
        }
      } finally {
        if (here()) {
          setCollectionLoading(false);
        }
      }
    },
    [play, showCollection, closeCollection],
  );

  /** Home's quick-access tiles. Home only knows WHAT was tapped; the
   *  tracklists live here, next to everything else that opens a Collection. */
  const refreshDownloadsCollection = refreshDownloads;

  const switchTab = useCallback(
    (next: Tab) => {
      logEvent('screen_view', {screen_name: next});
      setTab(next);
      closeAllCollections();
      artistStack.current = [];
      artistNow.current = {name: '', song: '', title: ''};
      navOrder.current = [];
      setArtist(null);
      setImportUrl(null);
      setImportAsk(false);
      setSettingsOpen(false);
      setActivity(null);
      // Every full-screen overlay closes on a tab change. The Equalizer and Jam
      // were missing here, so the Equalizer stayed on top of every tab.
      setEqOpen(false);
      setLangOpen(false);
      setJamOpen(false);
    },
    [closeAllCollections],
  );

  /**
   * Android's back button must walk the same stack the on-screen back arrow
   * does. Without this it fell through to the OS and closed the whole app from
   * inside a playlist, which is the one thing back should never do here.
   *
   * Order matters: innermost surface first, so back dismisses what is actually
   * on top. Returning true says "handled"; returning false on the last screen
   * lets Android exit, which IS what back means on Home.
   */
  const onBack = () => {
    if (playerOpen) {
      setPlayerOpen(false);
      return true;
    }
    if (addTo) {
      setAddTo(null);
      return true;
    }
    if (creditsFor) {
      setCreditsFor(null);
      return true;
    }
    if (sheetTrack) {
      setSheetTrack(null);
      return true;
    }
    if (settingsOpen) {
      setSettingsOpen(false);
      setSettingsFocus(null);
      return true;
    }
    // The Equalizer was simply never in this chain. It is a full-screen overlay
    // like Shortcuts, so back fell straight through it to `tab !== 'home'` or to
    // the exit warning and the screen stayed up.
    if (eqOpen) {
      setEqOpen(false);
      return true;
    }
    if (langOpen) {
      setLangOpen(false);
      return true;
    }
    if (activity) {
      setActivity(null);
      return true;
    }
    if (jamOpen) {
      setJamOpen(false);
      return true;
    }
    if (importAsk) {
      setImportAsk(false);
      return true;
    }
    if (importUrl) {
      setImportUrl(null);
      return true;
    }
    // Artist and album/playlist pages stack in either order, in turns: back
    // undoes the newest of them, whichever kind (navBack).
    if (navBack()) {
      return true;
    }
    // Any tab other than Home goes to Home before the app will exit.
    if (tab !== 'home') {
      setTab('home');
      return true;
    }
    // On Home with nothing open, one press warns, a second within 2s exits —
    // so a stray back can't kill the music by accident.
    if (Date.now() - exitArmedAt.current < 2000) {
      return false;
    }
    exitArmedAt.current = Date.now();
    toast('Press back again to exit', 'warn');
    return true;
  };

  /**
   * Registered ONCE, and called through a ref.
   *
   * It used to re-register on any of thirteen dependencies, so nearly every
   * state change in the app tore the listener down and added a fresh one. That
   * is not just churn: BackHandler calls its listeners in REVERSE registration
   * order, so re-adding this one kept moving the app-wide fallback to the FRONT
   * of the queue, ahead of the per-surface handlers in Sheet, Sidebar and
   * PlayerScreen that were registered when those opened. The player then closed
   * via setPlayerOpen(false) — no settle animation — instead of through its own
   * close(), and a sheet's own dismiss could be pre-empted outright.
   *
   * Registered once at mount, this handler is the OLDEST, so it is called LAST,
   * which is exactly what a fallback should be. The ref keeps the closure fresh
   * without touching the subscription.
   */
  const backRef = useRef(onBack);
  backRef.current = onBack;
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () =>
      backRef.current(),
    );
    return () => sub.remove();
  }, []);

  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  const closeRecap = useCallback(() => setActivity(null), []);
  const closeJam = useCallback(() => setJamOpen(false), []);
  const openJam = useCallback(() => setJamOpen(true), []);
  const openRecap = useCallback(() => setActivity('stats'), []);
  const closeLanguages = useCallback(() => setLangOpen(false), []);
  const openImportAsk = useCallback(() => setImportAsk(true), []);
  const closeImportAsk = useCallback(() => setImportAsk(false), []);
  /** A new link to import, from the link box or a paste in Search. One
   *  already imported opens its playlist instead of making a copy of it:
   *  Sync there brings in whatever is new. */
  const importLink = useCallback(
    (url: string) => {
      setImportAsk(false);
      // From Search the keyboard stayed up over whatever opened next.
      Keyboard.dismiss();
      const before = importedPlaylistFor(url);
      if (before) {
        openCollection(playlistToCollection(before));
        toast(
          `"${before.name}" is already in Your Library. Sync adds its new songs.`,
        );
        return;
      }
      setImportUrl(url);
    },
    [openCollection],
  );
  // Sunday's Recap notification opens the app on relaxify://recap, and a
  // shared playlist link's page on relaxify://p/CODE, whether the app was
  // closed (the initial URL) or already running (a url event).
  useEffect(() => {
    const go = (url: string | null) => {
      if (url?.startsWith('relaxify://recap')) {
        openRecap();
      }
      const code = url?.match(/^relaxify:\/\/p\/(\w{6})/)?.[1];
      if (code) {
        openShared(code)
          .then(c => {
            // Opened over Your Library, so Back from the playlist stays in
            // the app (Library, then Home) instead of returning to the chat
            // the link came from.
            switchTab('library');
            setPlayerOpen(false);
            openCollection(c);
          })
          .catch(e => toast(e instanceof Error ? e.message : String(e)));
      }
    };
    Linking.getInitialURL().then(go, () => {});
    const sub = Linking.addEventListener('url', e => go(e.url));
    return () => sub.remove();
  }, [openRecap, openCollection, switchTab]);

  /**
   * Opening by TAP on the app icon, the only way in: mount the panel closed,
   * then run it open.
   */
  const openDrawer = useCallback(() => {
    resetDrawer();
    setDrawerOpen(true);
    settleDrawer(true);
    // Start Settings' four backend reads NOW. Opening the drawer is the only
    // gesture that ever precedes opening Settings, and it buys the whole
    // animation plus however long the finger takes to reach the last row — by
    // which point the answers are usually already back and Settings opens
    // finished instead of filling in.
    prefetchSettingsRemote();
  }, []);

  const navigateFromDrawer = useCallback(
    (dest: SidebarDest) => {
      if (dest === 'settings') {
        setSettingsFocus(updateWaiting ? 'update' : null);
        setSettingsOpen(true);
      } else if (dest === 'equalizer') {
        // Its OWN overlay, not Settings-with-a-panel-preset. Same reasoning the
        // Shortcuts entry already carries: back from a drawer destination has
        // to return to where the drawer was opened, not drop you into a
        // Settings list you never asked to see.
        setEqOpen(true);
      } else if (dest === 'help') {
        // The one drawer item that is not an overlay: it leaves the app. Handled
        // HERE rather than inside Sidebar so every destination is still resolved
        // in one place — the drawer says what was tapped, this says what that
        // means.
        Linking.openURL(DOCS_URL).catch(() =>
          toast('Could not open the documentation'),
        );
      } else if (dest === 'languages') {
        setLangOpen(true);
      } else if (dest === 'jam') {
        setJamOpen(true);
      } else if (dest === 'recommend') {
        logEvent('app_recommended');
        Share.share({message: inviteMessage()}).catch(() => {});
      }
      // updateWaiting is read above, so it has to be a dependency — with an empty
      // array this closure would keep whatever the flag was on first render and
      // the deep link would never fire.
    },
    [updateWaiting],
  );

  const openSheet = useCallback((track: Track, from?: SheetContext) => {
    setSheetTrack(track);
    setSheetFrom(from ?? null);
  }, []);
  useTrackMenuHost(openSheet);

  /**
   * Stable identities for the memoised children below.
   *
   * These three were inline arrows, which meant a new function on every App
   * render — and a new function is a changed prop, so React.memo on the child
   * would have been defeated silently by the props rather than by anything
   * visible. The rest of the children's callbacks were already useCallback.
   */
  const openFromLibrary = useCallback(
    (c: Collection) =>
      // A followed artist opens their profile, not an empty tracklist.
      c.kind === 'artist' ? openArtist(c.name) : openCollection(c),
    [openArtist, openCollection],
  );
  const closePlayer = useCallback(() => setPlayerOpen(false), []);

  /**
   * Nothing is drawn under a fully open player.
   *
   * The player is an opaque full-screen view over the page, but Android still
   * drew the whole page beneath it — every row, every cover, the bars — on
   * every frame the player redrew (a seekbar tick, a lyric line, a skip). On a
   * 120 Hz screen that doubled the GPU work of the open player. At exactly
   * "fully open" there is nothing to see behind it, so the page drops to
   * opacity 0, which Android skips outright. It comes back the moment the
   * panel moves, before any of it can show.
   *
   * On the UI thread from sheetP, not React state: no commit, no layout, and
   * the switch lands in the same frame as the panel's own position. Two
   * styles because Reanimated will not share one across views.
   */
  const pageBehindPlayer = useAnimatedStyle(() => ({
    opacity: panelDrawn.value && sheetP.value < 0.001 ? 0 : 1,
  }));
  const barsBehindPlayer = useAnimatedStyle(() => ({
    opacity: panelDrawn.value && sheetP.value < 0.001 ? 0 : 1,
  }));
  const keyboardUp = useKeyboardUp();
  // The three app-level sheets, stable for the same reason as the above: they
  // are memoised, and each re-render of one re-publishes its whole tree into
  // SheetHost.
  const closeTrackSheet = useCallback(() => setSheetTrack(null), []);
  const closeAddTo = useCallback(() => setAddTo(null), []);
  const closeWrongSong = useCallback(() => setWrongFor(null), []);
  const closeCredits = useCallback(() => setCreditsFor(null), []);
  const pickCreditedArtist = useCallback(
    (name: string) => {
      setCreditsFor(null);
      // closes the player too — the profile is behind it
      openArtist(name, creditsFor?.jiosaavnUrl ?? '', creditsFor?.title ?? '');
    },
    [openArtist, creditsFor],
  );
  const expandPlayer = useCallback(() => {
    // A tap during the tail of a close turns the panel round; the app still
    // thinks it is open (it hears about a close only when the slide ends).
    if (reopenIfClosing()) {
      return;
    }
    setPlayerOpen(true);
  }, []);

  /**
   * A pull UP on the mini player has ended.
   *
   * React hears about it only when the settle has FINISHED. Anything that
   * touches App state during the motion — the pull itself, or its settle —
   * re-renders this tree and flips the player to `visible` (lyrics fetch,
   * progress clock, marquee, accessibility on a large tree) in the middle of
   * the animation, and those frames are the stutter. The panel is permanently
   * mounted and laid out, and the finger and the settle only need `sheetP`,
   * which already lives on the UI thread.
   */
  const endPlayerDrag = useCallback((open: boolean, velocity: number) => {
    settlePlayer(open, velocity, finished => {
      if (finished) {
        setPlayerOpen(open);
      }
    });
  }, []);

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

      <Animated.View style={[styles.body, pageBehindPlayer]}>
        {/* All three tabs stay MOUNTED; switching shows/hides them. Unmounting
            threw away each screen's state, so coming back to Home replayed
            "Starting the music engine…" and Library re-fetched everything —
            the single biggest "why is it reloading" complaint.

            collapsable={false} on each: with only layout in its style, Android
            drops the wrapper (and the screen's own bare root) from the native
            tree, so the tab's children land straight in this body beside the
            overlays. TopFade's zIndex then outranked the Equalizer, Settings
            and the rest, and its band painted across their headers. A real
            view keeps a tab's zIndex inside the tab. */}
        <View
          collapsable={false}
          style={tab === 'home' ? styles.tabShown : styles.tabHidden}>
          <HomeScreen
            onPickTrack={pickHomeItem}
            onPlayTrack={play}
            onOpenMenu={openDrawer}
            onReady={onHomeReady}
            onOpenRecap={openRecap}
            onOpenJam={openJam}
            onImportSpotify={setImportUrl}
            onAskImport={openImportAsk}
            onOpenCollection={openFromLibrary}
            onOpenAlbum={openAlbumById}
            visible={tab === 'home'}
          />
        </View>
        <View
          collapsable={false}
          style={tab === 'search' ? styles.tabShown : styles.tabHidden}>
          <SearchScreen
            visible={tab === 'search'}
            onPickTrack={play}
            onImportSpotify={importLink}
            onMenu={openSheet}
            onOpenArtist={openArtist}
            onOpenBrowse={pickHomeItem}
            onOpenMenu={openDrawer}
            onOpenCollection={openFromLibrary}
            onOpenAlbum={openAlbumById}
          />
        </View>
        <View
          collapsable={false}
          style={tab === 'library' ? styles.tabShown : styles.tabHidden}>
          <LibraryScreen
            key={libraryNonce}
            visible={tab === 'library'}
            onOpen={openFromLibrary}
            onOpenMenu={openDrawer}
          />
        </View>

        {/* Overlays, innermost last. */}
        {!!collection && (
          <View style={[StyleSheet.absoluteFill, {zIndex: collectionZ}]}>
            <CollectionScreen
              collection={collection}
              loading={collectionLoading}
              onClose={closeCollection}
              // The only play path with a collection behind it, so the only one
              // that can tell the library where playback started. Everything
              // else — search, radio, a tap on Home — passes nothing, which is
              // the honest answer for a queue that came from no collection.
              onPlay={(t, ctx) => {
                // Home's Continue card reopens whatever was played from last.
                rememberCollection(collection);
                play(t, ctx, collectionKey(collection));
              }}
              onMenu={openSheet}
              onOpenAlbum={openAlbumByName}
              onChanged={() => {
                // Downloads stays OPEN and re-reads the folder. Closing it was
                // right for a playlist that was just deleted — there is nothing
                // to go back to — but deleting three songs out of forty is not
                // leaving the screen, and being thrown out of it (onto a list
                // that had not rescanned either) is what made the delete look
                // like it had not worked.
                if (collection.kind === 'downloads') {
                  refreshDownloadsCollection();
                } else {
                  closeCollection();
                }
                setLibraryNonce(n => n + 1);
              }}
            />
          </View>
        )}

        {importAsk && (
          <View style={[StyleSheet.absoluteFill, styles.overPages]}>
            <ImportLinkScreen onImport={importLink} onClose={closeImportAsk} />
          </View>
        )}

        {!!importUrl && (
          <View style={[StyleSheet.absoluteFill, styles.overPages]}>
            <SpotifyImportScreen
              url={importUrl}
              onClose={() => setImportUrl(null)}
              onPlay={play}
            />
          </View>
        )}

        {!!artist && (
          <View style={[StyleSheet.absoluteFill, {zIndex: artistZ}]}>
            <ArtistScreen
              // A fresh page per artist: one opened from another's "Fans
              // also like" kept the last one's scroll and open sections.
              key={artist}
              name={artist}
              songUrl={artistSong}
              songTitle={artistSongTitle}
              onClose={closeArtist}
              onOpenArtist={openArtistFromArtist}
              onPlay={play}
              onMenu={openSheet}
              onToggleFollow={(n, img) =>
                toast(
                  toggleFollow(n, img) ? `Following ${n}` : `Unfollowed ${n}`,
                )
              }
              onOpenAlbum={openAlbumById}
            />
          </View>
        )}
        {/* Settings is an overlay, not a Modal, for the same reason as the
            rest: a Modal floats over the whole window and hid the mini player.
            Here it stays inside the body, so playback controls remain visible. */}
        {settingsOpen && (
          <View style={[StyleSheet.absoluteFill, styles.overPages]}>
            <SettingsScreen
              focus={settingsFocus}
              onClose={() => {
                setSettingsOpen(false);
                // Cleared on the way out, or opening Settings normally next
                // time would scroll to the update again.
                setSettingsFocus(null);
              }}
            />
          </View>
        )}

        {eqOpen && (
          <View style={[StyleSheet.absoluteFill, styles.overPages]}>
            <EqualizerScreen onClose={() => setEqOpen(false)} />
          </View>
        )}

        {langOpen && (
          <View style={[StyleSheet.absoluteFill, styles.overPages]}>
            <LanguagesScreen onClose={closeLanguages} />
          </View>
        )}

        {jamOpen && (
          <View style={[StyleSheet.absoluteFill, styles.overPages]}>
            <JamScreen onClose={closeJam} />
          </View>
        )}
      </Animated.View>

      {/*
        ONE outlet, app-wide.

        There used to be a second inside PlayerScreen, because when the player
        was a Modal it was a separate Dialog window and this one genuinely was
        behind it. The player is a view at zIndex 30 now and the toaster is at
        9999, so this paints OVER it — and both outlets, subscribed to the same
        singleton in toast.ts, were rendering the same message at once.

        All it needs is to clear the player's own transport when the player is
        up, rather than sitting at the mini player's height.
      */}
      <Toaster bottom={playerOpen ? 118 : engine ? 132 : 78} />

      {/*
        The bars FLOAT over the page rather than sitting under it.

        In flow they were the bottom of the layout, which meant nothing was ever
        behind them: the strip either side of the mini player was solid black
        and the tab bar could not be translucent over anything. Out of flow, the
        page runs the full height of the window and passes behind both — which
        is what the translucency and the fade are for, and the only way the
        floating bar reads as floating.

        box-none so a touch that lands in the fade, beside the mini player,
        still reaches the list underneath.

        The cost is that every scrolling surface has to end BOTTOM_INSET above
        the bottom; see src/layout.ts.
      */}
      <Animated.View
        // Out of the way while typing: the window shrinks to above the
        // keyboard, the bars ride up with it, and in the Jam they sat right
        // on the search box and the results under it.
        style={[
          styles.bottomStack,
          barsBehindPlayer,
          keyboardUp && styles.gone,
        ]}
        pointerEvents="box-none">
        <BodyFade />
        {engine && (
          <PlayerBar
            onExpand={expandPlayer}
            onEndExpandDrag={endPlayerDrag}
            onAddToPlaylist={setAddTo}
          />
        )}
        <BottomNav active={tab} onChange={switchTab} />
      </Animated.View>

      {/* The Recap is a full-screen story, so it sits OVER the bars rather
          than in the body under them: the mini player and the tab bar stay
          mounted (the music is untouched) and simply are not seen until it is
          swiped away. */}
      {!!activity && (
        <View style={styles.recap}>
          <RecapScreen onClose={closeRecap} />
        </View>
      )}

      {/* Where every <Sheet> in the app is actually drawn — see Sheet.tsx.
          Mounted after the bars and given a zIndex above the player, so a menu
          raised from any screen covers all of it. */}
      <SheetHost />

      <TrackActionSheet
        track={sheetTrack}
        from={sheetFrom}
        onClose={closeTrackSheet}
        onAddToPlaylist={setAddTo}
        onOpenArtist={openArtistCredit}
        onOpenAlbum={openAlbumOf}
      />

      <AddToPlaylistSheet track={addTo} onClose={closeAddTo} />

      <WrongSongSheet track={wrongFor} onClose={closeWrongSong} />

      <CreditsSheet
        song={creditsFor}
        onClose={closeCredits}
        onPick={pickCreditedArtist}
      />

      {engine && (
        <PlayerScreen
          visible={playerOpen}
          onClose={closePlayer}
          onAddToPlaylist={setAddTo}
          onOpenArtist={openArtistCredit}
          onOpenMenu={openSheet}
        />
      )}

      <UpdateModal
        hidden={!!activity}
        quiet={
          tab !== 'home' ||
          playerOpen ||
          !!collection ||
          collectionLoading ||
          !!artist ||
          !!importUrl ||
          importAsk ||
          settingsOpen ||
          eqOpen ||
          langOpen ||
          jamOpen
        }
      />
      <JamBar hidden={!!activity || jamOpen} onOpen={openJam} />

      {/* Above everything, and the real UI is already mounted and painted
          underneath — so lifting this reveals a finished screen rather than
          starting the loading the user can watch. */}
      {/* Last in the tree and absolutely positioned, so it covers the mini
          player and the bottom nav the way a drawer should — but it is NOT a
          Modal, because a Modal is its own window and cannot be dragged into
          view underneath a gesture that is already in progress. Its position is
          the shared drawerX; see src/drawer.ts.

          Both handlers are stable. Inline arrows here gave the drawer a new
          onClose on every app re-render, which used to re-run its open effect
          and slam the panel back open over the page it had just opened. */}
      <Sidebar
        visible={drawerOpen}
        onClose={closeDrawer}
        onNavigate={navigateFromDrawer}
      />

      {booted && hydrated && !welcomed && <WelcomeScreen />}

      {!booted && (
        <View style={styles.splash} pointerEvents="auto">
          <Splash onPlayed={onSplashPlayed} />
        </View>
      )}
    </SafeAreaView>
  );
}

/**
 * Ask for notifications on Android 13+.
 *
 * The permission is declared in the manifest, which was enough before API 33
 * and is not enough now: from 13 it has to be granted at runtime, and until it
 * is, the media notification never appears. That is not a cosmetic loss — the
 * notification is the visible half of the foreground service, so on a phone
 * with an aggressive battery manager the app looks like a candidate for
 * killing, and there is no lock-screen transport at all.
 *
 * Asked once at boot and never insisted on. A refusal is a legitimate answer;
 * playback still works, and Android will not show the dialog again anyway.
 */
function askForNotifications(): void {
  if (Platform.OS !== 'android' || Number(Platform.Version) < 33) {
    return;
  }
  PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
  ).catch(() => {
    /* the dialog is a courtesy — never let it break the boot path */
  });
}

/** The longest the splash waits for the JS thread to go quiet. */
const SPLASH_QUIET_CAP_MS = 2500;
/** The id of an album page still finding which album its song is on. */
const FINDING_ALBUM = 'finding-album:';

/**
 * Resolves once the JS thread has been idle for a moment: three 100 ms ticks
 * in a row that each fired within 40 ms of when they were due. A busy thread
 * runs timers late, so lateness is the measure. Never waits past `cap`.
 */
function whenQuiet(cap: number): Promise<void> {
  return new Promise(resolve => {
    const end = Date.now() + cap;
    let calm = 0;
    let due = Date.now() + 100;
    const tick = () => {
      const late = Date.now() - due;
      calm = late < 40 ? calm + 1 : 0;
      if (calm >= 3 || Date.now() >= end) {
        resolve();
        return;
      }
      due = Date.now() + 100;
      setTimeout(tick, 100);
    };
    setTimeout(tick, 100);
  });
}

export default function App(): React.JSX.Element {
  return (
    // GestureHandlerRootView must wrap everything that uses a gesture handler
    // (the queue's drag-to-reorder). Without it the handlers mount but never
    // receive touches, so the drag silently does nothing.
    <GestureHandlerRootView style={styles.safe}>
      <ErrorBoundary>
        <Shell />
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}

/**
 * The page dissolving into the bars, instead of meeting a hard edge.
 *
 * It starts ABOVE the mini player and reaches full page colour behind the tab
 * bar, so a row scrolling out of sight fades rather than being cut off by a
 * hairline. Absolutely positioned inside the floating stack and non-interactive,
 * so it costs the content underneath nothing.
 */
function useKeyboardUp(): boolean {
  const [up, setUp] = useState(false);
  useEffect(() => {
    const shown = Keyboard.addListener('keyboardDidShow', () => setUp(true));
    const hidden = Keyboard.addListener('keyboardDidHide', () => setUp(false));
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, []);
  return up;
}

function BodyFade() {
  return (
    <Svg style={styles.bodyFade} pointerEvents="none">
      <Defs>
        <LinearGradient id="bodyfade" x1="0" y1="0" x2="0" y2="1">
          {/* Three stops, not two. A straight ramp put the fade at half
              strength exactly where the mini player is, which greys out the
              artwork either side of it — the part that is meant to show
              through. It stays light past the bar and does its darkening in
              the last third, behind the tabs. */}
          <Stop offset="0" stopColor={C.bg} stopOpacity="0" />
          <Stop offset="0.6" stopColor={C.bg} stopOpacity="0.22" />
          <Stop offset="1" stopColor={C.bg} stopOpacity="0.92" />
        </LinearGradient>
      </Defs>
      <Rect width="100%" height="100%" fill="url(#bodyfade)" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  // Settings, the Equalizer, Languages, Jam and the import screens are drawn
  // over every album, playlist and artist page. Those are layered by the
  // order they were opened (1, 2, 3...), and these had no layer at all, so
  // one opened over a page (the Equalizer from the player, over an album)
  // was drawn under it, and Back closed it unseen.
  overPages: {zIndex: 1000},
  // No background: the window paints the app's black once (styles.xml).
  // Both roots use this style, so a fill here was two extra full-screen
  // layers under everything, every frame.
  safe: {flex: 1},
  body: {flex: 1, zIndex: 0},
  // zIndex AND elevation. Document order alone decides this on iOS; Android
  // resolves overlapping siblings by elevation first, and the mini player
  // inside this layer carries an elevation of its own.
  recap: {...StyleSheet.absoluteFillObject, zIndex: 25, elevation: 25},
  bottomStack: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 20,
    elevation: 20,
  },
  // display none, not unmounted: the mini player keeps its state.
  gone: {display: 'none'},
  // Taller than the bars it sits behind, so the fade begins in open page and
  // is already at full strength by the time it reaches them.
  bodyFade: {position: 'absolute', left: 0, right: 0, bottom: 0, top: -36},
  // Above every overlay: player 30, sheets 40, drawer 45. The splash is the
  // one thing that must cover a half-built app.
  splash: {...StyleSheet.absoluteFillObject, zIndex: 60, backgroundColor: C.bg},
  tabShown: {...StyleSheet.absoluteFillObject},
  tabHidden: {...StyleSheet.absoluteFillObject, display: 'none'},
});
