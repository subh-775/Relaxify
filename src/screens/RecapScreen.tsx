/**
 * Recap: your listening told as a short run of full-screen cards, one fact
 * each, like a story. Tap the right side for the next card and the left side
 * for the previous one, hold to pause; each card moves on by itself after
 * CARD_MS and the last one stays.
 *
 * The colour fields are the greeting's own pairs (Greeting.tsx), set flat with
 * black type, so the Recap reads as this app rather than a borrowed look. The
 * figures come from recap.ts, from history kept on this phone: nothing here
 * talks to the network.
 *
 * Light on purpose: Reanimated and react-native-svg, both already in the app,
 * and one entrance per card rather than scattered motion.
 */
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import Animated, {
  Easing,
  FadeInDown,
  ReduceMotion,
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, {Line, Text as SvgText} from 'react-native-svg';
import {X} from '../icons';
import {C, S} from '../theme';
import {BOTTOM_INSET} from '../layout';
import {useStatsState} from '../stats';
import {buildRecap, hourLabel, type Recap, type RecapMode} from '../recap';
import {getBestArtworkUrl} from '../tracks';

/** How long a card stays before the next one. */
const CARD_MS = 5000;
const INK = '#000000';

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

type Card = {key: string; bg: string; ink: string; body: React.ReactNode};

export function RecapScreen({onClose}: {onClose: () => void}) {
  const stats = useStatsState();
  const [mode, setMode] = useState<RecapMode>('week');
  const recap = useMemo(
    () => buildRecap(stats, Date.now(), mode),
    [stats, mode],
  );
  const {width} = useWindowDimensions();
  const cards = useMemo(() => buildCards(recap, width), [recap, width]);

  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const at = Math.min(index, cards.length - 1);
  const card = cards[at];

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
    if (shown.current !== now) {
      shown.current = now;
      prog.value = 0;
    }
    if (paused) {
      cancelAnimation(prog);
      return;
    }
    prog.value = withTiming(
      1,
      {duration: (1 - prog.value) * CARD_MS, easing: Easing.linear},
      done => {
        if (done) {
          runOnJS(advance)();
        }
      },
    );
    return () => cancelAnimation(prog);
  }, [mode, at, paused, prog, advance]);

  const fill = useAnimatedStyle(() => ({width: `${prog.value * 100}%`}));

  const go = (d: 1 | -1) =>
    setIndex(Math.max(0, Math.min(at + d, last.current)));
  const pick = (m: RecapMode) => {
    setMode(m);
    setIndex(0);
  };

  return (
    <View style={[styles.wrap, {backgroundColor: card.bg}]}>
      {/* Tap zones under everything: left third back, the rest forward. */}
      <Pressable
        style={styles.back}
        onPress={() => go(-1)}
        onLongPress={() => setPaused(true)}
        onPressOut={() => setPaused(false)}
        delayLongPress={220}
        accessibilityRole="button"
        accessibilityLabel="Previous card"
      />
      <Pressable
        style={styles.fwd}
        onPress={() => go(1)}
        onLongPress={() => setPaused(true)}
        onPressOut={() => setPaused(false)}
        delayLongPress={220}
        accessibilityRole="button"
        accessibilityLabel="Next card"
      />

      <View style={styles.chrome} pointerEvents="box-none">
        <View style={styles.bars}>
          {cards.map((c, i) => (
            <View
              key={c.key}
              style={[styles.bar, {backgroundColor: fade(card.ink, 0.25)}]}>
              {i < at && (
                <View style={[styles.barFill, {backgroundColor: card.ink}]} />
              )}
              {i === at && (
                <Animated.View
                  style={[styles.barFill, {backgroundColor: card.ink}, fill]}
                />
              )}
            </View>
          ))}
        </View>
        <View style={styles.top} pointerEvents="box-none">
          <View style={styles.modes}>
            {(['week', 'all'] as const).map(m => {
              const on = m === mode;
              return (
                <TouchableOpacity
                  key={m}
                  onPress={() => pick(m)}
                  style={[styles.mode, on && {backgroundColor: card.ink}]}
                  accessibilityRole="button"
                  accessibilityState={{selected: on}}>
                  <Text
                    style={[
                      styles.modeText,
                      {color: on ? card.bg : fade(card.ink, 0.7)},
                    ]}>
                    {m === 'week' ? 'This week' : 'All time'}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <TouchableOpacity
            onPress={onClose}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Close recap">
            <X size={26} color={card.ink} />
          </TouchableOpacity>
        </View>
      </View>

      <Animated.View
        key={`${mode}:${card.key}`}
        entering={FadeInDown.duration(420).reduceMotion(ReduceMotion.System)}
        style={styles.body}
        pointerEvents="none">
        {card.body}
      </Animated.View>
    </View>
  );
}

/** `#rrggbb` at `a` opacity. */
function fade(hex: string, a: number): string {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  return `rgba(${r},${g},${b},${a})`;
}

function buildCards(r: Recap, width: number): Card[] {
  const week = r.mode === 'week';
  const art = Math.min(width - 2 * (S.gutter + 4), 260);

  if (!r.songs) {
    return [
      {
        key: 'empty',
        bg: C.bg,
        ink: C.text,
        body: (
          <>
            <Text style={[styles.headline, {color: C.text}]}>
              Nothing to recap yet
            </Text>
            <Text style={[styles.line, {color: C.sub}]}>
              Play a few songs and your recap starts filling in.
            </Text>
          </>
        ),
      },
    ];
  }

  const cards: Card[] = [];
  const from = Date.now() - 6 * 24 * 60 * 60 * 1000;
  cards.push({
    key: 'intro',
    bg: C.bg,
    ink: C.text,
    body: (
      <>
        <Text style={[styles.label, {color: C.sub}]}>
          {week
            ? `${dayMonth(from)} to ${dayMonth(Date.now())}`
            : 'Since you installed Relaxify'}
        </Text>
        <Text style={[styles.headline, {color: C.text}]}>
          {week ? 'Here is your week in music.' : 'Everything you have played.'}
        </Text>
        <Text style={[styles.line, {color: C.sub}]}>
          {week && r.minutes != null
            ? `${r.songs} songs and ${duration(r.minutes)} of listening.`
            : `${r.songs} songs, and counting.`}
        </Text>
        <Text style={[styles.hint, {color: C.faint}]}>
          Tap the right side to continue.
        </Text>
      </>
    ),
  });

  if (r.topSong) {
    const t = r.topSong.track;
    const uri = getBestArtworkUrl(t);
    cards.push({
      key: 'song',
      bg: week ? '#FF5A5F' : '#B388FF',
      ink: INK,
      body: (
        <>
          <Text style={[styles.label, {color: INK}]}>
            {week ? 'Your song of the week' : 'Your most played song'}
          </Text>
          {!!uri && (
            <Image
              source={{uri}}
              style={[styles.cover, {width: art, height: art}]}
            />
          )}
          <Text
            style={[styles.headline, {color: INK}]}
            numberOfLines={3}
            adjustsFontSizeToFit
            minimumFontScale={0.55}>
            {t.title}
          </Text>
          <Text style={[styles.sub, {color: INK}]} numberOfLines={2}>
            {t.artist}
          </Text>
          <Text style={[styles.line, {color: INK}]}>
            {`Played ${times(r.topSong.count)}${week ? ' this week' : ''}.`}
          </Text>
        </>
      ),
    });
  }

  if (r.topArtist) {
    const a = r.topArtist;
    cards.push({
      key: 'artist',
      bg: week ? '#00B4FF' : '#FF9F1C',
      ink: INK,
      body: (
        <>
          <Text style={[styles.label, {color: INK}]}>
            {week ? 'Your artist of the week' : 'Your most played artist'}
          </Text>
          {a.image ? (
            <Image
              source={{uri: a.image}}
              style={[
                styles.face,
                {width: art * 0.72, height: art * 0.72, borderRadius: art},
              ]}
            />
          ) : null}
          <Text
            style={[styles.headline, {color: INK}]}
            numberOfLines={2}
            adjustsFontSizeToFit
            minimumFontScale={0.55}>
            {a.name}
          </Text>
          <Text style={[styles.line, {color: INK}]}>
            {`${a.count} ${a.count === 1 ? 'play' : 'plays'}${
              week ? ' this week' : ''
            }.`}
          </Text>
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
      bg: '#8AE234',
      ink: INK,
      body: (
        <>
          <Text style={[styles.label, {color: INK}]}>You listened for</Text>
          <Text style={[styles.figure, {color: INK}]}>
            {duration(r.minutes)}
          </Text>
          <View style={styles.week}>
            {days.map((d, i) => (
              <View key={d.at} style={styles.dayCol}>
                <View style={styles.dayTrack}>
                  <View
                    style={[
                      styles.dayBar,
                      {
                        height: `${Math.max(4, (d.songs / max) * 100)}%`,
                        backgroundColor:
                          i === r.busiest ? INK : fade(INK, 0.28),
                      },
                    ]}
                  />
                </View>
                <Text style={[styles.dayLabel, {color: INK}]}>
                  {DAYS[new Date(d.at).getDay()].slice(0, 1)}
                </Text>
              </View>
            ))}
          </View>
          {big && (
            <Text style={[styles.line, {color: INK}]}>
              {`${DAYS[new Date(big.at).getDay()]} was your biggest day, with ${
                big.songs
              } ${big.songs === 1 ? 'song' : 'songs'}.`}
            </Text>
          )}
        </>
      ),
    });
  }

  if (r.persona) {
    const accent = week ? '#FFD23F' : '#2EC4B6';
    cards.push({
      key: 'hour',
      bg: C.bg,
      ink: C.text,
      body: (
        <>
          <HourDial
            hours={r.hours}
            peak={r.peakHour}
            accent={accent}
            size={Math.min(width - 2 * (S.gutter + 4), 240)}
          />
          <Text style={[styles.label, {color: C.sub}]}>
            {week ? 'This week you were' : 'Lately you have been'}
          </Text>
          <Text style={[styles.headline, {color: accent}]}>
            {r.persona.name}
          </Text>
          <Text style={[styles.line, {color: C.text}]}>{r.persona.line}</Text>
        </>
      ),
    });
  }
  return cards;
}

/** The day as a clock face: one spoke per hour, longer for more listening,
 *  the busiest hour and its neighbours in the card's accent. */
function HourDial({
  hours,
  peak,
  accent,
  size,
}: {
  hours: number[];
  peak: number;
  accent: string;
  size: number;
}) {
  const c = size / 2;
  const r0 = size * 0.27;
  const reach = size * 0.21;
  const max = Math.max(1, ...hours);
  const near = (h: number) =>
    peak >= 0 && Math.min(Math.abs(h - peak), 24 - Math.abs(h - peak)) <= 1;
  const labels: [string, number][] = [
    [hourLabel(0), 0],
    [hourLabel(6), 6],
    [hourLabel(12), 12],
    [hourLabel(18), 18],
  ];
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
            stroke={near(h) ? accent : 'rgba(244,245,247,0.28)'}
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
            fill={C.sub}
            fontSize={11}
            fontWeight="600"
            textAnchor="middle">
            {t}
          </SvgText>
        );
      })}
    </Svg>
  );
}

const styles = StyleSheet.create({
  wrap: {flex: 1},
  back: {position: 'absolute', top: 0, bottom: 0, left: 0, width: '32%'},
  fwd: {position: 'absolute', top: 0, bottom: 0, right: 0, width: '68%'},
  chrome: {paddingHorizontal: S.gutter, paddingTop: 12, gap: 12, zIndex: 2},
  bars: {flexDirection: 'row', gap: 4},
  bar: {flex: 1, height: 3, borderRadius: 2, overflow: 'hidden'},
  barFill: {height: '100%', width: '100%'},
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modes: {flexDirection: 'row', gap: 4},
  mode: {paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999},
  modeText: {fontSize: 13.5, fontWeight: '700'},
  // Poster layout: everything sits low and to the left, read top to bottom.
  body: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: S.gutter + 4,
    paddingBottom: BOTTOM_INSET + 16,
    gap: 10,
  },
  label: {fontSize: 16, fontWeight: '700'},
  headline: {
    fontSize: 44,
    lineHeight: 48,
    fontWeight: '900',
    letterSpacing: -1.4,
  },
  figure: {fontSize: 60, lineHeight: 64, fontWeight: '900', letterSpacing: -2},
  sub: {fontSize: 18, fontWeight: '700', opacity: 0.8},
  line: {fontSize: 17, lineHeight: 24, fontWeight: '600'},
  hint: {fontSize: 13.5, fontWeight: '600', marginTop: 18},
  cover: {borderRadius: 6, marginBottom: 6},
  face: {marginBottom: 6},
  dial: {marginBottom: 8, alignSelf: 'flex-start'},
  week: {
    flexDirection: 'row',
    gap: 8,
    height: 140,
    marginVertical: 8,
  },
  dayCol: {flex: 1, gap: 6},
  dayTrack: {flex: 1, justifyContent: 'flex-end'},
  dayBar: {width: '100%', borderRadius: 4},
  dayLabel: {fontSize: 13, fontWeight: '700', textAlign: 'center'},
});
