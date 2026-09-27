/**
 * Recap: your listening told as a short run of full-screen cards, one fact
 * each, like a story. Tap the right side for the next card and the left side
 * for the previous one, hold to pause, swipe down to put it away; each card
 * moves on by itself after CARD_MS and the last one stays.
 *
 * The look is a sticker board. Every card is one yellow tile — a thick black
 * edge and a hard, unblurred shadow — slapped onto a bright field taken from
 * the greeting's own colours (Greeting.tsx). Where the tile lands, and which
 * way it leans, is reshuffled each time the Recap opens from a small set of
 * hand-tuned layouts, so it feels different every visit and long titles never
 * collide with anything.
 *
 * The figures come from recap.ts, from history kept on this phone: nothing
 * here talks to the network. Reanimated, gesture-handler and react-native-svg
 * only, all already in the app.
 */
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  BackHandler,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import {Gesture, GestureDetector} from 'react-native-gesture-handler';
import Animated, {
  Easing,
  cancelAnimation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, {Line, Text as SvgText} from 'react-native-svg';
import {S} from '../theme';
import {useStatsState} from '../stats';
import {
  buildRecap,
  hourLabel,
  type ArtistCount,
  type Recap,
  type RecapMode,
  type SongCount,
} from '../recap';
import {getBestArtworkUrl} from '../tracks';

/** How long a card stays before the next one. */
const CARD_MS = 5000;
const INK = '#000000';
const PAPER = '#FFFDF5';

/** The fields: the greeting's colours, minus the orange and sun that would
 *  melt into a yellow tile. */
const FIELDS = [
  '#FF5A5F', // coral
  '#00B4FF', // sky
  '#B388FF', // lavender
  '#FF6FD8', // pink
  '#2EC4B6', // teal
  '#7B8CFF', // periwinkle
  '#8AE234', // lime
];
/** The tiles: one yellow family, a different shade per card. */
const TILES = ['#FFE14D', '#FFF3A3', '#FFD60A', '#FFC53D', '#F4FF6A'];

/**
 * Where a tile sits and how it leans. Every one works for every card: the
 * tile always keeps most of the width, so only its height on the page, its
 * side and its tilt change.
 */
type Layout = {
  v: 'flex-start' | 'center' | 'flex-end';
  h: 'flex-start' | 'center' | 'flex-end';
  tilt: number;
  /** Which corner of the tile the sticker is stuck to. */
  stick: 'tl' | 'tr' | 'bl' | 'br';
};
const LAYOUTS: Layout[] = [
  {v: 'flex-start', h: 'flex-start', tilt: -2.5, stick: 'br'},
  {v: 'center', h: 'center', tilt: 1.8, stick: 'tr'},
  {v: 'flex-end', h: 'flex-end', tilt: -1.6, stick: 'tl'},
  {v: 'flex-start', h: 'flex-end', tilt: 2.4, stick: 'bl'},
  {v: 'flex-end', h: 'flex-start', tilt: 1.2, stick: 'tr'},
  {v: 'center', h: 'flex-start', tilt: -1.2, stick: 'br'},
];

function shuffled<T>(xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const DAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];
const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/** "3 h 12 min", "38 min". */
function duration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h} h ${m} min` : `${m} min`;
}

function dayMonth(at: number): string {
  const d = new Date(at);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

function times(n: number): string {
  return n === 1 ? 'once' : n === 2 ? 'twice' : `${n} times`;
}

/** One card: what goes on the tile, and the sticker stuck to it. */
type Card = {key: string; body: React.ReactNode; sticker?: string};

export function RecapScreen({onClose}: {onClose: () => void}) {
  const stats = useStatsState();
  const [mode, setMode] = useState<RecapMode>('week');
  const recap = useMemo(
    () => buildRecap(stats, Date.now(), mode),
    [stats, mode],
  );
  const {width, height} = useWindowDimensions();
  const tileW = Math.min(width - 2 * S.gutter - 10, 440);
  const cards = useMemo(
    () => buildCards(recap, tileW, height),
    [recap, tileW, height],
  );

  // A fresh deal of layouts, fields and tiles each time the Recap opens.
  const [deal] = useState(() => ({
    layouts: shuffled(LAYOUTS),
    fields: shuffled(FIELDS),
    tiles: shuffled(TILES),
  }));

  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const at = Math.min(index, cards.length - 1);
  const card = cards[at];
  const layout = deal.layouts[at % deal.layouts.length];
  const field = deal.fields[at % deal.fields.length];
  const tile = deal.tiles[at % deal.tiles.length];

  // ── Progress and auto-advance ─────────────────────────────────────────
  const prog = useSharedValue(0);
  const last = useRef(cards.length - 1);
  last.current = cards.length - 1;
  const shown = useRef('');

  const advance = useCallback(
    () => setIndex(i => Math.min(i + 1, last.current)),
    [],
  );

  useEffect(() => {
    const now = `${mode}:${at}`;
    const fresh = shown.current !== now;
    if (fresh) {
      shown.current = now;
      prog.value = 0;
    }
    if (paused) {
      cancelAnimation(prog);
      return;
    }
    // Never read `prog` straight after writing it. A write from JS is QUEUED
    // for the UI thread while a read is synchronous, so the read still saw the
    // finished card's 1: the next card got a zero-length timer and advanced at
    // once, cascading to the last card — and a tap back bounced forward again.
    const from = fresh ? 0 : prog.value;
    prog.value = withTiming(
      1,
      {duration: (1 - from) * CARD_MS, easing: Easing.linear},
      done => {
        if (done) {
          runOnJS(advance)();
        }
      },
    );
    return () => cancelAnimation(prog);
  }, [mode, at, paused, prog, advance]);

  const fill = useAnimatedStyle(() => ({width: `${prog.value * 100}%`}));

  const go = useCallback(
    (d: 1 | -1) => setIndex(i => Math.max(0, Math.min(i + d, last.current))),
    [],
  );
  const pick = (m: RecapMode) => {
    setMode(m);
    setIndex(0);
  };

  // ── Swipe down to put it away ────────────────────────────────────────
  // `drag` is how far the story has been pulled down, in px. It enters from a
  // little way down too, so opening and closing are the same motion.
  const reduce = useReducedMotion();
  const drag = useSharedValue(reduce ? 0 : height * 0.12);
  useEffect(() => {
    drag.value = withSpring(0, {damping: 20, stiffness: 190});
  }, [drag]);

  const closing = useRef(false);
  const dismiss = useCallback(
    (velocity = 0) => {
      if (closing.current) {
        return;
      }
      closing.current = true;
      drag.value = withTiming(
        height,
        {
          duration: Math.max(160, 320 - Math.abs(velocity) / 8),
          easing: Easing.in(Easing.cubic),
        },
        done => {
          if (done) {
            runOnJS(onClose)();
          }
        },
      );
    },
    [drag, height, onClose],
  );

  // Back puts it away the same way a swipe does.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      dismiss();
      return true;
    });
    return () => sub.remove();
  }, [dismiss]);

  const gesture = useMemo(() => {
    const pan = Gesture.Pan()
      .activeOffsetY(12)
      .failOffsetX([-24, 24])
      .onStart(() => runOnJS(setPaused)(true))
      .onUpdate(e => {
        drag.value = Math.max(0, e.translationY);
      })
      .onEnd(e => {
        if (e.translationY > height * 0.2 || e.velocityY > 900) {
          runOnJS(dismiss)(e.velocityY);
        } else {
          drag.value = withSpring(0, {damping: 18, stiffness: 220});
          runOnJS(setPaused)(false);
        }
      });
    const hold = Gesture.LongPress()
      .minDuration(220)
      .onStart(() => runOnJS(setPaused)(true))
      .onFinalize(() => runOnJS(setPaused)(false));
    const tap = Gesture.Tap()
      .maxDuration(250)
      .onEnd((e, ok) => {
        if (ok) {
          runOnJS(go)(e.x < width * 0.32 ? -1 : 1);
        }
      });
    return Gesture.Race(pan, hold, tap);
  }, [drag, height, width, dismiss, go]);

  // Pulled down, the story shrinks and rounds off like a card being lifted
  // away, the way the full player folds into the mini player.
  const sheet = useAnimatedStyle(() => {
    const p = Math.min(1, drag.value / height);
    return {
      opacity: interpolate(p, [0, 0.6, 1], [1, 0.9, 0]),
      borderRadius: interpolate(p, [0, 0.15], [0, 28], 'clamp'),
      transform: [
        {translateY: drag.value * 0.9},
        {scale: interpolate(p, [0, 1], [1, 0.82])},
      ],
    };
  });

  return (
    <Animated.View style={[styles.wrap, {backgroundColor: field}, sheet]}>
      <GestureDetector gesture={gesture}>
        <View style={styles.stage}>
          <View
            style={[
              styles.body,
              {justifyContent: layout.v, alignItems: layout.h},
            ]}>
            <Tile
              key={`${mode}:${card.key}`}
              width={tileW}
              color={tile}
              layout={layout}
              sticker={card.sticker}
              animate={!reduce}>
              {card.body}
            </Tile>
          </View>
        </View>
      </GestureDetector>

      {/* Over the stage but outside the gesture, so the switch is a plain
          button and a tap on it is never also a "next card". */}
      <View style={styles.chrome} pointerEvents="box-none">
        <View style={styles.bars} pointerEvents="none">
          {cards.map((c, i) => (
            <View key={c.key} style={styles.bar}>
              {i < at && <View style={styles.barFill} />}
              {i === at && <Animated.View style={[styles.barFill, fill]} />}
            </View>
          ))}
        </View>
        <View style={styles.modes}>
          {(['week', 'all'] as const).map(m => {
            const on = m === mode;
            return (
              <TouchableOpacity
                key={m}
                onPress={() => pick(m)}
                style={[styles.mode, on && styles.modeOn]}
                accessibilityRole="button"
                accessibilityState={{selected: on}}>
                <Text style={[styles.modeText, on && {color: field}]}>
                  {m === 'week' ? 'This week' : 'All time'}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
      {/* A handle, the same promise the player's grab bar makes: this pulls
          down. */}
      <View style={styles.grip} pointerEvents="none" />
    </Animated.View>
  );
}

/**
 * The yellow tile: a hard shadow drawn as a black slab behind it, a lean from
 * the layout, and one entrance — slapped down like a sticker, tilting past its
 * resting angle and settling back.
 */
function Tile({
  width,
  color,
  layout,
  sticker,
  animate,
  children,
}: {
  width: number;
  color: string;
  layout: Layout;
  sticker?: string;
  animate: boolean;
  children: React.ReactNode;
}) {
  const t = useSharedValue(animate ? 0 : 1);
  useEffect(() => {
    t.value = withTiming(1, {duration: 420, easing: Easing.out(Easing.back(2))});
  }, [t]);
  const land = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [0, 0.35], [0, 1], 'clamp'),
    transform: [
      {scale: interpolate(t.value, [0, 1], [1.14, 1])},
      {rotate: `${layout.tilt + (1 - t.value) * 7}deg`},
    ],
  }));
  const corner = {
    tl: {top: -16, left: -8},
    tr: {top: -16, right: -8},
    bl: {bottom: -14, left: -8},
    br: {bottom: -14, right: -8},
  }[layout.stick];
  return (
    <Animated.View style={[{width}, land]}>
      <View style={styles.shadow} />
      <View style={[styles.tile, {backgroundColor: color}]}>{children}</View>
      {!!sticker && (
        <View
          style={[
            styles.sticker,
            corner,
            {transform: [{rotate: `${-layout.tilt * 3}deg`}]},
          ]}>
          <Text style={styles.stickerText}>{sticker}</Text>
        </View>
      )}
    </Animated.View>
  );
}

function Cover({uri, size}: {uri?: string; size: number}) {
  return uri ? (
    <Image
      source={{uri}}
      style={[styles.cover, {width: size, height: size}]}
    />
  ) : (
    <View style={[styles.cover, styles.coverEmpty, {width: size, height: size}]} />
  );
}

/** A top-five list: rank, cover, name, count. The ranks are a real order. */
function Ranked({
  rows,
}: {
  rows: {key: string; title: string; sub?: string; uri?: string; n: number}[];
}) {
  return (
    <View style={styles.ranked}>
      {rows.map((r, i) => (
        <View key={r.key} style={styles.rankRow}>
          <Text style={[styles.rank, i === 0 && styles.rankTop]}>{i + 1}</Text>
          <Cover uri={r.uri} size={i === 0 ? 50 : 40} />
          <View style={styles.rankText}>
            <Text
              style={[styles.rankTitle, i === 0 && styles.rankTitleTop]}
              numberOfLines={1}>
              {r.title}
            </Text>
            {!!r.sub && (
              <Text style={styles.rankSub} numberOfLines={1}>
                {r.sub}
              </Text>
            )}
          </View>
          <Text style={styles.rankN}>{r.n}×</Text>
        </View>
      ))}
    </View>
  );
}

const songRows = (xs: SongCount[]) =>
  xs.map((s, i) => ({
    key: `${i}:${s.track.title}`,
    title: s.track.title,
    sub: s.track.artist,
    uri: getBestArtworkUrl(s.track),
    n: s.count,
  }));
const artistRows = (xs: ArtistCount[]) =>
  xs.map((a, i) => ({key: `${i}:${a.name}`, title: a.name, uri: a.image, n: a.count}));

function buildCards(r: Recap, tileW: number, screenH: number): Card[] {
  const week = r.mode === 'week';
  // Capped by height as well, so a three-line title still fits a short phone.
  const art = Math.min(tileW - 40, 230, Math.round(screenH * 0.26));

  if (!r.songs) {
    return [
      {
        key: 'empty',
        sticker: 'soon',
        body: (
          <>
            <Text style={styles.headline}>Nothing to recap yet</Text>
            <Text style={styles.line}>
              Play a few songs. Each one counts once you have listened for 30
              seconds.
            </Text>
          </>
        ),
      },
    ];
  }

  const cards: Card[] = [];
  const now = Date.now();
  cards.push({
    key: 'intro',
    sticker: week ? 'this week' : 'all time',
    body: (
      <>
        <Text style={styles.label}>
          {week
            ? `${dayMonth(now - 6 * 24 * 60 * 60 * 1000)} to ${dayMonth(now)}`
            : 'Everything you have played on Relaxify'}
        </Text>
        <Text style={styles.figure}>{r.songs}</Text>
        <Text style={styles.headline}>
          {r.songs === 1 ? 'song' : 'songs'}
          {week ? ' this week' : ' and counting'}
        </Text>
        {week && r.minutes != null && (
          <Text style={styles.line}>{`${duration(r.minutes)} of music.`}</Text>
        )}
        <Text style={styles.hint}>
          Tap the right side to go on, hold to pause, swipe down to close.
        </Text>
      </>
    ),
  });

  if (r.topSong) {
    const t = r.topSong.track;
    cards.push({
      key: 'song',
      sticker: `${r.topSong.count}×`,
      body: (
        <>
          <Text style={styles.label}>
            {week ? 'Your song of the week' : 'Your most played song'}
          </Text>
          <Cover uri={getBestArtworkUrl(t)} size={art} />
          <Text
            style={styles.headline}
            numberOfLines={3}
            adjustsFontSizeToFit
            minimumFontScale={0.55}>
            {t.title}
          </Text>
          <Text style={styles.sub} numberOfLines={2}>
            {t.artist}
          </Text>
          <Text style={styles.line}>
            {`Played ${times(r.topSong.count)}${week ? ' this week' : ''}.`}
          </Text>
        </>
      ),
    });
  }

  if (r.topSongs.length > 1) {
    cards.push({
      key: 'songs',
      sticker: 'top 5',
      body: (
        <>
          <Text style={styles.label}>
            {week ? 'Your top songs this week' : 'Your top songs'}
          </Text>
          <Ranked rows={songRows(r.topSongs)} />
        </>
      ),
    });
  }

  if (r.topArtist) {
    const a = r.topArtist;
    cards.push({
      key: 'artist',
      sticker: `${a.count} plays`,
      body: (
        <>
          <Text style={styles.label}>
            {week ? 'Your artist of the week' : 'Your most played artist'}
          </Text>
          {!!a.image && <Cover uri={a.image} size={art * 0.7} />}
          <Text
            style={styles.headline}
            numberOfLines={2}
            adjustsFontSizeToFit
            minimumFontScale={0.55}>
            {a.name}
          </Text>
          <Text style={styles.line}>
            {`${a.count} ${a.count === 1 ? 'play' : 'plays'}${
              week ? ' this week' : ''
            }.`}
          </Text>
        </>
      ),
    });
  }

  if (r.topArtists.length > 1) {
    cards.push({
      key: 'artists',
      sticker: 'top 5',
      body: (
        <>
          <Text style={styles.label}>
            {week ? 'Your top artists this week' : 'Your top artists'}
          </Text>
          <Ranked rows={artistRows(r.topArtists)} />
        </>
      ),
    });
  }

  if (week && r.days && r.minutes != null) {
    const days = r.days;
    const max = Math.max(1, ...days.map(d => d.songs));
    const big = r.busiest >= 0 ? days[r.busiest] : null;
    cards.push({
      key: 'time',
      sticker: big ? DAYS[new Date(big.at).getDay()].slice(0, 3) : undefined,
      body: (
        <>
          <Text style={styles.label}>You listened for</Text>
          <Text style={styles.figure}>{duration(r.minutes)}</Text>
          <View style={styles.week}>
            {days.map((d, i) => (
              <View key={d.at} style={styles.dayCol}>
                <View style={styles.dayTrack}>
                  <View
                    style={[
                      styles.dayBar,
                      i !== r.busiest && styles.dayBarQuiet,
                      {height: `${Math.max(4, (d.songs / max) * 100)}%`},
                    ]}
                  />
                </View>
                <Text style={styles.dayLabel}>
                  {DAYS[new Date(d.at).getDay()].slice(0, 1)}
                </Text>
              </View>
            ))}
          </View>
          {big && (
            <Text style={styles.line}>
              {`${DAYS[new Date(big.at).getDay()]} was your biggest day, with ${
                big.songs
              } ${big.songs === 1 ? 'song' : 'songs'}.`}
            </Text>
          )}
        </>
      ),
    });
  }

  if (week && r.minutes != null && r.lastMinutes != null && r.lastMinutes > 0) {
    const diff = r.minutes - r.lastMinutes;
    const pct = Math.round((Math.abs(diff) / r.lastMinutes) * 100);
    cards.push({
      key: 'vs',
      sticker: diff >= 0 ? `+${pct}%` : `-${pct}%`,
      body: (
        <>
          <Text style={styles.label}>Compared with last week</Text>
          <Text style={styles.figure}>
            {diff >= 0 ? `+${duration(diff)}` : `-${duration(-diff)}`}
          </Text>
          <Text style={styles.line}>
            {diff >= 0
              ? `More music than last week's ${duration(r.lastMinutes)}.`
              : `A quieter week than last week's ${duration(r.lastMinutes)}.`}
          </Text>
        </>
      ),
    });
  }

  if (r.onRepeat) {
    const o = r.onRepeat;
    cards.push({
      key: 'repeat',
      sticker: 'on repeat',
      body: (
        <>
          <Text style={styles.label}>{`On ${
            DAYS[new Date(o.day).getDay()]
          } you could not stop playing`}</Text>
          <Cover uri={getBestArtworkUrl(o.track)} size={art * 0.62} />
          <Text
            style={styles.headline}
            numberOfLines={2}
            adjustsFontSizeToFit
            minimumFontScale={0.55}>
            {o.track.title}
          </Text>
          <Text style={styles.line}>{`${o.count} times in one day.`}</Text>
        </>
      ),
    });
  }

  if (r.discoveries.length) {
    const d = r.discoveries;
    cards.push({
      key: 'new',
      sticker: 'new',
      body: (
        <>
          <Text style={styles.label}>New to you this week</Text>
          <Text style={styles.figure}>{d.length}</Text>
          <Text style={styles.headline}>
            {d.length === 1 ? 'new artist' : 'new artists'}
          </Text>
          <Text style={styles.line} numberOfLines={3}>
            {d
              .slice(0, 3)
              .map(a => a.name)
              .join(', ') + (d.length > 3 ? ` and ${d.length - 3} more.` : '.')}
          </Text>
        </>
      ),
    });
  }

  if (r.persona) {
    cards.push({
      key: 'hour',
      sticker: hourLabel(r.peakHour),
      body: (
        <>
          <HourDial
            hours={r.hours}
            peak={r.peakHour}
            size={Math.min(tileW - 60, 220)}
          />
          <Text style={styles.label}>
            {week ? 'This week you were' : 'Lately you have been'}
          </Text>
          <Text style={styles.headline}>{r.persona.name}</Text>
          <Text style={styles.line}>{r.persona.line}</Text>
        </>
      ),
    });
  }

  if (r.streak >= 2) {
    cards.push({
      key: 'streak',
      sticker: `best ${r.bestStreak}`,
      body: (
        <>
          <Text style={styles.label}>Days in a row with music</Text>
          <Text style={styles.figure}>{r.streak}</Text>
          <Text style={styles.line}>
            {r.streak >= r.bestStreak
              ? 'Your longest run yet. Play something tomorrow to keep it going.'
              : `Your best is ${r.bestStreak}. Play something tomorrow to keep it going.`}
          </Text>
        </>
      ),
    });
  }

  cards.push({key: 'poster', sticker: 'Relaxify', body: <Poster r={r} />});
  return cards;
}

/** The last card: the whole recap on one tile. */
function Poster({r}: {r: Recap}) {
  const week = r.mode === 'week';
  const cells: [string, string][] = [
    ['Songs', String(r.songs)],
    ...(r.minutes != null
      ? ([['Listened', duration(r.minutes)]] as [string, string][])
      : []),
    ...(r.topArtist
      ? ([['Top artist', r.topArtist.name]] as [string, string][])
      : []),
    ...(r.persona ? ([['You are', r.persona.name]] as [string, string][]) : []),
    ...(r.streak >= 2
      ? ([['Streak', `${r.streak} days`]] as [string, string][])
      : []),
  ];
  return (
    <>
      <Text style={styles.label}>
        {week ? 'Your week, in one picture' : 'You, in one picture'}
      </Text>
      {r.topSong && (
        <View style={styles.posterSong}>
          <Cover uri={getBestArtworkUrl(r.topSong.track)} size={72} />
          <View style={styles.rankText}>
            <Text style={styles.rankSub}>Top song</Text>
            <Text style={styles.posterTitle} numberOfLines={2}>
              {r.topSong.track.title}
            </Text>
          </View>
        </View>
      )}
      <View style={styles.grid}>
        {cells.map(([k, v]) => (
          <View key={k} style={styles.cell}>
            <Text style={styles.rankSub}>{k}</Text>
            <Text style={styles.cellValue} numberOfLines={2}>
              {v}
            </Text>
          </View>
        ))}
      </View>
    </>
  );
}

/** The day as a clock face: one spoke per hour, longer for more listening,
 *  the busiest hour and its neighbours in solid ink. */
function HourDial({
  hours,
  peak,
  size,
}: {
  hours: number[];
  peak: number;
  size: number;
}) {
  const c = size / 2;
  const r0 = size * 0.27;
  const reach = size * 0.21;
  const max = Math.max(1, ...hours);
  const near = (h: number) =>
    peak >= 0 && Math.min(Math.abs(h - peak), 24 - Math.abs(h - peak)) <= 1;
  const labels: [string, number][] = [0, 6, 12, 18].map(h => [hourLabel(h), h]);
  return (
    <Svg width={size} height={size} style={styles.dial}>
      {hours.map((n, h) => {
        const a = (h / 24) * 2 * Math.PI - Math.PI / 2;
        const len = 5 + (n / max) * reach;
        return (
          <Line
            key={h}
            x1={c + Math.cos(a) * r0}
            y1={c + Math.sin(a) * r0}
            x2={c + Math.cos(a) * (r0 + len)}
            y2={c + Math.sin(a) * (r0 + len)}
            stroke={near(h) ? INK : 'rgba(0,0,0,0.22)'}
            strokeWidth={size * 0.035}
            strokeLinecap="round"
          />
        );
      })}
      {labels.map(([t, h]) => {
        const a = (h / 24) * 2 * Math.PI - Math.PI / 2;
        return (
          <SvgText
            key={t}
            x={c + Math.cos(a) * r0 * 0.62}
            y={c + Math.sin(a) * r0 * 0.62 + 4}
            fill={INK}
            fontSize={11}
            fontWeight="700"
            textAnchor="middle">
            {t}
          </SvgText>
        );
      })}
    </Svg>
  );
}

const styles = StyleSheet.create({
  wrap: {flex: 1, overflow: 'hidden'},
  stage: {flex: 1},
  chrome: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: S.gutter,
    paddingTop: 12,
    gap: 12,
  },
  bars: {flexDirection: 'row', gap: 4},
  bar: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  barFill: {height: '100%', width: '100%', backgroundColor: INK},
  modes: {flexDirection: 'row', gap: 6},
  mode: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: INK,
  },
  modeOn: {backgroundColor: INK},
  modeText: {fontSize: 13.5, fontWeight: '800', color: INK},
  // The tile's box: below the chrome, above the swipe hint. Where in it the
  // tile sits comes from the card's layout.
  body: {
    flex: 1,
    paddingTop: 92,
    paddingBottom: 56,
    paddingHorizontal: S.gutter,
  },
  shadow: {
    position: 'absolute',
    top: 7,
    left: 7,
    right: -7,
    bottom: -7,
    borderRadius: 20,
    backgroundColor: INK,
  },
  tile: {
    borderWidth: 3,
    borderColor: INK,
    borderRadius: 20,
    padding: 20,
    gap: 10,
  },
  sticker: {
    position: 'absolute',
    backgroundColor: PAPER,
    borderWidth: 2.5,
    borderColor: INK,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  stickerText: {color: INK, fontSize: 14, fontWeight: '900'},
  grip: {
    position: 'absolute',
    bottom: 22,
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: INK,
    opacity: 0.45,
  },
  label: {fontSize: 15, fontWeight: '800', color: INK},
  headline: {
    fontSize: 40,
    lineHeight: 44,
    fontWeight: '900',
    letterSpacing: -1.3,
    color: INK,
  },
  figure: {
    fontSize: 64,
    lineHeight: 68,
    fontWeight: '900',
    letterSpacing: -2.5,
    color: INK,
  },
  sub: {fontSize: 17, fontWeight: '700', color: INK, opacity: 0.75},
  line: {fontSize: 16, lineHeight: 23, fontWeight: '600', color: INK},
  hint: {fontSize: 13, fontWeight: '700', color: INK, opacity: 0.6, marginTop: 8},
  cover: {borderRadius: 8, borderWidth: 2.5, borderColor: INK},
  coverEmpty: {backgroundColor: 'rgba(0,0,0,0.12)'},
  dial: {alignSelf: 'center'},
  week: {flexDirection: 'row', gap: 7, height: 120, marginVertical: 6},
  dayCol: {flex: 1, gap: 6},
  dayTrack: {flex: 1, justifyContent: 'flex-end'},
  dayBar: {width: '100%', borderRadius: 4, backgroundColor: INK},
  dayBarQuiet: {backgroundColor: 'rgba(0,0,0,0.22)'},
  dayLabel: {fontSize: 13, fontWeight: '800', textAlign: 'center', color: INK},
  ranked: {gap: 10, marginTop: 4},
  rankRow: {flexDirection: 'row', alignItems: 'center', gap: 10},
  rank: {width: 22, fontSize: 20, fontWeight: '900', color: INK},
  rankTop: {fontSize: 26},
  rankText: {flex: 1, minWidth: 0},
  rankTitle: {fontSize: 15, fontWeight: '800', color: INK},
  rankTitleTop: {fontSize: 18},
  rankSub: {fontSize: 12.5, fontWeight: '700', color: INK, opacity: 0.65},
  rankN: {fontSize: 15, fontWeight: '900', color: INK},
  posterSong: {flexDirection: 'row', alignItems: 'center', gap: 12},
  posterTitle: {fontSize: 22, lineHeight: 26, fontWeight: '900', color: INK},
  grid: {flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4},
  cell: {
    width: '48%',
    flexGrow: 1,
    borderWidth: 2,
    borderColor: INK,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: 'rgba(255,255,255,0.45)',
  },
  cellValue: {fontSize: 16, fontWeight: '900', color: INK, marginTop: 2},
});
