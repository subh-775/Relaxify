/**
 * Recap: your listening told as a short run of full-screen cards, one fact
 * each, like a story. Tap the right side for the next card and the left side
 * for the previous one, hold to pause, swipe down to put it away; each card
 * moves on by itself after CARD_MS and the last one stays.
 *
 * Every card is a flat, loud colour field with its own piece of artwork framed
 * around the fact — a starburst, a day ring round the cover, sunburst rays, a
 * spinning record — and the Relaxify mark in the same corner throughout. The
 * palettes are dealt again each time the Recap opens.
 *
 * Drawn on a 360-wide canvas and scaled to the phone's width, so the artwork
 * lands where it was designed on every screen; only the height stretches, and
 * `Y()` spreads the vertical positions over it. Reanimated, gesture-handler and
 * react-native-svg only, all already in the app. The figures come from
 * recap.ts; the only network use is the artists' photos (artistPhotos.ts).
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
  type LayoutChangeEvent,
} from 'react-native';
import {Gesture, GestureDetector} from 'react-native-gesture-handler';
import Animated, {
  Easing,
  FadeInUp,
  ReduceMotion,
  cancelAnimation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, {
  Circle,
  Defs,
  Line,
  LinearGradient,
  Path,
  Rect,
  Stop,
  Text as SvgText,
} from 'react-native-svg';
import {FONT} from '../font';
import {useStatsState} from '../stats';
import {
  buildRecap,
  hourLabel,
  type ArtistCount,
  type Recap,
  type RecapMode,
} from '../recap';
import {getBestArtworkUrl} from '../tracks';
import {useArtistPhotos} from '../artistPhotos';

const MARK = require('../assets/mark-white.png');

/** How long a card stays before the next one. */
const CARD_MS = 5000;
/** The design canvas is this wide; everything is scaled from it. */
const CW = 360;
const DARK = '#111014';

// ── Palettes: a field, its ink, and three accents ───────────────────────
type Pal = {bg: string; ink: string; a: string; b: string; c: string};
const PALS: Pal[] = [
  {bg: '#FF5A4E', ink: DARK, a: '#B8FF3C', b: '#7A2CFF', c: '#3CC8FF'},
  {bg: '#A9A3FF', ink: DARK, a: '#FF7A1A', b: '#FF4FB3', c: '#FFE14D'},
  {bg: '#15121C', ink: '#FFFFFF', a: '#2EE6C8', b: '#FF3FA4', c: '#FFD23F'},
  {bg: '#B8F03C', ink: DARK, a: '#6C2BFF', b: '#FF5A4E', c: '#3CC8FF'},
  {bg: '#3CB4FF', ink: DARK, a: '#FFE14D', b: '#FF4FB3', c: '#B8FF3C'},
  {bg: '#FF6FD8', ink: DARK, a: '#1FD1B5', b: '#FFE14D', c: '#6C2BFF'},
  {bg: '#FF9F1C', ink: DARK, a: '#6C2BFF', b: '#3CC8FF', c: '#FF4FB3'},
  {bg: '#1FC3A6', ink: DARK, a: '#FF5A4E', b: '#FFE14D', c: '#6C2BFF'},
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

// ── Shapes: plain path strings, the same ones the demo drew ─────────────
/** A small seeded generator, so each blob keeps its shape between renders. */
function rng(seed: number): () => number {
  let x = seed * 7919 + 17;
  return () => {
    x = (x * 9301 + 49297) % 233280;
    return x / 233280;
  };
}

/** A smooth, wobbly closed blob through n points (Catmull-Rom as cubics). */
function blob(
  cx: number,
  cy: number,
  r: number,
  wob: number,
  n: number,
  seed: number,
): string {
  const R = rng(seed);
  const p = Array.from({length: n}, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    const rr = r * (1 - wob + R() * wob * 2);
    return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr];
  });
  const f = (v: number) => v.toFixed(1);
  let d = `M${f(p[0][0])},${f(p[0][1])}`;
  for (let i = 0; i < n; i++) {
    const p0 = p[(i - 1 + n) % n];
    const p1 = p[i];
    const p2 = p[(i + 1) % n];
    const p3 = p[(i + 2) % n];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += `C${f(c1x)},${f(c1y)} ${f(c2x)},${f(c2y)} ${f(p2[0])},${f(p2[1])}`;
  }
  return d + 'Z';
}

function burst(cx: number, cy: number, R: number, r: number, spikes: number) {
  let d = '';
  for (let i = 0; i < spikes * 2; i++) {
    const a = (i / (spikes * 2)) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 ? r : R;
    const x = (cx + Math.cos(a) * rr).toFixed(1);
    const y = (cy + Math.sin(a) * rr).toFixed(1);
    d += `${i ? 'L' : 'M'}${x},${y}`;
  }
  return d + 'Z';
}

function wave(x0: number, x1: number, y: number, amp: number, len: number) {
  let d = `M${x0},${y}`;
  for (let x = x0; x < x1; x += len) {
    d += `Q${x + len / 4},${y - amp} ${x + len / 2},${y} T${x + len},${y}`;
  }
  return d;
}

function sparkle(cx: number, cy: number, r: number): string {
  const k = r * 0.22;
  return (
    `M${cx},${cy - r}Q${cx + k},${cy - k} ${cx + r},${cy}` +
    `Q${cx + k},${cy + k} ${cx},${cy + r}Q${cx - k},${cy + k} ${cx - r},${cy}` +
    `Q${cx - k},${cy - k} ${cx},${cy - r}Z`
  );
}

const FLOWER = [
  '....XXX....',
  '...X...X...',
  '...X...X...',
  '.XX.X.X.XX.',
  'X..X...X..X',
  'X...XXX...X',
  'X..X...X..X',
  '.XX.X.X.XX.',
  '...X...X...',
  '...X...X...',
  '....XXX....',
];

/** A small pixel-art flower. */
function Pixels({
  x,
  y,
  cell,
  fill,
}: {
  x: number;
  y: number;
  cell: number;
  fill: string;
}) {
  const out: React.ReactNode[] = [];
  FLOWER.forEach((row, j) =>
    [...row].forEach((ch, i) => {
      if (ch === 'X') {
        out.push(
          <Rect
            key={`${i}:${j}`}
            x={x + i * cell}
            y={y + j * cell}
            width={cell}
            height={cell}
            fill={fill}
          />,
        );
      }
    }),
  );
  return <>{out}</>;
}

/** A tube squiggle: a dark outline under a gradient stroke. */
function Tube({
  d,
  grad,
  ink,
  w = 16,
}: {
  d: string;
  grad: string;
  ink: string;
  w?: number;
}) {
  return (
    <>
      <Path
        d={d}
        fill="none"
        stroke={ink}
        strokeWidth={w + 7}
        strokeLinecap="round"
      />
      <Path
        d={d}
        fill="none"
        stroke={`url(#${grad})`}
        strokeWidth={w}
        strokeLinecap="round"
      />
    </>
  );
}

function Grad({
  id,
  from,
  to,
  x2 = 1,
  y2 = 1,
}: {
  id: string;
  from: string;
  to: string;
  x2?: number;
  y2?: number;
}) {
  return (
    <LinearGradient id={id} x1="0" y1="0" x2={String(x2)} y2={String(y2)}>
      <Stop offset="0" stopColor={from} />
      <Stop offset="1" stopColor={to} />
    </LinearGradient>
  );
}

/** A full-canvas drawing layer. */
function Layer({h, children}: {h: number; children: React.ReactNode}) {
  return (
    <Svg
      width={CW}
      height={h}
      viewBox={`0 0 ${CW} ${h}`}
      style={StyleSheet.absoluteFill}>
      {children}
    </Svg>
  );
}

/** A rotation that runs forever while mounted (none with reduce motion). */
function useTurn(ms: number) {
  const reduce = useReducedMotion();
  const turn = useSharedValue(0);
  useEffect(() => {
    if (!reduce) {
      turn.value = withRepeat(
        withTiming(360, {duration: ms, easing: Easing.linear}),
        -1,
      );
    }
    return () => cancelAnimation(turn);
  }, [turn, ms, reduce]);
  return useAnimatedStyle(() => ({
    transform: [{rotate: `${turn.value}deg`}],
  }));
}

/**
 * Artwork that turns slowly on its own centre: its own small Svg inside a
 * rotating view, with the viewBox offset so the shape keeps the canvas
 * coordinates it was drawn in.
 */
function Spin({
  cx,
  cy,
  r,
  ms = 40000,
  children,
}: {
  cx: number;
  cy: number;
  r: number;
  ms?: number;
  children: React.ReactNode;
}) {
  const style = useTurn(ms);
  return (
    <Animated.View
      style={[
        styles.abs,
        {left: cx - r, top: cy - r, width: 2 * r, height: 2 * r},
        style,
      ]}>
      <Svg
        width={2 * r}
        height={2 * r}
        viewBox={`${cx - r} ${cy - r} ${2 * r} ${2 * r}`}>
        {children}
      </Svg>
    </Animated.View>
  );
}

/** A round view (the record's label) turning with the record. */
function SpinningLabel({
  cx,
  cy,
  r,
  children,
}: {
  cx: number;
  cy: number;
  r: number;
  children: React.ReactNode;
}) {
  const style = useTurn(6000);
  return (
    <Animated.View
      style={[
        styles.abs,
        {left: cx - r, top: cy - r, width: 2 * r, height: 2 * r},
        style,
      ]}>
      {children}
    </Animated.View>
  );
}

/** A cover, or the title's initials on the palette when there is none. */
function Cover({
  uri,
  size,
  title,
  pal,
  round = false,
}: {
  uri?: string;
  size: number;
  title: string;
  pal: Pal;
  round?: boolean;
}) {
  const box = {
    width: size,
    height: size,
    borderRadius: round ? size / 2 : size * 0.08,
  };
  if (uri) {
    return <Image source={{uri}} style={box} />;
  }
  const words = title.split(/[\s,]+/).filter(Boolean);
  const ini = ((words[0]?.[0] ?? '') + (words[1]?.[0] ?? '')).toUpperCase();
  return (
    <View style={[box, styles.clip]}>
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <Defs>
          <Grad id="cv" from={pal.a} to={pal.b} />
        </Defs>
        <Rect width="100" height="100" fill="url(#cv)" />
        <SvgText
          x="10"
          y="88"
          fontFamily={FONT}
          fontWeight="800"
          fontSize="38"
          fill="#fff">
          {ini}
        </SvgText>
      </Svg>
    </View>
  );
}

/** One entrance per card: the words rise in turn. */
function Rise({
  i,
  children,
  style,
}: {
  i: number;
  children: React.ReactNode;
  style?: object;
}) {
  return (
    <Animated.View
      style={style}
      entering={FadeInUp.duration(500)
        .delay(i * 80)
        .reduceMotion(ReduceMotion.System)}>
      {children}
    </Animated.View>
  );
}

/** A top-five row. The ranks are a real order. */
function Row({
  i,
  title,
  sub,
  uri,
  n,
  pal,
  round,
}: {
  i: number;
  title: string;
  sub?: string;
  uri?: string;
  n: number;
  pal: Pal;
  round?: boolean;
}) {
  const ink = {color: pal.ink};
  return (
    <View style={styles.li}>
      <Text style={[styles.liN, ink, i === 0 && styles.liNTop]}>{i + 1}</Text>
      <Cover
        uri={uri}
        size={i ? 50 : 62}
        title={title}
        pal={pal}
        round={round}
      />
      <View style={styles.liText}>
        <Text
          style={[styles.liA, ink, i === 0 && styles.liATop]}
          numberOfLines={1}>
          {title}
        </Text>
        {!!sub && (
          <Text style={[styles.liB, ink]} numberOfLines={1}>
            {sub}
          </Text>
        )}
      </View>
      <Text style={[styles.liC, ink]}>{n}</Text>
    </View>
  );
}

type Card = {
  key: string;
  draw: (p: Pal, h: number) => React.ReactNode;
};

/** A vertical position from the 760-tall design, spread over height `h`. */
const at760 = (h: number) => (v: number) => (v * h) / 760;

// ── The cards ───────────────────────────────────────────────────────────
function buildCards(r: Recap, faces: Record<string, string>): Card[] {
  const week = r.mode === 'week';
  // A real photo when one is known; the stats only ever had a cover.
  const face = (a: ArtistCount) => faces[a.name] || a.image;

  if (!r.songs) {
    return [
      {
        key: 'empty',
        draw: (p, h) => (
          <>
            <Spin cx={250} cy={h * 0.36} r={150}>
              <Path d={blob(250, h * 0.36, 130, 0.22, 9, 4)} fill={p.a} />
            </Spin>
            <Layer h={h}>
              <Path d={sparkle(70, h * 0.2, 18)} fill={p.c} />
            </Layer>
            <View style={[styles.content, styles.bottom]}>
              <Rise i={0}>
                <Text style={[styles.h1, {color: p.ink}]}>
                  Nothing to recap yet
                </Text>
              </Rise>
              <Rise i={1}>
                <Text style={[styles.line, {color: p.ink}]}>
                  Play a few songs. Each one counts once you have listened for
                  30 seconds.
                </Text>
              </Rise>
            </View>
          </>
        ),
      },
    ];
  }

  const cards: Card[] = [];
  const now = Date.now();

  cards.push({
    key: 'intro',
    draw: (p, h) => {
      const Y = at760(h);
      const ink = {color: p.ink};
      return (
        <>
          <Spin cx={262} cy={Y(300)} r={148}>
            <Path d={burst(262, Y(300), 146, 88, 13)} fill={p.a} />
          </Spin>
          <Layer h={h}>
            <Defs>
              <Grad id="g1" from={p.a} to={p.c} y2={0} />
            </Defs>
            <Path d={blob(262, Y(300), 72, 0.18, 9, 3)} fill={p.b} />
            <Tube d={wave(-40, 420, Y(118), 30, 150)} grad="g1" ink={p.ink} />
            <Pixels x={18} y={Y(196)} cell={9} fill={p.c} />
          </Layer>
          <View style={[styles.content, styles.bottom]}>
            <Rise i={0}>
              <Text style={[styles.lbl, ink]}>
                {week
                  ? `${dayMonth(now - 6 * 24 * 60 * 60 * 1000)} to ${dayMonth(
                      now,
                    )}`
                  : 'Everything you have played'}
              </Text>
            </Rise>
            <Rise i={1}>
              <Text style={[styles.fig, styles.fig120, ink]}>{r.songs}</Text>
            </Rise>
            <Rise i={2}>
              <Text style={[styles.h1, ink]}>
                {r.songs === 1 ? 'song' : 'songs'}
                {week ? ' this week' : ' and counting'}
              </Text>
            </Rise>
            {week && r.minutes != null && (
              <Rise i={3}>
                <Text style={[styles.line, ink]}>
                  {`${duration(r.minutes)} of music.`}
                </Text>
              </Rise>
            )}
          </View>
        </>
      );
    },
  });

  if (r.topSong) {
    const t = r.topSong.track;
    const count = r.topSong.count;
    const hotDay = r.topSongDay;
    cards.push({
      key: 'song',
      draw: (p, h) => {
        const Y = at760(h);
        const cy = Y(392);
        const ink = {color: p.ink};
        // Monday first, as a week is read; the dot marks the day it was
        // played most.
        const order = [1, 2, 3, 4, 5, 6, 0];
        const ring = order.map((wd, i) => {
          const a = (i / 7) * 360 - 90;
          const rad = (a * Math.PI) / 180;
          const lx = 180 + Math.cos(rad) * 94;
          const ly = cy + Math.sin(rad) * 94;
          const ta = rad + Math.PI / 7;
          return (
            <React.Fragment key={wd}>
              <SvgText
                x={lx}
                y={ly + 4}
                textAnchor="middle"
                fontFamily={FONT}
                fontSize="11"
                fontWeight="800"
                fill={p.ink}
                transform={`rotate(${a + 90} ${lx} ${ly})`}>
                {DAYS[wd].slice(0, 3).toUpperCase()}
              </SvgText>
              <Line
                x1={180 + Math.cos(ta) * 84}
                y1={cy + Math.sin(ta) * 84}
                x2={180 + Math.cos(ta) * 106}
                y2={cy + Math.sin(ta) * 106}
                stroke={p.ink}
                strokeWidth={1.5}
                opacity={0.5}
              />
            </React.Fragment>
          );
        });
        const hot =
          hotDay >= 0
            ? (order.indexOf(hotDay) / 7) * Math.PI * 2 - Math.PI / 2
            : null;
        return (
          <>
            <Spin cx={180} cy={cy} r={170}>
              <Defs>
                <Grad id="g2" from={p.a} to={p.b} />
              </Defs>
              <Path d={blob(180, cy, 158, 0.2, 11, 7)} fill="url(#g2)" />
            </Spin>
            <Layer h={h}>
              <Defs>
                <Grad id="g2b" from={p.c} to={p.b} y2={0} />
              </Defs>
              <Circle cx={180} cy={cy} r={112} fill={p.bg} />
              {ring}
              {hot != null && (
                <Circle
                  cx={180 + Math.cos(hot) * 124}
                  cy={cy + Math.sin(hot) * 124}
                  r={9}
                  fill={p.ink}
                />
              )}
              <Tube
                d={`M390,${Y(196)} C320,${Y(170)} 360,${Y(262)} 286,${Y(246)}`}
                grad="g2b"
                ink={p.ink}
                w={12}
              />
              <Path d={sparkle(62, Y(250), 16)} fill={p.c} />
            </Layer>
            <View style={[styles.songCover, {top: cy - 60}]}>
              <Cover
                uri={getBestArtworkUrl(t)}
                size={120}
                title={t.title}
                pal={p}
              />
            </View>
            <View style={[styles.content, styles.center]}>
              <Rise i={0}>
                <Text style={[styles.lbl, styles.centerText, ink]}>
                  {week ? 'Your song of the week' : 'Your most played song'}
                </Text>
              </Rise>
              <Rise i={1}>
                <Text
                  style={[styles.h1, styles.h32, styles.centerText, ink]}
                  numberOfLines={2}
                  adjustsFontSizeToFit
                  minimumFontScale={0.6}>
                  {t.title}
                </Text>
              </Rise>
              <View style={styles.fill} />
              <Rise i={2}>
                <Text
                  style={[styles.line, styles.centerText, ink]}
                  numberOfLines={1}>
                  {t.artist}
                </Text>
              </Rise>
              <Rise i={3}>
                <Text style={[styles.h1, styles.h30, styles.centerText, ink]}>
                  {`Played ${times(count)}`}
                </Text>
              </Rise>
            </View>
          </>
        );
      },
    });
  }

  if (r.topSongs.length > 1) {
    cards.push({
      key: 'songs',
      draw: (p, h) => (
        <>
          <Layer h={h}>
            <SvgText
              x={392}
              y={h - 18}
              textAnchor="end"
              fontFamily={FONT}
              fontSize="470"
              fontWeight="800"
              fill="none"
              stroke={p.a}
              strokeWidth={4}>
              5
            </SvgText>
            <Circle
              cx={360}
              cy={0}
              r={120}
              fill="none"
              stroke={p.b}
              strokeWidth={22}
            />
            <Circle
              cx={360}
              cy={0}
              r={72}
              fill="none"
              stroke={p.c}
              strokeWidth={22}
            />
            <Path d={sparkle(40, h - 60, 14)} fill={p.b} />
          </Layer>
          <View style={[styles.content, styles.listTop]}>
            <Rise i={0}>
              <Text style={[styles.h1, styles.h34, {color: p.ink}]}>
                {week ? 'Your top songs this week' : 'Your top songs'}
              </Text>
            </Rise>
            <Rise i={1} style={styles.list}>
              {r.topSongs.map((s, i) => (
                <Row
                  key={`${i}:${s.track.title}`}
                  i={i}
                  title={s.track.title}
                  sub={s.track.artist}
                  uri={getBestArtworkUrl(s.track)}
                  n={s.count}
                  pal={p}
                />
              ))}
            </Rise>
          </View>
        </>
      ),
    });
  }

  if (r.topArtist) {
    const a = r.topArtist;
    cards.push({
      key: 'artist',
      draw: (p, h) => {
        const cy = at760(h)(380);
        const rays = Array.from({length: 32}, (_, i) => {
          const a0 = (i / 32) * Math.PI * 2;
          const a1 = ((i + 0.5) / 32) * Math.PI * 2;
          const x0 = 180 + Math.cos(a0) * 560;
          const y0 = cy + Math.sin(a0) * 560;
          const x1 = 180 + Math.cos(a1) * 560;
          const y1 = cy + Math.sin(a1) * 560;
          return (
            <Path
              key={i}
              d={`M180,${cy} L${x0},${y0} L${x1},${y1}Z`}
              fill={i % 2 ? p.a : p.c}
            />
          );
        });
        return (
          <>
            <Spin cx={180} cy={cy} r={560}>
              {rays}
            </Spin>
            <Layer h={h}>
              <Circle cx={180} cy={cy} r={118} fill={p.bg} />
              <Circle
                cx={180}
                cy={cy}
                r={118}
                fill="none"
                stroke={p.b}
                strokeWidth={10}
              />
            </Layer>
            <View style={[styles.artistFace, {top: cy - 96}]}>
              <Cover uri={face(a)} size={192} title={a.name} pal={p} round />
            </View>
            <View style={[styles.content, styles.center]}>
              <Rise i={0} style={[styles.pill, {backgroundColor: p.bg}]}>
                <Text style={[styles.lbl, {color: p.ink}]}>
                  {week ? 'Your artist of the week' : 'Your most played artist'}
                </Text>
              </Rise>
              <View style={styles.fill} />
              <Rise i={1} style={[styles.plate, {backgroundColor: p.bg}]}>
                <Text
                  style={[styles.h1, styles.centerText, {color: p.ink}]}
                  numberOfLines={2}
                  adjustsFontSizeToFit
                  minimumFontScale={0.6}>
                  {a.name}
                </Text>
                <Text
                  style={[styles.line, styles.centerText, {color: p.ink}]}>
                  {`${a.count} ${a.count === 1 ? 'play' : 'plays'}${
                    week ? ' this week' : ''
                  }.`}
                </Text>
              </Rise>
            </View>
          </>
        );
      },
    });
  }

  if (r.topArtists.length > 1) {
    cards.push({
      key: 'artists',
      draw: (p, h) => {
        const check: React.ReactNode[] = [];
        for (let j = 0; j < Math.ceil(h / 18); j++) {
          for (let i = 0; i < 2; i++) {
            if ((i + j) % 2) {
              check.push(
                <Rect
                  key={`${i}:${j}`}
                  x={i * 18}
                  y={j * 18}
                  width={18}
                  height={18}
                  fill={j % 6 < 3 ? p.a : p.b}
                />,
              );
            }
          }
        }
        return (
          <>
            <Layer h={h}>{check}</Layer>
            <Spin cx={330} cy={h - 60} r={140}>
              <Path d={blob(330, h - 60, 110, 0.25, 8, 11)} fill={p.c} />
            </Spin>
            <View style={[styles.content, styles.listTop, styles.besideStrip]}>
              <Rise i={0}>
                <Text style={[styles.h1, styles.h34, {color: p.ink}]}>
                  {week ? 'Your top artists this week' : 'Your top artists'}
                </Text>
              </Rise>
              <Rise i={1} style={styles.list}>
                {r.topArtists.map((a, i) => (
                  <Row
                    key={`${i}:${a.name}`}
                    i={i}
                    title={a.name}
                    uri={face(a)}
                    n={a.count}
                    pal={p}
                    round
                  />
                ))}
              </Rise>
            </View>
          </>
        );
      },
    });
  }

  if (week && r.days && r.minutes != null) {
    const days = r.days;
    const minutes = r.minutes;
    const max = Math.max(1, ...days.map(d => d.songs));
    const big = r.busiest >= 0 ? days[r.busiest] : null;
    cards.push({
      key: 'time',
      draw: (p, h) => {
        const Y = at760(h);
        const base = h - 150;
        return (
          <>
            <Layer h={h}>
              <Defs>
                <Grad id="g6" from={p.b} to={p.a} x2={0} />
              </Defs>
              {[0, 1, 2, 3].map(i => (
                <Path
                  key={i}
                  d={wave(-40, 420, Y(110) + i * 26, 10, 60)}
                  fill="none"
                  stroke={i % 2 ? p.a : p.c}
                  strokeWidth={6}
                  strokeLinecap="round"
                />
              ))}
              {days.map((d, i) => {
                const bh = Math.max(8, (d.songs / max) * 200);
                const on = i === r.busiest;
                return (
                  <React.Fragment key={d.at}>
                    <Rect
                      x={28 + i * 45}
                      y={base - bh}
                      width={36}
                      height={bh}
                      rx={18}
                      fill={on ? 'url(#g6)' : p.ink}
                      opacity={on ? 1 : 0.18}
                    />
                    <SvgText
                      x={46 + i * 45}
                      y={base + 26}
                      textAnchor="middle"
                      fontFamily={FONT}
                      fontSize="13"
                      fontWeight="800"
                      fill={p.ink}>
                      {DAYS[new Date(d.at).getDay()].slice(0, 1)}
                    </SvgText>
                  </React.Fragment>
                );
              })}
            </Layer>
            <View style={[styles.content, {paddingTop: Y(250)}]}>
              <Rise i={0}>
                <Text style={[styles.lbl, {color: p.ink}]}>
                  You listened for
                </Text>
              </Rise>
              <Rise i={1}>
                <Text style={[styles.fig, styles.fig64, {color: p.ink}]}>
                  {duration(minutes)}
                </Text>
              </Rise>
              <View style={styles.fill} />
              {big && (
                <Rise i={2}>
                  <Text style={[styles.line, {color: p.ink}]}>
                    {`${
                      DAYS[new Date(big.at).getDay()]
                    } was your biggest day, with ${big.songs} ${
                      big.songs === 1 ? 'song' : 'songs'
                    }.`}
                  </Text>
                </Rise>
              )}
            </View>
          </>
        );
      },
    });
  }

  if (
    week &&
    r.minutes != null &&
    r.lastMinutes != null &&
    r.lastMinutes > 0
  ) {
    const nowM = r.minutes;
    const lastM = r.lastMinutes;
    const diff = nowM - lastM;
    const pct = Math.round((Math.abs(diff) / lastM) * 100);
    cards.push({
      key: 'vs',
      draw: (p, h) => {
        const Y = at760(h);
        // Areas to scale: the bigger week gets the full circle.
        const top = Math.max(nowM, lastM);
        const rNow = 128 * Math.sqrt(nowM / top);
        const rLast = 128 * Math.sqrt(lastM / top);
        const label = (x: number, y: number, size: number, text: string) => (
          <SvgText
            x={x}
            y={y}
            textAnchor="middle"
            fontFamily={FONT}
            fontSize={String(size)}
            fontWeight="800"
            fill={p.ink}>
            {text}
          </SvgText>
        );
        return (
          <>
            <Layer h={h}>
              <Circle cx={130} cy={Y(470)} r={rLast} fill={p.b} />
              <Circle
                cx={218}
                cy={Y(486)}
                r={rNow}
                fill={p.a}
                opacity={0.92}
              />
              {label(100, Y(420), 13, 'Last week')}
              {label(100, Y(440), 16, duration(lastM))}
              {label(240, Y(500), 14, 'This week')}
              {label(240, Y(526), 22, duration(nowM))}
              <Pixels x={270} y={Y(640)} cell={8} fill={p.c} />
            </Layer>
            <View style={[styles.content, styles.listTop]}>
              <Rise i={0}>
                <Text style={[styles.lbl, {color: p.ink}]}>
                  Compared with last week
                </Text>
              </Rise>
              <Rise i={1}>
                <Text
                  style={[styles.fig, styles.fig76, {color: p.ink}]}
                  numberOfLines={1}
                  adjustsFontSizeToFit>
                  {diff >= 0 ? `+${duration(diff)}` : `-${duration(-diff)}`}
                </Text>
              </Rise>
              <Rise i={2}>
                <Text style={[styles.line, {color: p.ink}]}>
                  {diff >= 0
                    ? `${pct}% more music than last week.`
                    : `${pct}% less music than last week.`}
                </Text>
              </Rise>
            </View>
          </>
        );
      },
    });
  }

  if (r.onRepeat) {
    const o = r.onRepeat;
    cards.push({
      key: 'repeat',
      draw: (p, h) => {
        const cy = at760(h)(400);
        const arc = `M60,${cy - 150} A150,150 0 0 1 312,${cy - 100}`;
        const grooves = Array.from({length: 9}, (_, i) => (
          <Circle
            key={i}
            cx={180}
            cy={cy}
            r={66 + i * 9}
            fill="none"
            stroke="rgba(255,255,255,0.09)"
            strokeWidth={1.5}
          />
        ));
        return (
          <>
            <Layer h={h}>
              <Defs>
                <Grad id="g8" from={p.a} to={p.c} y2={0} />
              </Defs>
              <Path
                d={arc}
                fill="none"
                stroke={p.ink}
                strokeWidth={20}
                strokeLinecap="round"
              />
              <Path
                d={arc}
                fill="none"
                stroke="url(#g8)"
                strokeWidth={12}
                strokeLinecap="round"
              />
              <Path
                d={`M296,${cy - 130} L330,${cy - 100} L292,${cy - 82}Z`}
                fill={p.ink}
              />
            </Layer>
            <Spin cx={180} cy={cy} r={148} ms={6000}>
              <Circle cx={180} cy={cy} r={148} fill="#121016" />
              {grooves}
            </Spin>
            {/* The record's label is the song's own cover, turning with it. */}
            <SpinningLabel cx={180} cy={cy} r={54}>
              <Cover
                uri={getBestArtworkUrl(o.track)}
                size={108}
                title={o.track.title}
                pal={p}
                round
              />
            </SpinningLabel>
            <View style={[styles.content, styles.center]}>
              <Rise i={0}>
                <Text style={[styles.lbl, styles.centerText, {color: p.ink}]}>
                  {`On ${
                    DAYS[new Date(o.day).getDay()]
                  } you could not stop playing`}
                </Text>
              </Rise>
              <View style={styles.fill} />
              <Rise i={1}>
                <Text
                  style={[styles.h1, styles.centerText, {color: p.ink}]}
                  numberOfLines={2}
                  adjustsFontSizeToFit
                  minimumFontScale={0.6}>
                  {o.track.title}
                </Text>
              </Rise>
              <Rise i={2}>
                <Text
                  style={[styles.line, styles.centerText, {color: p.ink}]}>
                  {`${o.count} times in one day.`}
                </Text>
              </Rise>
            </View>
          </>
        );
      },
    });
  }

  if (r.discoveries.length) {
    const d = r.discoveries;
    cards.push({
      key: 'new',
      draw: (p, h) => {
        const R = rng(5);
        const stars = Array.from({length: 14}, (_, i) => (
          <Path
            key={i}
            d={sparkle(20 + R() * 320, 90 + R() * (h - 140), 6 + R() * 18)}
            fill={[p.a, p.b, p.c][i % 3]}
          />
        ));
        const tilts = [-6, 4, -3];
        return (
          <>
            <Layer h={h}>{stars}</Layer>
            <View style={[styles.content, styles.middle]}>
              <Rise i={0}>
                <Text style={[styles.lbl, {color: p.ink}]}>
                  New to you this week
                </Text>
              </Rise>
              <Rise i={1}>
                <Text style={[styles.fig, styles.fig130, {color: p.ink}]}>
                  {d.length}
                </Text>
              </Rise>
              <Rise i={2}>
                <Text style={[styles.h1, {color: p.ink}]}>
                  {d.length === 1 ? 'new artist' : 'new artists'}
                </Text>
              </Rise>
              <Rise i={3} style={styles.pills}>
                {d.slice(0, 3).map((a, i) => (
                  <View
                    key={a.name}
                    style={[
                      styles.pill,
                      {
                        backgroundColor: [p.a, p.b, p.c][i % 3],
                        marginLeft: i * 28,
                        transform: [{rotate: `${tilts[i % 3]}deg`}],
                      },
                    ]}>
                    <Text style={styles.pillText} numberOfLines={1}>
                      {a.name}
                    </Text>
                  </View>
                ))}
                {d.length > 3 && (
                  <Text style={[styles.line, {color: p.ink}]}>
                    {`and ${d.length - 3} more`}
                  </Text>
                )}
              </Rise>
            </View>
          </>
        );
      },
    });
  }

  if (r.persona) {
    const persona = r.persona;
    const night =
      persona.name === 'Night owl' || persona.name === 'After-hours listener';
    cards.push({
      key: 'hour',
      draw: (p, h) => {
        const top = at760(h)(176);
        const fh = 360;
        const cx = 180;
        const cy = top + 190;
        const max = Math.max(1, ...r.hours);
        const near = (hr: number) =>
          r.peakHour >= 0 &&
          Math.min(
            Math.abs(hr - r.peakHour),
            24 - Math.abs(hr - r.peakHour),
          ) <= 1;
        const R = rng(9);
        return (
          <>
            <Layer h={h}>
              <Defs>
                <Grad id="g10" from={p.a} to={p.b} />
                <Grad
                  id="g10s"
                  from={night ? '#1B1446' : '#FFB36B'}
                  to={night ? '#3A1A5E' : '#FF6FA8'}
                  x2={0}
                />
                <Grad id="g10c" from={p.c} to={p.a} y2={0} />
              </Defs>
              <Rect
                x={52}
                y={top}
                width={256}
                height={fh}
                rx={4}
                fill="url(#g10s)"
              />
              {Array.from({length: 18}, (_, i) => (
                <Circle
                  key={i}
                  cx={60 + R() * 240}
                  cy={top + 14 + R() * (fh - 28)}
                  r={0.8 + R() * 1.8}
                  fill="#fff"
                  opacity={night ? 0.8 : 0.5}
                />
              ))}
              {night ? (
                <Path
                  d={`M232,${top + 60} a34,34 0 1 0 22,58 a28,28 0 1 1 -22,-58Z`}
                  fill={p.c}
                />
              ) : (
                <Circle cx={244} cy={top + 84} r={30} fill={p.c} />
              )}
              {r.hours.map((n, hr) => {
                const a = (hr / 24) * Math.PI * 2 - Math.PI / 2;
                const r0 = 46;
                const len = 6 + (n / max) * 40;
                return (
                  <Line
                    key={hr}
                    x1={cx + Math.cos(a) * r0}
                    y1={cy + Math.sin(a) * r0}
                    x2={cx + Math.cos(a) * (r0 + len)}
                    y2={cy + Math.sin(a) * (r0 + len)}
                    stroke={near(hr) ? p.c : 'rgba(255,255,255,0.35)'}
                    strokeWidth={6}
                    strokeLinecap="round"
                  />
                );
              })}
              <SvgText
                x={cx}
                y={cy + 5}
                textAnchor="middle"
                fontFamily={FONT}
                fontSize="13"
                fontWeight="800"
                fill="#fff">
                {hourLabel(r.peakHour)}
              </SvgText>
              <Rect
                x={52}
                y={top}
                width={256}
                height={fh}
                rx={4}
                fill="none"
                stroke="url(#g10)"
                strokeWidth={9}
              />
              <Pixels x={270} y={top - 26} cell={6} fill={p.a} />
              <Tube
                d={`M-20,${top - 26} C50,${top - 72} 110,${top + 20} 176,${
                  top - 26
                }`}
                grad="g10c"
                ink={p.ink}
                w={10}
              />
            </Layer>
            <View
              style={[
                styles.content,
                styles.center,
                {paddingTop: top + fh + 24},
              ]}>
              <Rise i={0}>
                <Text style={[styles.lbl, styles.centerText, {color: p.ink}]}>
                  {week ? 'This week you were' : 'Lately you have been'}
                </Text>
              </Rise>
              <Rise i={1}>
                <Text style={[styles.h1, styles.centerText, {color: p.ink}]}>
                  {persona.name}
                </Text>
              </Rise>
              <Rise i={2}>
                <Text
                  style={[styles.line, styles.centerText, {color: p.ink}]}>
                  {persona.line}
                </Text>
              </Rise>
            </View>
          </>
        );
      },
    });
  }

  if (r.streak >= 2) {
    const {streak, bestStreak} = r;
    cards.push({
      key: 'streak',
      draw: (p, h) => {
        const Y = at760(h);
        const beads = Math.min(bestStreak, 12);
        const step = beads > 1 ? 292 / (beads - 1) : 0;
        return (
          <>
            <Spin cx={250} cy={Y(300)} r={185}>
              <Path d={blob(250, Y(300), 150, 0.22, 10, 21)} fill={p.a} />
            </Spin>
            <Layer h={h}>
              <Path d={burst(250, Y(300), 62, 40, 9)} fill={p.c} />
              {Array.from({length: beads}, (_, i) => {
                const x = 34 + i * step;
                const y = Y(560) + Math.sin(i * 0.9) * 22;
                return i < Math.min(streak, beads) ? (
                  <Circle
                    key={i}
                    cx={x}
                    cy={y}
                    r={11}
                    fill={[p.a, p.b, p.c][i % 3]}
                    stroke={p.ink}
                    strokeWidth={2.5}
                  />
                ) : (
                  <Circle
                    key={i}
                    cx={x}
                    cy={y}
                    r={10}
                    fill="none"
                    stroke={p.ink}
                    strokeWidth={2.5}
                    strokeDasharray="4 3"
                  />
                );
              })}
            </Layer>
            <View style={[styles.content, {paddingTop: Y(150)}]}>
              <Rise i={0}>
                <Text style={[styles.lbl, {color: p.ink}]}>
                  Days in a row with music
                </Text>
              </Rise>
              <Rise i={1}>
                <Text style={[styles.fig, styles.fig170, {color: p.ink}]}>
                  {streak}
                </Text>
              </Rise>
              <View style={styles.fill} />
              <Rise i={2}>
                <Text style={[styles.line, {color: p.ink}]}>
                  {streak >= bestStreak
                    ? 'Your longest run yet. Play something tomorrow to keep it going.'
                    : `Your best is ${bestStreak}. Play something tomorrow to keep it going.`}
                </Text>
              </Rise>
            </View>
          </>
        );
      },
    });
  }

  cards.push({
    key: 'poster',
    draw: (p, h) => {
      const cells: [string, string][] = [['Songs', String(r.songs)]];
      if (r.minutes != null) {
        cells.push(['Listened', duration(r.minutes)]);
      }
      if (r.topArtist) {
        cells.push(['Top artist', r.topArtist.name]);
      }
      if (r.persona) {
        cells.push(['You are', r.persona.name]);
      }
      if (r.streak >= 2) {
        cells.push(['Streak', `${r.streak} days`]);
      }
      const ink = {color: p.ink};
      return (
        <>
          <Layer h={h}>
            <Defs>
              <Grad id="g12" from={p.a} to={p.c} />
            </Defs>
            <Rect
              x={18}
              y={92}
              width={324}
              height={h - 140}
              rx={28}
              fill="none"
              stroke="url(#g12)"
              strokeWidth={10}
            />
          </Layer>
          <Spin cx={332} cy={156} r={80}>
            <Path d={blob(332, 156, 56, 0.25, 7, 31)} fill={p.b} />
          </Spin>
          <View style={[styles.content, styles.poster]}>
            <Rise i={0}>
              <Text style={[styles.lbl, ink]}>
                {week ? 'Your week, in one picture' : 'You, in one picture'}
              </Text>
            </Rise>
            {r.topSong && (
              <Rise i={1} style={styles.li}>
                <Cover
                  uri={getBestArtworkUrl(r.topSong.track)}
                  size={84}
                  title={r.topSong.track.title}
                  pal={p}
                />
                <View style={styles.liText}>
                  <Text style={[styles.liB, ink]}>Top song</Text>
                  <Text style={[styles.posterTitle, ink]} numberOfLines={2}>
                    {r.topSong.track.title}
                  </Text>
                </View>
              </Rise>
            )}
            <Rise i={2} style={styles.grid}>
              {cells.map(([k, v]) => (
                <View key={k} style={styles.cell}>
                  <Text style={[styles.liB, ink]}>{k}</Text>
                  <Text style={[styles.cellValue, ink]} numberOfLines={2}>
                    {v}
                  </Text>
                </View>
              ))}
            </Rise>
            <View style={styles.fill} />
            <Rise i={3} style={styles.sign}>
              <Image
                source={MARK}
                style={[styles.signMark, {tintColor: p.ink}]}
              />
              <Text style={[styles.signText, ink]}>relaxify recap</Text>
            </Rise>
          </View>
        </>
      );
    },
  });

  return cards;
}

/** The art swings in once per card: a slight turn and scale, settling. */
function Canvas({
  h,
  animate,
  children,
}: {
  h: number;
  animate: boolean;
  children: React.ReactNode;
}) {
  const t = useSharedValue(animate ? 0 : 1);
  useEffect(() => {
    t.value = withTiming(1, {
      duration: 700,
      easing: Easing.bezier(0.2, 1.4, 0.4, 1),
    });
  }, [t]);
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [0, 0.4], [0, 1], 'clamp'),
    transform: [
      {scale: interpolate(t.value, [0, 1], [0.88, 1])},
      {rotate: `${(1 - t.value) * -5}deg`},
    ],
  }));
  return (
    <Animated.View style={[{width: CW, height: h}, style]}>
      {children}
    </Animated.View>
  );
}

export function RecapScreen({onClose}: {onClose: () => void}) {
  const stats = useStatsState();
  const [mode, setMode] = useState<RecapMode>('week');
  const recap = useMemo(
    () => buildRecap(stats, Date.now(), mode),
    [stats, mode],
  );
  const faces = useArtistPhotos(recap.topArtists.map(a => a.name));
  const cards = useMemo(() => buildCards(recap, faces), [recap, faces]);

  // The palettes, dealt again each time the Recap opens.
  const [deal] = useState(() => shuffled(PALS));

  const win = useWindowDimensions();
  const [box, setBox] = useState({w: win.width, h: win.height});
  const onLayout = (e: LayoutChangeEvent) => {
    const {width, height} = e.nativeEvent.layout;
    if (width !== box.w || height !== box.h) {
      setBox({w: width, h: height});
    }
  };
  const scale = box.w / CW;
  const logicalH = box.h / scale;

  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const at = Math.min(index, cards.length - 1);
  const card = cards[at];
  const pal = deal[at % deal.length];

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
  const reduce = useReducedMotion();
  const drag = useSharedValue(reduce ? 0 : box.h * 0.12);
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
        box.h,
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
    [drag, box.h, onClose],
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
        if (e.translationY > box.h * 0.2 || e.velocityY > 900) {
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
          runOnJS(go)(e.x < box.w * 0.32 ? -1 : 1);
        }
      });
    return Gesture.Race(pan, hold, tap);
  }, [drag, box.h, box.w, dismiss, go]);

  // Pulled down, the story shrinks and rounds off like a card being lifted
  // away, the way the full player folds into the mini player.
  const sheet = useAnimatedStyle(() => {
    const p = Math.min(1, drag.value / box.h);
    return {
      opacity: interpolate(p, [0, 0.6, 1], [1, 0.9, 0]),
      borderRadius: interpolate(p, [0, 0.15], [0, 28], 'clamp'),
      transform: [
        {translateY: drag.value * 0.9},
        {scale: interpolate(p, [0, 1], [1, 0.82])},
      ],
    };
  });

  const ink = {color: pal.ink};
  return (
    <Animated.View
      style={[styles.wrap, {backgroundColor: pal.bg}, sheet]}
      onLayout={onLayout}>
      <GestureDetector gesture={gesture}>
        <View style={styles.stage}>
          {/* The 360-wide canvas, scaled about its centre to fill the screen. */}
          <View
            style={[
              styles.canvas,
              {
                height: logicalH,
                left: (box.w - CW) / 2,
                top: (box.h - logicalH) / 2,
                transform: [{scale}],
              },
            ]}>
            <Canvas key={`${mode}:${card.key}`} h={logicalH} animate={!reduce}>
              {card.draw(pal, logicalH)}
            </Canvas>
          </View>
        </View>
      </GestureDetector>

      {/* Over the stage but outside the gesture, so the switch is a plain
          button and a tap on it is never also a "next card". */}
      <View style={styles.chrome} pointerEvents="box-none">
        <View style={styles.bars} pointerEvents="none">
          {cards.map((c, i) => (
            <View
              key={c.key}
              style={[styles.bar, {backgroundColor: `${pal.ink}33`}]}>
              {i < at && (
                <View style={[styles.barFill, {backgroundColor: pal.ink}]} />
              )}
              {i === at && (
                <Animated.View
                  style={[styles.barFill, {backgroundColor: pal.ink}, fill]}
                />
              )}
            </View>
          ))}
        </View>
        <View style={styles.row}>
          {/* The watermark: the same corner on every card. */}
          <View style={styles.mark} pointerEvents="none">
            <Image
              source={MARK}
              style={[styles.markIcon, {tintColor: pal.ink}]}
            />
            <Text style={[styles.markText, ink]}>Relaxify</Text>
          </View>
          <View style={styles.modes}>
            {(['week', 'all'] as const).map(m => {
              const on = m === mode;
              return (
                <TouchableOpacity
                  key={m}
                  onPress={() => pick(m)}
                  style={[
                    styles.mode,
                    {borderColor: pal.ink},
                    on && {backgroundColor: pal.ink},
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{selected: on}}>
                  <Text
                    style={[styles.modeText, {color: on ? pal.bg : pal.ink}]}>
                    {m === 'week' ? 'This week' : 'All time'}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>
      <View
        style={[styles.grip, {backgroundColor: pal.ink}]}
        pointerEvents="none"
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {flex: 1, overflow: 'hidden'},
  stage: {flex: 1},
  canvas: {position: 'absolute', width: CW},
  abs: {position: 'absolute'},
  songCover: {position: 'absolute', left: 120},
  artistFace: {position: 'absolute', left: 84},
  clip: {overflow: 'hidden'},
  fill: {flex: 1},
  // The words sit inside the canvas, in its units.
  content: {
    ...StyleSheet.absoluteFillObject,
    paddingTop: 96,
    paddingHorizontal: 26,
    paddingBottom: 60,
  },
  bottom: {justifyContent: 'flex-end', paddingBottom: 64, gap: 4},
  middle: {justifyContent: 'center', gap: 4},
  center: {alignItems: 'center'},
  centerText: {textAlign: 'center'},
  listTop: {paddingTop: 110},
  besideStrip: {paddingLeft: 58},
  poster: {paddingTop: 124, paddingHorizontal: 42, paddingBottom: 70, gap: 14},
  chrome: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 14,
    paddingHorizontal: 16,
    gap: 14,
  },
  bars: {flexDirection: 'row', gap: 4},
  bar: {flex: 1, height: 3.5, borderRadius: 2, overflow: 'hidden'},
  barFill: {height: '100%', width: '100%'},
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  mark: {flexDirection: 'row', alignItems: 'center', gap: 7},
  markIcon: {width: 24, height: 24},
  markText: {fontSize: 15.5, fontWeight: '800', letterSpacing: -0.2},
  modes: {flexDirection: 'row', gap: 4},
  mode: {
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1.5,
  },
  modeText: {fontSize: 12.5, fontWeight: '800'},
  grip: {
    position: 'absolute',
    bottom: 14,
    alignSelf: 'center',
    width: 40,
    height: 5,
    borderRadius: 3,
    opacity: 0.4,
  },
  lbl: {fontSize: 16, fontWeight: '800', letterSpacing: -0.2},
  h1: {fontSize: 40, lineHeight: 43, fontWeight: '800', letterSpacing: -1.4},
  h30: {fontSize: 30, lineHeight: 34},
  h32: {fontSize: 32, lineHeight: 36, marginTop: 4},
  h34: {fontSize: 34, lineHeight: 37},
  fig: {fontWeight: '800', letterSpacing: -3},
  fig64: {fontSize: 64, lineHeight: 70, letterSpacing: -2.5},
  fig76: {fontSize: 76, lineHeight: 82},
  fig120: {fontSize: 120, lineHeight: 118, letterSpacing: -6},
  fig130: {fontSize: 130, lineHeight: 128, letterSpacing: -6},
  fig170: {fontSize: 170, lineHeight: 166, letterSpacing: -8},
  line: {fontSize: 16, lineHeight: 23, fontWeight: '600'},
  list: {gap: 12, marginTop: 14},
  li: {flexDirection: 'row', alignItems: 'center', gap: 12},
  liN: {width: 24, fontSize: 22, fontWeight: '800', textAlign: 'center'},
  liNTop: {fontSize: 30},
  liText: {flex: 1, minWidth: 0},
  liA: {fontSize: 15.5, fontWeight: '800'},
  liATop: {fontSize: 18},
  liB: {fontSize: 12.5, fontWeight: '700', opacity: 0.7},
  liC: {fontSize: 15, fontWeight: '800', fontVariant: ['tabular-nums']},
  pill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
  },
  pillText: {color: DARK, fontSize: 18, fontWeight: '800'},
  pills: {gap: 10, marginTop: 18, alignItems: 'flex-start'},
  plate: {
    borderRadius: 22,
    paddingHorizontal: 20,
    paddingVertical: 14,
    maxWidth: 300,
  },
  posterTitle: {fontSize: 22, lineHeight: 26, fontWeight: '800'},
  grid: {flexDirection: 'row', flexWrap: 'wrap', rowGap: 16, marginTop: 6},
  cell: {width: '50%', paddingRight: 12},
  cellValue: {fontSize: 19, lineHeight: 23, fontWeight: '800'},
  sign: {flexDirection: 'row', alignItems: 'center', gap: 8},
  signMark: {width: 20, height: 20},
  signText: {fontSize: 14, fontWeight: '800'},
});
