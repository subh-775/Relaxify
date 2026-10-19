import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  Animated,
  AppState,
  FlatList,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {C, S, T} from '../theme';
import {
  getHome,
  waitForBackend,
  type HomeItem,
  type HomeRow,
  type Track,
} from '../backend';
import {Doodle} from '../components/Doodle';
import {useRecentlyPlayed} from '../recentlyPlayed';
import {upgradeArtwork} from '../tracks';
import {createStore, asArray, useStoreValue} from '../storage';
import {MenuMark} from '../components/MenuMark';
import {HomeGrids} from '../components/HomeGrids';
import {
  RETURN_MS,
  openDiscover,
  trendingStandIn,
  useDiscover,
} from '../discover';
import {HomeCardCarousel} from '../components/HomeCards';
import {shapedRow} from '../components/HomeRows';
import type {Collection} from '../collections';
import {BOTTOM_INSET, HOME_CARD, HOME_CARD_RADIUS} from '../layout';
import {useListEnd} from '../components/UpdateModal';
import {homeLanguageParam, useSettings} from '../store';
import {checkOnline, useOffline} from '../offline';
import {OfflineScreen} from '../components/OfflineScreen';
import {LanguageDial} from '../components/LanguageDial';
import {FollowedShelf} from '../components/FollowedShelf';

/**
 * Last Home rows, persisted. Showing these instantly on the next launch is
 * what replaces the "Starting the music engine…" wait with actual content —
 * the backend still warms up behind them and the fresh rows swap in when
 * ready, but the user never stares at a spinner.
 *
 * CAPPED, on the way in as well as on the way out. Uncapped, this grew with
 * whatever the backend chose to return — every row, every item, each carrying
 * a full `artwork_urls` map — and the whole blob was JSON.parse'd on the JS
 * thread during every cold start, before the first frame, getting slower as
 * the catalogue behind it got richer. It is a render cache for the top of one
 * screen: it does not need to be the whole payload, and everything below the
 * fold has been replaced by fresh data before anyone can scroll to it.
 *
 * Only what is PERSISTED is trimmed. What is on screen stays whole.
 */
const CACHE_ROWS = 4;
const CACHE_ITEMS_PER_ROW = 12;

const trimForCache = (rows: HomeRow[]): HomeRow[] =>
  rows
    .filter(r => r && Array.isArray(r.items))
    .slice(0, CACHE_ROWS)
    .map(r => ({...r, items: r.items.slice(0, CACHE_ITEMS_PER_ROW)}));

const homeCache = createStore<HomeRow[]>('mp.homeRows.v1', [], raw =>
  trimForCache(asArray<HomeRow>(raw)),
);

/** How many covers of the top rows count as "the first screenful". */
const FIRST_ROWS = 2;
const FIRST_ITEMS = 4;
/** The most the splash waits on them; slow pictures then fill in as before. */
const FIRST_COVERS_MS = 1500;

/** Pull the top rows' covers into the image cache, the same URLs the rows
 *  draw, so they are on screen the moment the splash lifts. */
function prefetchFirstCovers(rows: HomeRow[]): Promise<unknown> {
  const urls = rows
    .filter(r => r.items?.length)
    .slice(0, FIRST_ROWS)
    .flatMap(r => r.items.slice(0, FIRST_ITEMS))
    .map(i => (i.image ? upgradeArtwork(i.image) : ''))
    .filter(Boolean);
  return Promise.race([
    Promise.all(urls.map(u => Image.prefetch(u).catch(() => false))),
    new Promise(r => setTimeout(r, FIRST_COVERS_MS)),
  ]);
}

type Props = {
  onPickTrack: (item: HomeItem) => void;
  onPlayTrack: (track: Track, context?: Track[]) => void;
  onOpenMenu: () => void;
  /** Home has something to show — the app lifts its splash on this. */
  onReady?: () => void;
  /** Open the Recap, from the teaser card. */
  onOpenRecap?: () => void;
  /** Open the Jam screen, from the Jam card. */
  onOpenJam?: () => void;
  /** Open an import's progress, from the import card. */
  onImportSpotify?: (url: string) => void;
  /** Ask for a playlist link, from the import card. */
  onAskImport?: () => void;
  /** Open a playlist or album, from the Continue and import cards. */
  onOpenCollection?: (c: Collection) => void;
  /** Open an album by name, artist and JioSaavn id (From artists you love). */
  onOpenAlbum?: (name: string, artist: string, albumId: string) => void;
  /** Whether the Home tab is the one on screen. The tab stays mounted when
   *  you leave it, so this is the only signal that you came back — the
   *  doodle only animates while you are here. */
  visible: boolean;
};

/**
 * Virtualisation for the OUTER list.
 *
 * Not TrackRow's `listWindowing`: these items are whole carousels, each holding
 * ~10 cards with remote images, so three of them is already more than a screen
 * and twelve would be the entire page mounted at once — which is exactly what
 * the ScrollView this replaces was doing.
 *
 * `removeClippedSubviews` is deliberately NOT set. Virtualisation
 * (windowSize/initialNumToRender) is what actually unmounts the off-screen
 * rows, and it does so in JS where it is predictable; removeClippedSubviews is
 * a separate native detach that has a long history of blanking content inside
 * nested horizontal lists, which is precisely what every row here is.
 */
const HOME_WINDOWING = {
  initialNumToRender: 3,
  maxToRenderPerBatch: 2,
  windowSize: 5,
} as const;

/**
 * Memoised, and this is not a micro-optimisation.
 *
 * App holds twenty-odd useState hooks in ONE component, and all three tab
 * screens, the full player, the mini player and the drawer are its children —
 * so opening a sheet, closing an overlay or touching any of them re-rendered
 * every one of these trees. That is what "the app freezes for a moment" was:
 * not work being done, but work being redone. Every prop below is
 * useCallback-stable in App, so this actually holds.
 */
export const HomeScreen = React.memo(function HomeScreen({
  onPickTrack,
  onPlayTrack,
  onOpenMenu,
  onReady,
  onOpenRecap,
  onOpenJam,
  onImportSpotify,
  onAskImport,
  onOpenCollection,
  onOpenAlbum,
  visible,
}: Props) {
  const recent = useRecentlyPlayed();
  const discover = useDiscover();
  // Room for the update strip too, while it is up.
  const listEnd = useListEnd();
  // Subscribed, so cached rows appear the moment disk hydration finishes even
  // if that lands after first render.
  const cachedRows = useStoreValue(homeCache);
  const [fresh, setFresh] = useState<HomeRow[] | null>(null);
  const [error, setError] = useState('');

  const allRows = fresh ?? cachedRows;
  // Empty rows used to render as null inside the ScrollView. As list DATA they
  // would each cost a cell for nothing, and they throw the windowing counts off.
  const rows = useMemo(() => allRows.filter(r => !!r.items?.length), [allRows]);
  // Before anything has been played, the Continue card offers the top chart
  // in the chosen languages instead of disappearing.
  const starter = useMemo(() => {
    const charts = rows.find(r => r.title === 'Charts')?.items ?? [];
    const all = [...charts, ...rows.flatMap(r => r.items)];
    return all.find(i => i.type === 'playlist' && !!i.perma_url);
  }, [rows]);
  const phase: 'boot' | 'ready' | 'error' = allRows.length
    ? 'ready'
    : error
    ? 'error'
    : 'boot';

  /** The first load has finished, fresh rows or not. */
  const [settled, setSettled] = useState(false);
  /** New languages picked, their rows not in yet. */
  const [tuning, setTuning] = useState(false);
  /** The latest load: an older one finishing late must not land. */
  const lastLoad = useRef(0);

  const load = useCallback(async () => {
    const n = ++lastLoad.current;
    setError('');
    try {
      if (!(await waitForBackend())) {
        throw new Error('The music engine did not start.');
      }
      const data = await getHome(homeLanguageParam());
      if (!data.length) {
        checkOnline().catch(() => {});
      }
      if (data.length) {
        // The first screenful's covers, before the rows are shown, so the
        // page arrives drawn rather than filling in picture by picture.
        await prefetchFirstCovers(data);
        if (n !== lastLoad.current) {
          return;
        }
        setFresh(data);
        homeCache.set(trimForCache(data)); // seed the next launch
      }
    } catch (e) {
      // Offline shows its own screen, even over cached rows.
      checkOnline().catch(() => {});
      // Only surface the error if there's nothing on screen — a failed refresh
      // behind cached rows should stay silent.
      if (!homeCache.get().length) {
        setError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      if (n === lastLoad.current) {
        setSettled(true);
        setTuning(false);
      }
    }
  }, []);

  // Again whenever the languages change (Settings, or the welcome), and when
  // the internet comes back.
  const langs = useSettings().homeLanguages.join(',');
  const offline = useOffline();
  const loadedLangs = useRef(langs);
  useEffect(() => {
    if (!offline) {
      setTuning(langs !== loadedLangs.current);
      loadedLangs.current = langs;
      load();
    }
  }, [load, langs, offline]);

  // An open of the app is a new Discover set (see src/discover.ts), and so is
  // coming back to it after RETURN_MS away: the playback service keeps the
  // app alive for days, and Home, mounted the whole time, never re-asked for
  // its rows either. Both are cheap when nothing changed: the rows come from
  // the engine's cache, and Discover's next set was built last time.
  useEffect(() => {
    openDiscover();
    let away = 0;
    const sub = AppState.addEventListener('change', next => {
      if (next !== 'active') {
        away = away || Date.now();
        return;
      }
      if (away && Date.now() - away >= RETURN_MS) {
        openDiscover();
        load();
      }
      away = 0;
    });
    return () => sub.remove();
  }, [load]);

  // Discover's stand-in until it has a set of its own (see discover.ts).
  const trending = useMemo(() => trendingStandIn(rows), [rows]);

  // The rows the languages change (Charts on) dim while the new ones load,
  // and come back up with them, instead of snapping over.
  const dim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.timing(dim, {
      toValue: tuning ? 0.35 : 1,
      duration: tuning ? 150 : 300,
      useNativeDriver: true,
    }).start();
  }, [tuning, dim]);
  const chartsAt = rows.findIndex(r => r.title.trim().toLowerCase() === 'charts');

  // Claiming the left strip back from Android's system back gesture happens in
  // onLayout, below — NOT here. Home mounts while the splash is still up, and
  // the exclusion rect is measured from the decor view's height, which at that
  // point is routinely 0. A zero-height rect excludes nothing, so Android kept
  // the strip and ate the swipe. The view outlives every re-layout; the
  // MEASUREMENT taken from it does not.

  // Tell the app once the FRESH rows are in (or have definitely failed), not
  // as soon as last launch's cached rows are: the fresh ones used to land
  // seconds after the splash lifted and redraw the whole page, pictures and
  // all, under a hand that was already scrolling and swiping. The splash
  // stays up until then (App caps the wait), so Home is never seen mid-load.
  useEffect(() => {
    if (settled || phase === 'error') {
      onReady?.();
    }
  }, [settled, phase, onReady]);

  if (offline && onOpenCollection) {
    return <OfflineScreen onOpenCollection={onOpenCollection} />;
  }

  if (phase === 'error') {
    return (
      <View style={styles.center}>
        <Text style={styles.errText}>{error}</Text>
        <TouchableOpacity style={styles.retry} onPress={() => load()}>
          <Text style={styles.retryText}>Try again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  /**
   * Everything above the content rows that SCROLLS with them.
   *
   * An element rather than a component: React reconciles it by type, so it
   * re-renders in place instead of remounting — passing an inline arrow as
   * ListHeaderComponent is what tears the Recents grid down and rebuilds it
   * on every parent render.
   *
   * The mark and the doodle are not in here: they are pinned above the list
   * (see the render below), as the title rows of Search and Your Library are.
   */
  const header = (
    <>
      {/* The cards, one shape, one swiped row with dots (HomeCards). */}
      {onOpenRecap && onOpenJam && onImportSpotify && onAskImport && onOpenCollection && (
        <HomeCardCarousel
          onOpenRecap={onOpenRecap}
          onOpenJam={onOpenJam}
          onAskImport={onAskImport}
          onOpenImport={onImportSpotify}
          onOpenCollection={onOpenCollection}
          starter={starter}
          onOpenStarter={onPickTrack}
        />
      )}
      {/* Discover, then Recents: nine songs each, swiped, with dots. */}
      <HomeGrids
        discover={discover.length ? discover : trending}
        recent={recent}
        onPlay={onPlayTrack}
      />
    </>
  );

  return (
    <View style={styles.fill}>
      {/*
      A FlatList, not a ScrollView.

      A ScrollView renders every child immediately and keeps them all
      mounted — and every child here is a horizontal FlatList of cards with
      remote images. The whole of Home, however far down it went, was being
      built and held on the first frame. Virtualised, the rows below the fold
      do not mount their cards until you scroll to them.
    */}
      {/* Pinned: the doodle stays put while the page scrolls under it, cut
          off in a straight line. The mark sits over the doodle's left end,
          where each one leaves room: the drawer slides in from the left, so
          its handle belongs there. */}
      <View>
        <Doodle visible={visible} />
        <View style={styles.mark} pointerEvents="box-none">
          {/* The mark IS the menu button — see MenuMark. */}
          <MenuMark onPress={onOpenMenu} />
        </View>
      </View>
      <FlatList
        data={rows}
        keyExtractor={row => row.title}
        extraData={tuning}
        renderItem={({item, index}) => (
          <>
            {/* The language dial above the rows it changes. */}
            {index === chartsAt && <LanguageDial busy={tuning} />}
            <Animated.View
              style={chartsAt >= 0 && index >= chartsAt && {opacity: dim}}>
              <Row row={item} onPick={onPickTrack} />
            </Animated.View>
            {/* Your artists' newest, between New releases and Charts. */}
            {item.title.trim().toLowerCase() === 'new releases' && (
              <FollowedShelf
                onPlay={onPlayTrack}
                onOpenAlbum={onOpenAlbum}
              />
            )}
          </>
        )}
        contentContainerStyle={[styles.scroll, listEnd]}
        showsVerticalScrollIndicator={false}
        overScrollMode="never"
        bounces={false}
        ListHeaderComponent={header}
        ListFooterComponent={<View style={styles.tail} />}
        {...HOME_WINDOWING}
      />
    </View>
  );
});

function Row({row, onPick}: {row: HomeRow; onPick: (i: HomeItem) => void}) {
  if (!row.items?.length) {
    return null;
  }
  // Trending, New releases, Charts and Top playlists each have their own
  // shape (HomeRows); anything else is the plain strip below.
  const Shaped = shapedRow(row.title);
  if (Shaped) {
    return <Shaped row={row} onPick={onPick} />;
  }
  return (
    <View style={styles.row}>
      <Text style={styles.rowTitle}>{row.title}</Text>
      <FlatList
        horizontal
        data={row.items}
        // Stable per card. Index-based keys meant any refresh that shifted the
        // row re-keyed every card after it, remounting each one and throwing
        // away its decoded <Image> — which is the artwork flash on refresh.
        keyExtractor={item =>
          item.perma_url || `${item.type}|${item.title || item.name}`
        }
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.rowList}
        {...SNAP}
        renderItem={({item}) => <Card item={item} onPick={onPick} />}
      />
    </View>
  );
}

function Card({item, onPick}: {item: HomeItem; onPick: (i: HomeItem) => void}) {
  const label = item.title || item.name || 'Untitled';
  // Playlists/albums read better as circles-vs-squares? No — keep one shape so
  // a row of mixed types stays visually even; the subtitle says what it is.
  return (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.7}
      onPress={() => onPick(item)}>
      <View style={styles.artWrap}>
        {item.image ? (
          <Image
            source={{uri: upgradeArtwork(item.image)}}
            style={styles.art}
          />
        ) : (
          <View style={[styles.art, styles.artFallback]} />
        )}
      </View>
      <Text style={styles.cardTitle} numberOfLines={2}>
        {label}
      </Text>
      {!!item.subtitle && (
        <Text style={styles.cardSub} numberOfLines={1}>
          {item.subtitle}
        </Text>
      )}
    </TouchableOpacity>
  );
}

const CARD = HOME_CARD;

/**
 * Every row comes to rest with a card on the page margin.
 *
 * Without it a fling stopped wherever momentum ran out, so one row sat with a
 * half card at the left edge and the next with a gap — the rows no longer
 * lined up with the grid above them or with each other. One card plus one gap
 * per step: with the list's own S.gutter padding, step k puts card k exactly
 * at the gutter, the same line the section titles start on.
 */
const SNAP = {
  snapToInterval: CARD + S.gap,
  snapToAlignment: 'start',
  decelerationRate: 'fast',
} as const;

const styles = StyleSheet.create({
  fill: {flex: 1},
  // The bars at the foot of the app float OVER the page now, so a list has to
  // end above them or its last row is permanently behind one. See src/layout.ts.
  scroll: {paddingBottom: BOTTOM_INSET},
  // Over the doodle's left end, centred on its height, at the gutter the
  // marks on Search and Your Library use. flex-start keeps the button the
  // logo's size: stretched, it covered the doodle and swallowed its taps.
  mark: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'flex-start',
    paddingLeft: S.gutter,
  },
  title: {
    ...T.screenTitle,
    color: C.text,
    paddingHorizontal: S.gutter,
    paddingTop: 8,
    paddingBottom: 4,
  },
  row: {marginTop: 22},
  rowTitle: {
    ...T.section,
    color: C.text,
    paddingHorizontal: S.gutter,
    marginBottom: 12,
  },
  rowList: {paddingHorizontal: S.gutter, gap: S.gap},
  card: {width: CARD},
  artWrap: {
    borderRadius: HOME_CARD_RADIUS,
    overflow: 'hidden',
    backgroundColor: C.surface,
  },
  art: {width: CARD, height: CARD},
  artFallback: {backgroundColor: C.surfaceHi},
  cardTitle: {...T.cardTitle, color: C.text, marginTop: 8},
  cardSub: {...T.cardSub, color: C.sub, marginTop: 2},
  center: {flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14},
  errText: {
    color: C.danger,
    fontSize: 13.5,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  retry: {
    backgroundColor: C.accent,
    paddingHorizontal: 22,
    paddingVertical: 10,
    borderRadius: 999,
  },
  retryText: {color: C.bg, fontWeight: '700', fontSize: 13},
  tail: {height: 8},
});
