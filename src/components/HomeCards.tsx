/**
 * Home's cards and the carousel that holds them.
 *
 * Four FeatureCards (the Recap card's exact shape), one row, swiped, with
 * dots under them saying how many there are and which one is showing: Recap,
 * Jam, the Spotify import, and Continue your mix. Each card shows only when it
 * has something to say, and the dots follow. A running, finished-unopened or
 * failed import jumps to the front, so coming back to Home after switching tabs
 * always shows where it got to.
 */
import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
  Animated,
  FlatList,
  Image,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import Svg, {Circle, Path, Rect} from 'react-native-svg';
import {C, S} from '../theme';
import {CARD_PALS, PALS, type Pal} from '../brandArt';
import {CARD_ART, FeatureCard} from './FeatureCard';
import {RecapTeaser} from './RecapTeaser';
import {useJam} from '../jam';
import {
  BAD_LINK,
  cancelImport,
  dismissImport,
  importProblem,
  importSourceName,
  isImportUrl,
  PRIVATE_LIST,
  keepWaiting,
  markImportOpened,
  retryImport,
  saveCancelled,
  useLastImport,
  useSpotifyImport,
} from '../spotifyImport';
import {useLastCollection} from '../lastCollection';
import {usePlaylists} from '../playlists';
import {playlistToCollection, type Collection} from '../collections';
import {toast} from '../toast';
import type {HomeItem} from '../backend';
import {cleanText} from '../tracks';

const JAM_PAL: Pal = CARD_PALS.jam; // lavender
const IMPORT_PAL: Pal = CARD_PALS.import; // lime
const CONTINUE_PAL: Pal = CARD_PALS.continue; // sky
const PROBLEM_PAL: Pal = PALS[6]; // orange: something needs you

const M = CARD_ART / 2;

type W = {width?: number};

export function JamCard({onOpen, width}: {onOpen: () => void} & W) {
  const jam = useJam();
  const p = JAM_PAL;
  const listening = jam ? Math.max(1, jam.members.length) : 0;
  return (
    <FeatureCard
      pal={p}
      width={width}
      kicker={
        jam
          ? `In a Jam, ${listening} ${listening === 1 ? 'phone' : 'phones'} listening`
          : 'Listen together'
      }
      title={jam ? jam.code : 'Play the same song with friends'}
      action={jam ? 'Open Jam' : 'Start a Jam'}
      onPress={onOpen}
      art={
        <Svg width={CARD_ART} height={CARD_ART}>
          {[0, 1, 2, 3].map(i => (
            <Circle
              key={i}
              cx={M + 8}
              cy={M - 4}
              r={26 + i * 18}
              fill="none"
              stroke={p.ink}
              strokeWidth={3}
              opacity={0.5 - i * 0.1}
            />
          ))}
          <Circle cx={M - 14} cy={M - 14} r={20} fill={p.a} />
          <Circle cx={M + 16} cy={M - 10} r={20} fill={p.b} />
          <Circle cx={M} cy={M + 16} r={20} fill={p.c} />
        </Svg>
      }
    />
  );
}

const listArt = (p: Pal) => (
  <Svg width={CARD_ART} height={CARD_ART}>
    <Circle cx={M} cy={M} r={46} fill={p.ink} />
    {[0, 1, 2].map(i => (
      <Rect
        key={i}
        x={M - 24}
        y={M - 16 + i * 14}
        width={i === 2 ? 26 : 40}
        height={6}
        rx={3}
        fill={p.bg}
      />
    ))}
    <Path
      d={`M${M + 12},${M + 10} l12,0 m-5,-6 l6,6 l-6,6`}
      stroke={p.bg}
      strokeWidth={5}
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  </Svg>
);

type ImportPhase = 'running' | 'slow' | 'cancelled' | 'failed' | 'done' | 'ask';

/** Which state the import card is in. There is always one: the card stays on
 *  Home for good, asking for a link when nothing else is going on. */
export function useImportPhase(): ImportPhase {
  const job = useSpotifyImport();
  const last = useLastImport();
  if (job.url && job.cancelled) {
    return 'cancelled';
  }
  if (job.url && !job.finished && !job.error) {
    return job.stalled ? 'slow' : 'running';
  }
  if (job.url && (job.error || (job.finished && job.matched <= 0))) {
    return 'failed';
  }
  if (last && !last.opened) {
    return 'done';
  }
  return 'ask';
}

/** The filled pill and the outlined one, inside a card of palette `p`. */
function Pill({p, label, onPress}: {p: Pal; label: string; onPress: () => void}) {
  return (
    <TouchableOpacity
      style={[styles.go, {backgroundColor: p.ink}]}
      onPress={onPress}
      accessibilityRole="button">
      <Text style={[styles.goText, {color: p.bg}]}>{label}</Text>
    </TouchableOpacity>
  );
}

function Ghost({p, label, onPress}: {p: Pal; label: string; onPress: () => void}) {
  return (
    <TouchableOpacity
      style={[styles.ghost, {borderColor: p.ink}]}
      onPress={onPress}
      accessibilityRole="button">
      <Text style={[styles.goText, {color: p.ink}]}>{label}</Text>
    </TouchableOpacity>
  );
}

function Close({
  p,
  onPress,
  label = 'Close',
}: {
  p: Pal;
  onPress: () => void;
  label?: string;
}) {
  return (
    <TouchableOpacity
      style={[styles.x, {borderColor: p.ink}]}
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}>
      <Text style={[styles.xText, {color: p.ink}]}>✕</Text>
    </TouchableOpacity>
  );
}

/** A bar that sweeps while there is nothing to count yet. */
function WarmBar() {
  const x = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(x, {toValue: 1, duration: 1600, useNativeDriver: true}),
    );
    loop.start();
    return () => loop.stop();
  }, [x]);
  const translateX = x.interpolate({inputRange: [0, 1], outputRange: [-110, 330]});
  return (
    <View style={styles.bar}>
      <Animated.View style={[styles.warmFill, {transform: [{translateX}]}]} />
    </View>
  );
}

export function ImportCard({
  onImport,
  onOpenImport,
  onOpenCollection,
  width,
}: {
  onImport: (url: string) => void;
  onOpenImport: (url: string) => void;
  onOpenCollection: (c: Collection) => void;
} & W) {
  const phase = useImportPhase();
  const job = useSpotifyImport();
  const last = useLastImport();
  const playlists = usePlaylists();
  const [open, setOpen] = useState(false);
  const [link, setLink] = useState('');
  const submit = () => {
    const url = link.trim();
    if (!isImportUrl(url)) {
      toast("That isn't a Spotify or YouTube playlist link");
      return;
    }
    setLink('');
    setOpen(false);
    onImport(url);
  };
  const close = () => {
    setOpen(false);
    setLink('');
  };
  const cancel = () => {
    cancelImport().catch(() => {});
  };
  const another = () => {
    dismissImport();
    setOpen(true);
  };

  if (phase === 'running') {
    const counting = job.total > 0 && job.done > 0;
    const pct = counting ? Math.max(4, (job.done / job.total) * 100) : 0;
    return (
      <FeatureCard
        pal={IMPORT_PAL}
        width={width}
        kicker={`Importing from ${importSourceName(job.url)}, keep browsing`}
        title={job.name || 'Reading the playlist'}
        action="See progress"
        onPress={() => job.url && onOpenImport(job.url)}
        spin={false}
        corner={<Close p={IMPORT_PAL} onPress={cancel} label="Cancel import" />}>
        <View>
          <View style={styles.counts}>
            {counting ? (
              <>
                <Text style={styles.count}>{`${job.done} of ${job.total} checked`}</Text>
                <Text style={styles.count}>{`${job.matched} found`}</Text>
              </>
            ) : (
              <Text style={styles.count}>
                {job.total ? `Looking for ${job.total} songs` : 'Getting the song list'}
              </Text>
            )}
          </View>
          {counting ? (
            <View style={styles.bar}>
              <View style={[styles.barFill, {width: `${pct}%`}]} />
            </View>
          ) : (
            <WarmBar />
          )}
        </View>
      </FeatureCard>
    );
  }

  if (phase === 'slow') {
    return (
      <FeatureCard
        pal={PROBLEM_PAL}
        width={width}
        kicker={
          job.total
            ? `Still importing, ${job.done} of ${job.total} checked`
            : 'Still importing'
        }
        title="Taking longer than usual"
        action="Keep waiting"
        onPress={keepWaiting}
        spin={false}>
        <View style={styles.row}>
          <Pill p={PROBLEM_PAL} label="Keep waiting" onPress={keepWaiting} />
          <Ghost p={PROBLEM_PAL} label="Cancel" onPress={cancel} />
        </View>
      </FeatureCard>
    );
  }

  if (phase === 'cancelled') {
    const n = job.tracks.length;
    const save = `Save ${n} ${n === 1 ? 'song' : 'songs'}`;
    return (
      <FeatureCard
        pal={IMPORT_PAL}
        width={width}
        kicker={`Import cancelled, ${n} of ${job.total} found`}
        title={job.name || `${importSourceName(job.url)} playlist`}
        action={save}
        onPress={saveCancelled}
        spin={false}>
        <View style={styles.row}>
          <Pill p={IMPORT_PAL} label={save} onPress={saveCancelled} />
          <Ghost p={IMPORT_PAL} label="Discard" onPress={dismissImport} />
        </View>
      </FeatureCard>
    );
  }

  if (phase === 'failed') {
    const none = !job.error && job.matched <= 0;
    // A wrong link, or a private list, fails the same way every time; only
    // "another link" helps.
    const canRetry = job.error !== BAD_LINK && job.error !== PRIVATE_LIST;
    return (
      <FeatureCard
        pal={PROBLEM_PAL}
        width={width}
        kicker={
          none && job.total
            ? `Could not import, 0 of ${job.total} found`
            : 'Could not import'
        }
        title={importProblem(job.error, job.matched) || 'Something went wrong'}
        action={canRetry ? 'Try again' : 'Another link'}
        onPress={canRetry ? retryImport : another}
        spin={false}>
        <View style={styles.row}>
          {canRetry && <Pill p={PROBLEM_PAL} label="Try again" onPress={retryImport} />}
          <Ghost p={PROBLEM_PAL} label="Another link" onPress={another} />
          <Close p={PROBLEM_PAL} onPress={dismissImport} />
        </View>
      </FeatureCard>
    );
  }

  if (phase === 'done' && last) {
    const openIt = () => {
      const pl = playlists.find(x => x.id === last.playlistId);
      markImportOpened();
      if (pl) {
        onOpenCollection(playlistToCollection(pl));
      }
    };
    return (
      <FeatureCard
        pal={IMPORT_PAL}
        width={width}
        kicker={
          last.kept
            ? `Imported, ${last.kept} kept from YouTube`
            : 'Imported, saved to Your Library'
        }
        title={last.name}
        action="Open playlist"
        onPress={openIt}
        spin={false}>
        <View style={styles.row}>
          <Pill p={IMPORT_PAL} label="Open playlist" onPress={openIt} />
          <Text style={styles.count}>{`${last.found} of ${last.total} songs`}</Text>
        </View>
      </FeatureCard>
    );
  }

  // Ask: a link box on demand, with a way out. After an import it says what
  // came in last and asks for another.
  const p = IMPORT_PAL;
  return (
    <FeatureCard
      pal={p}
      width={width}
      kicker={
        last
          ? `Last import: ${last.name}, ${last.found} songs`
          : 'Moving from Spotify or YouTube?'
      }
      title={last ? 'Bring another playlist' : 'Bring your playlists'}
      action="Paste a link"
      onPress={() => setOpen(true)}
      art={listArt(p)}
      spin={false}>
      {open ? (
        <View style={styles.row}>
          <TextInput
            value={link}
            onChangeText={setLink}
            placeholder="Spotify or YouTube playlist link"
            placeholderTextColor="rgba(17,16,20,0.45)"
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="go"
            onSubmitEditing={submit}
            style={[styles.paste, {borderColor: p.ink, color: p.ink}]}
          />
          <Pill p={p} label="Import" onPress={submit} />
          <Close p={p} onPress={close} />
        </View>
      ) : undefined}
    </FeatureCard>
  );
}

export function ContinueCard({
  onOpen,
  starter,
  onOpenStarter,
  width,
}: {
  onOpen: (c: Collection) => void;
  /** Offered before anything has been played: a chart from Home. */
  starter?: HomeItem;
  onOpenStarter: (item: HomeItem) => void;
} & W) {
  const last = useLastCollection();
  const p = CONTINUE_PAL;
  if (!last) {
    return (
      <FeatureCard
        pal={p}
        width={width}
        kicker="Start here, the top chart"
        title={cleanText(starter?.name || starter?.title) || 'Loading the charts'}
        action="Open playlist"
        onPress={() => starter && onOpenStarter(starter)}
        spin={false}
        art={
          starter?.image ? (
            <View style={styles.stack}>
              <View style={[styles.cover, styles.coverOne]}>
                <Image source={{uri: starter.image}} style={styles.coverImg} />
              </View>
            </View>
          ) : undefined
        }
      />
    );
  }
  const what =
    last.kind === 'album'
      ? `Album${last.artist ? `, ${last.artist}` : ''}`
      : last.kind === 'liked'
      ? 'Your liked songs'
      : last.kind === 'downloads'
      ? 'Your downloads'
      : 'Playlist';
  return (
    <FeatureCard
      pal={p}
      width={width}
      kicker={`Carry on with · ${what}`}
      title={last.name}
      action={last.kind === 'album' ? 'Open album' : 'Open playlist'}
      onPress={() => onOpen(last)}
      spin={false}
      art={
        <View style={styles.stack}>
          {(last.covers.length ? last.covers : [null]).map((uri, i, all) => (
            <View
              key={`${uri}-${i}`}
              style={[
                styles.cover,
                {
                  right: 34 + (all.length - 1 - i) * 26,
                  transform: [{rotate: `${(i - (all.length - 1) / 2) * 8}deg`}],
                },
              ]}>
              {uri ? (
                <Image source={{uri}} style={styles.coverImg} />
              ) : (
                <View style={[styles.coverImg, {backgroundColor: p.b}]} />
              )}
            </View>
          ))}
        </View>
      }
    />
  );
}

/**
 * The four cards in one swiped row, with dots. Only the cards with something
 * to say are in it; a live, finished or failed import leads.
 */
export function HomeCardCarousel({
  onOpenRecap,
  onOpenJam,
  onImport,
  onOpenImport,
  onOpenCollection,
  starter,
  onOpenStarter,
}: {
  starter?: HomeItem;
  onOpenStarter: (item: HomeItem) => void;
  onOpenRecap: () => void;
  onOpenJam: () => void;
  onImport: (url: string) => void;
  onOpenImport: (url: string) => void;
  onOpenCollection: (c: Collection) => void;
}) {
  const {width: screen} = useWindowDimensions();
  const cardW = screen - 2 * S.gutter;
  const step = cardW + CARD_GAP;
  const importPhase = useImportPhase();
  const [page, setPage] = useState(0);

  // All four, always, in this order; an import with news (running, slow,
  // failed, cancelled, just done) moves to the front while it needs you.
  const keys = useMemo(
    () =>
      importPhase === 'ask'
        ? ['recap', 'jam', 'import', 'continue']
        : ['import', 'recap', 'jam', 'continue'],
    [importPhase],
  );

  const render = (k: string) => {
    switch (k) {
      case 'recap':
        return <RecapTeaser onOpen={onOpenRecap} width={cardW} />;
      case 'jam':
        return <JamCard onOpen={onOpenJam} width={cardW} />;
      case 'import':
        return (
          <ImportCard
            onImport={onImport}
            onOpenImport={onOpenImport}
            onOpenCollection={onOpenCollection}
            width={cardW}
          />
        );
      default:
        return (
          <ContinueCard
            onOpen={onOpenCollection}
            starter={starter}
            onOpenStarter={onOpenStarter}
            width={cardW}
          />
        );
    }
  };

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const p = Math.round(e.nativeEvent.contentOffset.x / step);
    if (p !== page) {
      setPage(p);
    }
  };

  return (
    <View style={styles.carousel}>
      <FlatList
        horizontal
        data={keys}
        keyExtractor={k => k}
        renderItem={({item}) => render(item)}
        showsHorizontalScrollIndicator={false}
        snapToInterval={step}
        snapToAlignment="start"
        decelerationRate="fast"
        disableIntervalMomentum
        onScroll={onScroll}
        scrollEventThrottle={32}
        contentContainerStyle={styles.carouselList}
        keyboardShouldPersistTaps="handled"
      />
      {keys.length > 1 && (
        <View style={styles.dots} accessibilityLabel={`Card ${page + 1} of ${keys.length}`}>
          {keys.map((k, i) => (
            <View key={k} style={[styles.dot, i === Math.min(page, keys.length - 1) && styles.dotOn]} />
          ))}
        </View>
      )}
    </View>
  );
}

const CARD_GAP = 10;

const styles = StyleSheet.create({
  carousel: {paddingTop: 4, paddingBottom: 6},
  carouselList: {paddingHorizontal: S.gutter, gap: CARD_GAP},
  dots: {flexDirection: 'row', justifyContent: 'center', gap: 5, marginTop: -2},
  dot: {width: 6, height: 6, borderRadius: 3, backgroundColor: '#3a3a40'},
  dotOn: {width: 18, backgroundColor: C.text},
  row: {flexDirection: 'row', alignItems: 'center', gap: 8},
  paste: {
    flex: 1,
    minWidth: 0,
    height: 36,
    borderWidth: 1.5,
    borderRadius: 999,
    paddingHorizontal: 12,
    fontSize: 13,
  },
  go: {borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8},
  goText: {fontSize: 13.5, fontWeight: '800'},
  x: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  xText: {fontSize: 15, fontWeight: '800'},
  ghost: {
    borderRadius: 999,
    borderWidth: 1.5,
    paddingHorizontal: 13,
    paddingVertical: 6.5,
  },
  warmFill: {width: 110, height: '100%', borderRadius: 3, backgroundColor: '#111014'},
  counts: {flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6},
  count: {color: '#111014', fontSize: 12.5, fontWeight: '800'},
  bar: {
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(17,16,20,0.2)',
    overflow: 'hidden',
  },
  barFill: {height: '100%', borderRadius: 3, backgroundColor: '#111014'},
  stack: {width: CARD_ART, height: CARD_ART},
  cover: {
    position: 'absolute',
    top: 56,
    width: 70,
    height: 70,
    borderRadius: 8,
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: {width: 0, height: 4},
  },
  coverImg: {width: 70, height: 70, borderRadius: 8},
  coverOne: {right: 34, transform: [{rotate: '6deg'}]},
});
