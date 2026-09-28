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
import React, {useMemo, useState} from 'react';
import {
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
  dismissImport,
  importProblem,
  isSpotifyUrl,
  markImportOpened,
  useImportedOnce,
  useLastImport,
  useSpotifyImport,
} from '../spotifyImport';
import {useLastCollection} from '../lastCollection';
import {usePlaylists} from '../playlists';
import {playlistToCollection, type Collection} from '../collections';
import {toast} from '../toast';

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

/** Which state the import card is in, or null when it has nothing to say. */
export function useImportPhase():
  | 'running'
  | 'failed'
  | 'done'
  | 'ask'
  | null {
  const job = useSpotifyImport();
  const last = useLastImport();
  const importedOnce = useImportedOnce();
  if (job.url && !job.finished && !job.error) {
    return 'running';
  }
  if (job.url && (job.error || (job.finished && job.matched <= 0))) {
    return 'failed';
  }
  if (last && !last.opened) {
    return 'done';
  }
  return importedOnce ? null : 'ask';
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
  if (!phase) {
    return null;
  }
  const submit = () => {
    const url = link.trim();
    if (!isSpotifyUrl(url)) {
      toast("That isn't a Spotify playlist or album link");
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

  if (phase === 'running') {
    const pct = job.total > 0 ? Math.max(4, (job.done / job.total) * 100) : 6;
    return (
      <FeatureCard
        pal={IMPORT_PAL}
        width={width}
        kicker="Importing from Spotify, keep browsing"
        title={job.name || 'Reading the playlist'}
        action="See progress"
        onPress={() => job.url && onOpenImport(job.url)}
        spin={false}>
        <View>
          <View style={styles.counts}>
            <Text style={styles.count}>
              {job.total ? `${job.done} of ${job.total} checked` : 'Starting'}
            </Text>
            <Text style={styles.count}>{`${job.matched} found`}</Text>
          </View>
          <View style={styles.bar}>
            <View style={[styles.barFill, {width: `${pct}%`}]} />
          </View>
        </View>
      </FeatureCard>
    );
  }

  if (phase === 'failed') {
    return (
      <FeatureCard
        pal={PROBLEM_PAL}
        width={width}
        kicker="Could not import"
        title={importProblem(job.error, job.matched) || 'Something went wrong'}
        action="Try another link"
        onPress={() => {
          dismissImport();
          setOpen(true);
        }}
        spin={false}>
        <View style={styles.row}>
          <TouchableOpacity
            style={[styles.go, {backgroundColor: PROBLEM_PAL.ink}]}
            onPress={() => {
              dismissImport();
              setOpen(true);
            }}
            accessibilityRole="button">
            <Text style={[styles.goText, {color: PROBLEM_PAL.bg}]}>
              Try another link
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.x, {borderColor: PROBLEM_PAL.ink}]}
            onPress={dismissImport}
            accessibilityRole="button"
            accessibilityLabel="Close">
            <Text style={[styles.xText, {color: PROBLEM_PAL.ink}]}>✕</Text>
          </TouchableOpacity>
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
        kicker="Imported, saved to Your Library"
        title={last.name}
        action="Open playlist"
        onPress={openIt}
        spin={false}>
        <View style={styles.row}>
          <View style={[styles.go, {backgroundColor: IMPORT_PAL.ink}]}>
            <Text style={[styles.goText, {color: IMPORT_PAL.bg}]}>
              Open playlist
            </Text>
          </View>
          <Text style={styles.count}>
            {`${last.found} of ${last.total} songs`}
          </Text>
        </View>
      </FeatureCard>
    );
  }

  // Ask: before the first import, a link box on demand, with a way out.
  const p = IMPORT_PAL;
  return (
    <FeatureCard
      pal={p}
      width={width}
      kicker="Moving from Spotify?"
      title="Bring your playlists"
      action="Paste a link"
      onPress={() => setOpen(true)}
      art={listArt(p)}
      spin={false}>
      {open ? (
        <View style={styles.row}>
          <TextInput
            value={link}
            onChangeText={setLink}
            placeholder="open.spotify.com/playlist/…"
            placeholderTextColor="rgba(17,16,20,0.45)"
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="go"
            onSubmitEditing={submit}
            style={[styles.paste, {borderColor: p.ink, color: p.ink}]}
          />
          <TouchableOpacity
            style={[styles.go, {backgroundColor: p.ink}]}
            onPress={submit}
            accessibilityRole="button">
            <Text style={[styles.goText, {color: p.bg}]}>Import</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.x, {borderColor: p.ink}]}
            onPress={close}
            accessibilityRole="button"
            accessibilityLabel="Close">
            <Text style={[styles.xText, {color: p.ink}]}>✕</Text>
          </TouchableOpacity>
        </View>
      ) : undefined}
    </FeatureCard>
  );
}

export function ContinueCard({
  onOpen,
  width,
}: {onOpen: (c: Collection) => void} & W) {
  const last = useLastCollection();
  if (!last) {
    return null;
  }
  const p = CONTINUE_PAL;
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
}: {
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
  const last = useLastCollection();
  const [page, setPage] = useState(0);

  const keys = useMemo(() => {
    const ks: string[] = ['recap', 'jam'];
    if (importPhase) {
      // Anything but the plain invitation is news: it goes first.
      if (importPhase === 'ask') {
        ks.push('import');
      } else {
        ks.unshift('import');
      }
    }
    if (last) {
      ks.push('continue');
    }
    return ks;
  }, [importPhase, last]);

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
        return <ContinueCard onOpen={onOpenCollection} width={cardW} />;
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
});
